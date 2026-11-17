import { LithonoElement, html } from 'lithono/client';
export default class StaticElement extends LithonoElement {
  static hydrate = false;
  render() { return html`<p>Static component rendered on server</p>`; }
}
