import { customElement, state } from 'lit/decorators.js';
import { LithonoElement } from 'lithono/client';
import './directory-counter.css';

@customElement('directory-counter')
export default class DirectoryCounter extends LithonoElement {
  static root = 'light' as const;
  @state() count = 0;
  increment = () => { this.count++; };
}
