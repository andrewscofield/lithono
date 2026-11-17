import { html as litHtml, noChange as litNoChange, nothing as litNothing } from 'lit';
import { repeat as litRepeat } from 'lit/directives/repeat.js';

/** Stable names for client chunks (lit's published ESM uses single-letter locals). */
export const html = litHtml;
export const nothing = litNothing;
export const noChange = litNoChange;
export const repeat = litRepeat;
