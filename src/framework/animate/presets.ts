export type AnimatePreset = 'fade-up' | 'fade' | 'scale' | 'slide';

export interface PresetParams {
  opacity?: [number, number];
  y?: [number, number];
  x?: [number, number];
  scale?: [number, number];
  duration?: number;
  ease?: string;
}

export const PRESETS: Record<AnimatePreset, PresetParams> = {
  'fade-up': {
    opacity: [0, 1],
    y: [16, 0],
    duration: 600,
    ease: 'outQuad',
  },
  fade: {
    opacity: [0, 1],
    duration: 500,
    ease: 'outQuad',
  },
  scale: {
    opacity: [0, 1],
    scale: [0.96, 1],
    duration: 500,
    ease: 'outQuad',
  },
  slide: {
    opacity: [0, 1],
    x: [24, 0],
    duration: 600,
    ease: 'outQuad',
  },
};
