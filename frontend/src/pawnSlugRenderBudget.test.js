import { describe, expect, it, vi } from 'vitest';
import {
  PAWN_SLUG_RENDER_BUDGET,
  applyPawnSlugRenderBudget,
  installPawnSlugRenderBudget,
  observePawnSlugRenderBudget,
  pawnSlugAdaptiveTierForFrameMs,
  pawnSlugCappedPixelRatio,
  pawnSlugGpuRendererLabel,
  tickPawnSlugRenderBudget,
} from './pawnSlugRenderBudget.js';

function fakeRenderer(pixelRatio = 1.7) {
  let ratio = pixelRatio;
  return {
    domElement: { dataset: {}, isConnected: true },
    getPixelRatio: () => ratio,
    setPixelRatio: (next) => { ratio = next; },
    shadowMap: { enabled: true },
    render: vi.fn(),
  };
}

function flushMicrotasks() {
  return Promise.resolve();
}

describe('Pawn Slug render budget', () => {
  it('caps only high-DPI desktop fill rate and preserves already-cheap renderers', () => {
    expect(pawnSlugCappedPixelRatio(2)).toBe(PAWN_SLUG_RENDER_BUDGET.desktopPixelRatioCap);
    expect(pawnSlugCappedPixelRatio(1.25)).toBe(1.25);
    expect(pawnSlugCappedPixelRatio(1)).toBe(1);
    expect(PAWN_SLUG_RENDER_BUDGET.desktopPixelRatioCap).toBeGreaterThanOrEqual(1.3);
  });

  it('maps sustained frame cost to monotonic quality tiers', () => {
    expect(pawnSlugAdaptiveTierForFrameMs(16.7)).toBe('high');
    expect(pawnSlugAdaptiveTierForFrameMs(PAWN_SLUG_RENDER_BUDGET.balancedFrameMs)).toBe('balanced');
    expect(pawnSlugAdaptiveTierForFrameMs(PAWN_SLUG_RENDER_BUDGET.lowFrameMs)).toBe('low');
  });

  it('defers drawing-buffer resize until the active render stack has unwound', async () => {
    const renderer = fakeRenderer(1.7);
    const result = applyPawnSlugRenderBudget(renderer);

    expect(result).toMatchObject({ configured: true, changed: true, scheduled: true, current: 1.7, target: 1.35 });
    expect(renderer.getPixelRatio()).toBe(1.7);
    await flushMicrotasks();
    expect(renderer.getPixelRatio()).toBe(1.35);
    expect(renderer.domElement.dataset.pawnSlugRenderBudget).toBe('dpr<=1.35');
    expect(renderer.domElement.dataset.pawnSlugQuality).toBe('high');
  });

  it('leaves mobile/standard DPR untouched and configures each renderer only once', async () => {
    const renderer = fakeRenderer(1.25);
    expect(applyPawnSlugRenderBudget(renderer)).toMatchObject({ configured: true, changed: false, scheduled: false });
    expect(applyPawnSlugRenderBudget(renderer)).toEqual({ configured: false, changed: false, scheduled: false });
    await flushMicrotasks();
    expect(renderer.getPixelRatio()).toBe(1.25);
  });

  it('records the concrete WebGL renderer when the debug extension is available', () => {
    const renderer = {
      getContext: () => ({
        getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 123 }),
        getParameter: (key) => key === 123 ? 'NVIDIA GeForce RTX TEST' : '',
      }),
    };
    expect(pawnSlugGpuRendererLabel(renderer)).toBe('NVIDIA GeForce RTX TEST');
  });

  it('degrades DPR and shadows after sustained slow frames instead of letting the game stay GPU-bound', async () => {
    const renderer = fakeRenderer(1.35);
    observePawnSlugRenderBudget(renderer, 0);
    let result = null;
    for (let frame = 1; frame <= PAWN_SLUG_RENDER_BUDGET.sampleFrames; frame += 1) {
      result = observePawnSlugRenderBudget(renderer, frame * 32);
    }
    expect(result).toMatchObject({ changed: true, tier: 'low' });
    await flushMicrotasks();
    expect(renderer.getPixelRatio()).toBe(PAWN_SLUG_RENDER_BUDGET.lowPixelRatioCap);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(renderer.domElement.dataset.pawnSlugQuality).toBe('low');
    expect(renderer.domElement.dataset.pawnSlugShadows).toBe('adaptive-off');
  });

  it('keeps the render hook on a scalar hot-path tick without changing adaptive behavior', async () => {
    const renderer = fakeRenderer(1.35);
    expect(tickPawnSlugRenderBudget(renderer, 0)).toBe('high');
    let tier = 'high';
    for (let frame = 1; frame <= PAWN_SLUG_RENDER_BUDGET.sampleFrames; frame += 1) {
      tier = tickPawnSlugRenderBudget(renderer, frame * 32);
    }
    expect(tier).toBe('low');
    await flushMicrotasks();
    expect(renderer.getPixelRatio()).toBe(PAWN_SLUG_RENDER_BUDGET.lowPixelRatioCap);
    expect(renderer.shadowMap.enabled).toBe(false);
  });

  it('keeps the high-quality tier on healthy 60fps frame times', async () => {
    const renderer = fakeRenderer(1.35);
    observePawnSlugRenderBudget(renderer, 0);
    let result = null;
    for (let frame = 1; frame <= PAWN_SLUG_RENDER_BUDGET.sampleFrames; frame += 1) {
      result = observePawnSlugRenderBudget(renderer, frame * 16.7);
    }
    await flushMicrotasks();
    expect(result).toMatchObject({ changed: false, tier: 'high' });
    expect(renderer.getPixelRatio()).toBe(1.35);
    expect(renderer.shadowMap.enabled).toBe(true);
  });

  it('keeps a persistent budget hook, limits high-refresh paints, and culls far local lights before later renders', async () => {
    let previousCalls = 0;
    const previous = () => { previousCalls += 1; };
    const localLight = {
      isPointLight: true,
      visible: true,
      position: { x: 30 },
      matrixWorld: { elements: Array(12).fill(0).concat([30]) },
      updateWorldMatrix() {},
    };
    const proxy = { isMesh: true, onBeforeRender: previous };
    const root = {
      userData: {},
      traverse(visitor) {
        visitor(proxy);
        visitor(localLight);
      },
    };
    const scene = { onBeforeRender: null };
    const camera = { position: { x: 0 } };
    const renderer = fakeRenderer(1.6);

    expect(installPawnSlugRenderBudget(root)).toBe(proxy);
    expect(root.userData.pawnSlugRenderBudget).toBe(PAWN_SLUG_RENDER_BUDGET.version);
    expect(proxy.onBeforeRender).not.toBe(previous);

    proxy.onBeforeRender(renderer, scene, camera);
    expect(previousCalls).toBe(1);
    expect(typeof scene.onBeforeRender).toBe('function');
    expect(proxy.onBeforeRender).not.toBe(previous);
    await flushMicrotasks();
    expect(renderer.getPixelRatio()).toBe(1.35);
    expect(renderer.domElement.dataset.pawnSlugPaintCap).toBe(`${PAWN_SLUG_RENDER_BUDGET.maxPaintHz}hz`);

    scene.onBeforeRender(renderer, scene, camera);
    expect(localLight.visible).toBe(false);
    camera.position.x = 30;
    scene.onBeforeRender(renderer, scene, camera);
    expect(localLight.visible).toBe(true);
  });
});