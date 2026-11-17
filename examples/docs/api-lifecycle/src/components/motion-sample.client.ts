import { customElement } from 'lit/decorators.js';
import { LithonoElement, nothing } from 'lithono/client';
import { AnimateController, prefersReducedMotion } from 'lithono/animate';

@customElement('motion-sample')
export class MotionSample extends LithonoElement {
  static root = 'host' as const;
  motion = new AnimateController(this);

  override connectedCallback() {
    super.connectedCallback();
    const target = this.querySelector<HTMLElement>('[data-motion-target]');
    if (!target) return;
    const handle = this.motion.enter(target, { opacity: [0.4, 1], duration: 150 });
    this.setAttribute('data-motion-state', handle ? 'played' : 'reduced');
    // timeline() does not guard reduced motion automatically.
    if (!prefersReducedMotion()) this.motion.timeline().add(target, { translateY: [4, 0], duration: 150 });
  }

  override disconnectedCallback() {
    super.disconnectedCallback(); // The controller reverts its tracked handles here.
    this.setAttribute('data-motion-state', 'released');
  }

  render() { return nothing; }
}
