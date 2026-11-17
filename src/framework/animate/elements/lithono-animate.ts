import { LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { animate, onScroll, stagger as animeStagger } from 'animejs';
import { Lithono } from 'lithono/client';
import { PRESETS, type AnimatePreset } from '../presets.ts';
import { prefersReducedMotion } from '../controller.ts';
import './lithono-animate.css';

@customElement('lithono-animate')
export class LithonoAnimateElement extends Lithono(LitElement) {
  static root = 'host' as const;
  static lithonoStyles = ['/src/framework/animate/elements/lithono-animate.css'];

  override render() {
    return nothing;
  }

  @property({ type: String })
  preset: AnimatePreset = 'fade-up';

  @property({ type: Number })
  stagger = 0;

  @property({ type: String })
  trigger: 'load' | 'scroll' = 'load';

  @property({ type: Boolean })
  once = false;

  #played = false;
  #anim?: ReturnType<typeof animate>;

  override connectedCallback() {
    super.connectedCallback();
    if (prefersReducedMotion()) return;
    this.setAttribute('data-animate-pending', '');
    requestAnimationFrame(() => this.#play());
  }

  override disconnectedCallback() {
    this.#anim?.revert?.();
    super.disconnectedCallback();
  }

  #play() {
    if (this.#played && this.once) return;
    const targets = [...this.children].filter((el) => el.tagName !== 'TEMPLATE') as HTMLElement[];
    if (!targets.length) {
      this.removeAttribute('data-animate-pending');
      return;
    }

    const preset = PRESETS[this.preset] ?? PRESETS['fade-up'];
    const params: Record<string, unknown> = {
      duration: preset.duration,
      ease: preset.ease,
      onComplete: () => this.removeAttribute('data-animate-pending'),
    };
    if (preset.opacity) params.opacity = preset.opacity;
    if (preset.y) params.translateY = preset.y;
    if (preset.x) params.translateX = preset.x;
    if (preset.scale) params.scale = preset.scale;
    if (this.stagger > 0) params.delay = animeStagger(this.stagger);

    if (this.trigger === 'scroll') {
      params.autoplay = onScroll({
        target: this,
      });
    }

    this.#anim = animate(targets, params as never);
    this.#played = true;
    if (this.trigger !== 'scroll') {
      this.removeAttribute('data-animate-pending');
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'lithono-animate': LithonoAnimateElement;
  }
}
