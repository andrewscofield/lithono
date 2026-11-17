import { property } from 'lit/decorators.js';
import { LitElement } from 'lit';
import { Lithono } from 'lithono/client';

export default class __CLASS_NAME__ extends Lithono(LitElement) {
  static root = 'light' as const;

  @property({ type: String })
  label = 'New component';
}
