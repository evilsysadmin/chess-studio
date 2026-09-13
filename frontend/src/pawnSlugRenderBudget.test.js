import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_RENDER_BUDGET,
  applyPawnSlugRenderBudget,
  installPawnSlugRenderBudget,
  pawnSlugCappedPixelRatio,
} from './pawnSlugRenderBudget.js';

function fakeRenderer(pixelRatio = 1.7) {
  let ratio = pixelRatio;
  return {
    domElement: { dataset: {}, isConnected: true },
    getPixelRatio: () => ratio,
    setPixelRatio: (next) => { ratio = next; },
  };
}

describe('Pawn Slug render budget', () => {
  it('caps only high-DPI desktop fill rate and preserves already-cheap renderers', () => {
    expect(pawnSlugCappedPixelRatio(2)).toBe(PAWN_SLUG_RENDER_BUDGET.desktopPixelRatioCap);
    expect(pawnSlugCappedPixelRatio(1.25)).toBe(1.25);
    expect(pawnSlugCappedPixelRatio(1)).toBe(1);
    expect(PAWN_SLUG_RENDER_BUDGET.desktopPixelRatioCap).toBeGreaterThanOrEqual(1.3);
  });

  it('defers drawing-buffer resize until the active render stack has unwound', async () => {
    const renderer = fakeRenderer(1.7);
    const result = applyPawnSlugRenderBudget(renderer);

    expect(result).toMatchObject({ configured: true, changed: true, scheduled: true, current: 1.7, target: 1.35 });
    expect(renderer.getPixelRatio()).toBe(1.7);
    await Promise.resolve();
    expect(renderer.getPixelRatio()).toBe(1.35);
    expect(renderer.domElement.dataset.pawnSlugRenderBudget).toBe('dpr<=1.35');
  });

  it('leaves mobile/standard DPR untouched and configures each renderer only once', async () => {
    const renderer = fakeRenderer(1.25);
    expect(applyPawnSlugRenderBudget(renderer)).toMatchObject({ configured: true, changed: false, scheduled: false });
    expect(applyPawnSlugRenderBudget(renderer)).toEqual({ configured: false, changed: false, scheduled: false });
    await Promise.resolve();
    expect(renderer.getPixelRatio()).toBe(1.25);
  });

  it('installs a one-shot hook and restores the previous scene callback after first render', async () => {
    let previousCalls = 0;
    const previous = () => { previousCalls += 1; };
    const proxy = { isMesh: true, onBeforeRender: previous };
    const root = {
      userData: {},
      traverse(visitor) { visitor(proxy); },
    };
    const renderer = fakeRenderer(1.6);

    expect(installPawnSlugRenderBudget(root)).toBe(proxy);
    expect(root.userData.pawnSlugRenderBudget).toBe(PAWN_SLUG_RENDER_BUDGET.version);
    expect(proxy.onBeforeRender).not.toBe(previous);

    proxy.onBeforeRender(renderer);
    expect(previousCalls).toBe(1);
    expect(proxy.onBeforeRender).toBe(previous);
    await Promise.resolve();
    expect(renderer.getPixelRatio()).toBe(1.35);
  });
});
