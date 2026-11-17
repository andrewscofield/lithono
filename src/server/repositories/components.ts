import { componentQuery } from '../../lib/component-query.ts';
import lightTS from '../../components/directory-counter/directory-counter.ts?raw';
import lightHTML from '../../components/directory-counter/directory-counter.html?raw';
import lightCSS from '../../components/directory-counter/directory-counter.css?raw';
import banner from '../../components/directory-banner/directory-banner.html?raw';
import vanilla from '../../previews/vanilla.ts?raw';
import shadow from '../../previews/shadow.ts?raw';
import native from '../../previews/native.ts?raw';
import host from '../../components/preview-host/preview-host.client.ts?raw';

// Public-source manifest: deliberate literal imports only. No request-derived paths.
const sources = {
  light: [{ name: 'directory-counter.ts', code: lightTS }, { name: 'directory-counter.html', code: lightHTML }, { name: 'directory-counter.css', code: lightCSS }],
  static: [{ name: 'directory-banner.html', code: banner }],
  vanilla: [{ name: 'previews/vanilla.ts', code: vanilla }],
  shadow: [{ name: 'previews/shadow.ts', code: shadow }],
  native: [{ name: 'previews/native.ts (shared fixed fixtures)', code: native }],
  wa: [{ name: 'preview-host.client.ts (ordinary selective imports)', code: host }],
};

const definitions = [
  ['light-counter', 'Light counter', 'Interaction', 'light', 'light', 'Lithono HTML/TS/CSS trio', 'Increment a local count in light DOM.'],
  ['static-banner', 'Static banner', 'Content', 'static', 'static', 'Lithono static fragment', 'Server-rendered content without component JavaScript.'],
  ['vanilla-counter', 'Vanilla counter', 'Interaction', 'light', 'vanilla', 'Ordinary HTMLElement', 'Increment a count using browser DOM APIs.'],
  ['shadow-counter', 'Shadow counter', 'Interaction', 'shadow', 'shadow', 'Ordinary LitElement', 'Increment a count inside an ordinary Lit shadow root.'],
  ['wa-button', 'Web Awesome button', 'Interaction', 'shadow', 'wa', 'Web Awesome', 'Activate a third-party button imported directly from its package.'],
  ['wa-switch', 'Web Awesome switch', 'Forms', 'shadow', 'wa', 'Web Awesome', 'Toggle a third-party switch; form submission compatibility is unknown.'],
  ['native-details', 'Native disclosure', 'Content', 'light', 'native', 'Platform HTML', 'Expand and collapse content with details and summary.'],
  ['native-form', 'Native GET search', 'Forms', 'light', 'native', 'Platform HTML', 'Submit a search to the real directory using a native GET form.'],
  ['native-progress', 'Native progress', 'Feedback', 'light', 'native', 'Platform HTML', 'Display determinate completion with a labeled progress element.'],
  ['native-meter', 'Native meter', 'Feedback', 'light', 'native', 'Platform HTML', 'Display a scalar measurement with a labeled meter.'],
  ['native-dialog', 'Native dialog', 'Interaction', 'light', 'native', 'Platform HTML', 'Open and close a native modal dialog.'],
  ['native-output', 'Native range output', 'Forms', 'light', 'native', 'Platform HTML', 'Change a range and reflect its value in an output.'],
  ['native-validation', 'Native required field', 'Forms', 'light', 'native', 'Platform HTML', 'Exercise required validation and a local submit handler.'],
] as const;

export const componentCatalogue = definitions.map(([slug, name, category, rendering, source, authoring, description]) => ({
  slug, name, category, rendering, authoring, description,
  provider: source === 'wa' ? 'Web Awesome' : source === 'native' || source === 'vanilla' ? 'Browser platform / local fixture' : 'Local Lithono showcase',
  ssr: source === 'static' ? 'verified' : 'unknown',
   ssrNotes: source === 'static' ? 'Verified actual detail HTML with JavaScript disabled. No runtime registration.' : 'Unknown for this fixture: the live preview loads automatically in the browser. No SSR compatibility claim.',
  formNotes: slug === 'native-form' ? 'Verified native GET navigation to /components.' : slug === 'native-validation' ? 'Verified browser required validation; local submission only.' : 'Form submission / server-action integration unknown; not claimed.',
  versions: source === 'wa' ? 'Web Awesome 3.0.0; Lit 3.3.3 (lockfile)' : source === 'light' || source === 'shadow' ? 'Lit 3.3.3 (lockfile); Lithono workspace 0.1.0-alpha.1' : 'Browser platform; Chromium via Playwright 1.64.0. Other browsers unknown.',
  sourceURL: source === 'wa' ? 'https://webawesome.com/docs/components/' + (slug === 'wa-button' ? 'button' : 'switch') : source === 'shadow' ? 'https://lit.dev/docs/components/' : 'https://developer.mozilla.org/en-US/docs/Web/API/Web_components',
  install: source === 'wa' ? 'pnpm add @awesome.me/webawesome@3.0.0' : source === 'shadow' ? 'pnpm add lit' : source === 'light' ? 'pnpm add lithono lit' : 'No additional package required.',
  snippet: source === 'wa' ? `await import('@awesome.me/webawesome/dist/components/${slug.slice(3)}/${slug.slice(3)}.js');\n// Then create <${slug}> in the browser. No elements mapping required.` : source === 'static' ? '<directory-banner></directory-banner>\n// Local static HTML fragment resolved by Lithono.' : source === 'light' ? "await import('./components/directory-counter/directory-counter.ts');\n// Create directory-counter after activation; local trio is compiled by Lithono." : source === 'native' ? "const { createNative } = await import('./previews/native.ts');\n// createNative accepts only the fixed example names in the source." : `await import('./previews/${source}.ts');\n// Ordinary registration; no framework mapping required.`,
  sources: sources[source],
}));

export function searchComponents(url: string) {
  const query = componentQuery(url);
  const examples = componentCatalogue.filter(example =>
    (!query.q || `${example.name} ${example.description} ${example.authoring} ${example.provider}`.toLowerCase().includes(query.q.toLowerCase())) &&
    (!query.category || example.category === query.category) &&
    (!query.rendering || example.rendering === query.rendering) &&
    (!query.ssr || example.ssr === query.ssr));
  return { query, examples: examples.map(({ slug, name, description, category, authoring, rendering, ssr }) => ({ slug, name, description, category, authoring, rendering, ssr })), total: examples.length };
}
