import type { AnimationParams, TargetsParam, TimelineParams } from 'animejs';
import { animate, createTimeline, onScroll, stagger } from 'animejs';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type AnimateHandle = ReturnType<typeof animate>;

export class AnimateController implements ReactiveController {
  #anims: AnimateHandle[] = [];
  #host: ReactiveControllerHost;

  constructor(host: ReactiveControllerHost) {
    this.#host = host;
    host.addController(this);
  }

  enter(targets: TargetsParam, params: AnimationParams): AnimateHandle | undefined {
    if (prefersReducedMotion()) return undefined;
    const anim = animate(targets, params);
    this.#anims.push(anim);
    return anim;
  }

  timeline(params?: TimelineParams) {
    const tl = createTimeline(params);
    this.#anims.push(tl as unknown as AnimateHandle);
    return tl;
  }

  leave() {
    for (const anim of this.#anims) {
      anim.revert?.();
    }
    this.#anims = [];
  }

  hostDisconnected() {
    this.leave();
  }
}

export { animate, createTimeline, onScroll, stagger };
