import { test, expect, type Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
async function signup(page: Page, name: string) {
  await page.goto('/register?next=/community'); await page.getByLabel('Name', { exact: true }).fill(name); await page.getByLabel('Email', { exact: true }).fill(`${name}@example.test`); await page.getByLabel('Password', { exact: true }).fill('community-password-123'); await page.getByRole('button', { name: 'Create account', exact: true }).click();
  // A pathname check cannot accidentally match register?next=/community before
  // the signup request and navigation have actually completed.
  await expect(page).toHaveURL(url => url.pathname === '/community');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}
test('publication supports the default router and native bookmarks RSVP and newsletter pending/retry', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false }); const page = await ctx.newPage();
  await page.goto('/community'); await expect(page.locator('script[src]')).toHaveCount(1); await page.getByLabel('Topic').selectOption('events'); await page.getByRole('button', { name: 'Filter publication' }).click(); await expect(page.getByRole('link', { name: 'A useful native web' })).toHaveCount(0);
  await signup(page,'community-reader'); await page.getByRole('link', { name: 'A useful native web' }).click(); await expect(page.locator('script[src]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Bookmark article' }).click(); await expect(page.getByRole('status')).toHaveText('Bookmarked'); await page.reload(); await expect(page.getByRole('status')).toHaveText('Bookmarked');
  await page.goto('/community/open-studio'); await page.getByRole('button', { name: 'RSVP to event' }).click(); await expect(page.getByRole('status')).toContainText('RSVP recorded');
  await page.goto('/community'); await page.getByRole('button', { name: 'Subscribe to newsletter' }).click(); await expect(page.getByRole('status')).toContainText('pending · Email failed'); await page.getByRole('button', { name: 'Retry newsletter confirmation' }).click(); await expect(page.getByRole('status')).toContainText('pending');
  expect((await page.request.get('/community/editor')).status()).toBe(403); await ctx.close();
});
test('newsletter email link requires explicit native confirmation, repeated confirmation and unsubscribe are idempotent', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false }); const page = await ctx.newPage();
  await signup(page, 'community-newsletter'); await page.getByRole('button', { name: 'Subscribe to newsletter' }).click();
  await expect(page.getByRole('status')).toContainText('pending · Resend accepted');
  // Test-only durable record inspection; no token-disclosure fixture exists on the app.
  const db = new DatabaseSync(process.env.LITHONO_TEST_DATABASE!);
  const row = db.prepare('SELECT token FROM community_subscriptions WHERE email = ?').get('community-newsletter@example.test')!; db.close();
  const path = `/community/newsletter/${row.token}`;
  await page.goto(path); await expect(page.getByRole('status')).toHaveText('pending');
  await page.getByRole('button', { name: 'Confirm newsletter subscription' }).click(); await expect(page.getByRole('status')).toHaveText('confirmed');
  await page.request.post(path + '?_action=confirm', { headers: { Origin: 'http://127.0.0.1:4197' } }); await page.reload(); await expect(page.getByRole('status')).toHaveText('confirmed');
  await page.getByRole('button', { name: 'Unsubscribe from newsletter' }).click(); await expect(page.getByRole('status')).toHaveText('unsubscribed');
  await page.request.post(path + '?_action=confirm', { headers: { Origin: 'http://127.0.0.1:4197' } }); await page.reload(); await expect(page.getByRole('status')).toHaveText('unsubscribed'); await ctx.close();
});
test('role-gated editor saves drafts and explicitly publishes escaped plain text', async ({ page }) => {
  await signup(page,'community-editor');
  expect((await page.request.get('/community/editor')).status()).toBe(403);
  // Provision verified identity in the isolated test DB, never through a public
  // application endpoint. Claiming the allowlisted email at signup is insufficient.
  const db = new DatabaseSync(process.env.LITHONO_TEST_DATABASE!);
  db.prepare('UPDATE user SET emailVerified = 1 WHERE email = ?').run('community-editor@example.test');
  db.close();
  await page.reload(); await page.getByRole('link', { name: 'Editorial desk' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Editorial proof'); await page.getByLabel('Plain-text body').fill('<script>window.untrusted = true</script>\n\nUseful native content.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('draft');
  await expect(page).toHaveURL(/\?edit=/);
  const id = new URL(page.url()).searchParams.get('edit')!;
  expect((await page.request.get(`/community/${id}`)).status()).toBe(404);
  await page.getByRole('button', { name: 'Publish article' }).click(); await expect(page.getByRole('status')).toHaveText('published');
  await page.goto(`/community/${id}`); await expect(page.getByText('<script>window.untrusted = true</script>', { exact: true })).toBeVisible(); expect(await page.evaluate(() => (window as unknown as { untrusted?: unknown }).untrusted)).toBeUndefined(); await expect(page.locator('script[src]')).toHaveCount(1);
});
