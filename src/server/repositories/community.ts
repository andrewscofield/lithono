import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../database/migrations.ts';
import { createEmailOutbox } from './email-outbox.ts';
export interface Article { id: string; title: string; topic: string; kind: string; body: string; state: string; version: number }
export interface Subscription { owner: string; email: string; token: string; state: string; outbox_id: string }
export function createCommunity(db: DatabaseSync) {
  const article = (id: string, editorial = false) => db.prepare(`SELECT * FROM community_posts WHERE id = ? ${editorial ? '' : "AND state = 'published'"}`).get(id) as unknown as Article | undefined;
  const subscription = (owner: string) => db.prepare('SELECT * FROM community_subscriptions WHERE owner = ?').get(owner) as unknown as Subscription | undefined;
  return {
    article, subscription,
    list(topic = '', editorial = false) { return (db.prepare(`SELECT * FROM community_posts ${editorial ? '' : "WHERE state = 'published'"} ORDER BY title`).all() as unknown as Article[]).filter(p => !topic || p.topic === topic); },
    marks(owner: string, id: string) { return db.prepare('SELECT kind FROM community_marks WHERE owner = ? AND post_id = ?').all(owner, id).map(r => String(r.kind)); },
    mark(owner: string, id: string, kind: string, enabled: boolean) {
      const p = article(id); if (!p || !['bookmark','rsvp'].includes(kind) || (kind === 'rsvp' && p.kind !== 'event')) throw new Error('Publication action unavailable');
      if (enabled) db.prepare('INSERT OR IGNORE INTO community_marks VALUES (?,?,?)').run(owner, id, kind);
      else db.prepare('DELETE FROM community_marks WHERE owner = ? AND post_id = ? AND kind = ?').run(owner, id, kind);
    },
    subscribe(owner: string, email: string, origin: string) {
      return transaction(db, () => {
        const old = subscription(owner); if (old && old.state !== 'unsubscribed') return old;
        const token = crypto.randomUUID();
        const outbox = createEmailOutbox(db).enqueue(owner, `newsletter-${token}`, { to: email, subject: 'Confirm your community newsletter subscription', text: `Confirm: ${origin}/community/newsletter/${token}\nUnsubscribe: ${origin}/community/newsletter/${token}?unsubscribe=1\nThese links show a native confirmation form; visiting alone does not change your subscription.` });
        db.prepare("INSERT INTO community_subscriptions VALUES (?,?,?,'pending',?) ON CONFLICT(owner) DO UPDATE SET email=excluded.email,token=excluded.token,state='pending',outbox_id=excluded.outbox_id").run(owner, email, token, outbox.id);
        return subscription(owner)!;
      });
    },
    byToken(token: string) { return db.prepare('SELECT * FROM community_subscriptions WHERE token = ?').get(token) as unknown as Subscription | undefined; },
    lifecycle(token: string, unsubscribe: boolean) { db.prepare(`UPDATE community_subscriptions SET state = ? WHERE token = ? ${unsubscribe ? '' : "AND state = 'pending'"}`).run(unsubscribe ? 'unsubscribed' : 'confirmed', token); },
    save(id: string, title: string, topic: string, body: string, version: number, publish: boolean) {
      return transaction(db, () => {
        const existing = article(id, true);
        if (existing && existing.version !== version) throw new Error('Editorial conflict: reload before reapplying');
        if (!title.trim() || !body.trim() || title.length > 150 || body.length > 10000 || !['platform','events'].includes(topic)) throw new Error('Invalid publication');
        db.prepare("INSERT INTO community_posts VALUES (?,?,?,'article',?,?,1) ON CONFLICT(id) DO UPDATE SET title=excluded.title,topic=excluded.topic,body=excluded.body,state=excluded.state,version=community_posts.version+1").run(id, title, topic, body, publish ? 'published' : 'draft');
        return article(id, true)!;
      });
    },
  };
}
