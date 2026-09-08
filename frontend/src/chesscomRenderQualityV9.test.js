import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHESSCOM_RENDER_QUALITY_V9, chesscomRenderScaleFor } from './chesscomRenderQualityV9.js';

afterEach(() => vi.unstubAllGlobals());

describe('Chesscom render quality v9', () => {
  it('uses HiDPI supersampling on a desktop GPU path', () => {
    vi.stubGlobal('devicePixelRatio',2);
    expect(chesscomRenderScaleFor({tier:'ultra',width:1100,height:700})).toBe(2);
    expect(CHESSCOM_RENDER_QUALITY_V9.scaling).toBe('adaptive-hidpi');
  });

  it('caps very large desktop canvases before they become a GPU furnace', () => {
    vi.stubGlobal('devicePixelRatio',2.5);
    expect(chesscomRenderScaleFor({tier:'ultra',width:1800,height:1000})).toBe(1.5);
  });

  it('keeps coarse and balanced rendering conservative', () => {
    vi.stubGlobal('devicePixelRatio',3);
    expect(chesscomRenderScaleFor({tier:'ultra',coarse:true,width:900,height:700})).toBe(1.25);
    expect(chesscomRenderScaleFor({tier:'balanced',width:900,height:700})).toBe(1.25);
  });
});
