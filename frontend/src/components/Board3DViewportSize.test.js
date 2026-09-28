import { describe, expect, it } from 'vitest';
import { resolveStableBoardViewport } from './Board3DViewportSize.js';

describe('resolveStableBoardViewport', () => {
  it('keeps immersive framing tied to the browser viewport even if board host geometry changes', () => {
    const before = resolveStableBoardViewport({
      hostWidth: 1169,
      hostHeight: 785,
      immersive: true,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    const afterSelection = resolveStableBoardViewport({
      hostWidth: 883,
      hostHeight: 659,
      immersive: true,
      viewportWidth: 1440,
      viewportHeight: 900,
    });

    expect(afterSelection).toEqual(before);
    expect(before).toEqual({ width: 1440, height: 900, source: 'immersive-viewport' });
  });

  it('continues to follow the actual host outside immersive mode', () => {
    expect(resolveStableBoardViewport({
      hostWidth: 980,
      hostHeight: 640,
      immersive: false,
      viewportWidth: 1440,
      viewportHeight: 900,
    })).toEqual({ width: 980, height: 640, source: 'host' });
  });
});
