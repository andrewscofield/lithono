import { customElement, property } from 'lit/decorators.js';
import { LithonoElement } from 'lithono/client';
import './task-card.css';

export interface TaskCardData {
  id: string;
  title: string;
  href: string;
  statusLabel: string;
  toggleLabel: string;
  completed: boolean;
}

@customElement('task-card')
export class TaskCardElement extends LithonoElement {
  static root = 'light' as const;
  static hydrate = true;
  @property({ attribute: false })
  data: TaskCardData | undefined;

  protected updated(): void {
    // This demo owns the prefixed status class, while retaining consumer classes.
    // eslint-disable-next-line wc/no-self-class
    this.classList.toggle('task-card--done', Boolean(this.data?.completed));
  }
}

export default TaskCardElement;

declare global {
  interface HTMLElementTagNameMap {
    'task-card': TaskCardElement;
  }
}
