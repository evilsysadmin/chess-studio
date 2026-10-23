import { describe, expect, it } from 'vitest';
import { HOME_BLENDER_TRACE_LIMIT, recordHomeBlenderRuntimeEvent } from './HomeBlenderRuntimeTrace.js';

describe('Home Blender page-local runtime forensics', () => {
  it('records a bounded sequence with stable event codes and timestamps', () => {
    const root = { dataset: {} };
    recordHomeBlenderRuntimeEvent('mount', { root, at: 1_000 });
    recordHomeBlenderRuntimeEvent('ready', { root, at: 2_000 });
    recordHomeBlenderRuntimeEvent('context-lost', { root, at: 3_000 });
    recordHomeBlenderRuntimeEvent('context-restored', { root, at: 13_000 });
    recordHomeBlenderRuntimeEvent('mount', { root, at: 13_001 });
    recordHomeBlenderRuntimeEvent('ready', { root, at: 14_000 });
    expect(JSON.parse(root.dataset.homeBlenderTrace)).toEqual([
      { event: 'mount', at: 1000 },
      { event: 'ready', at: 2000 },
      { event: 'context-lost', at: 3000 },
      { event: 'context-restored', at: 13000 },
      { event: 'mount', at: 13001 },
      { event: 'ready', at: 14000 },
    ]);
    expect(root.dataset.homeBlenderLastEvent).toBe('ready');
    for (let i = 0; i < 30; i++) {
      recordHomeBlenderRuntimeEvent('lod-lite', { root, at: 14_001 + i });
    }
    const history = JSON.parse(root.dataset.homeBlenderTrace);
    expect(history).toHaveLength(HOME_BLENDER_TRACE_LIMIT);
    expect(history[0].at).toBe(14_021);
    expect(history.at(-1).at).toBe(14_030);
    expect(root.dataset.homeBlenderTrace.length).toBeLessThan(600);
  });

  it('preserves fatal reason after the WebGL canvas disappears, sanitizing arbitrary details', () => {
    const root = { dataset: {} };
    recordHomeBlenderRuntimeEvent('ready', { root, at: 1 });
    recordHomeBlenderRuntimeEvent('fallback', { root, at: 2, reason: 'model-timeout' });
    expect(root.dataset.homeBlenderLastEvent).toBe('fallback');
    expect(JSON.parse(root.dataset.homeBlenderTrace).at(-1)).toEqual({
      event: 'fallback', at: 2, reason: 'model-timeout',
    });
    recordHomeBlenderRuntimeEvent('fallback', { root, at: 3, reason: 'https://private.example/token' });
    expect(JSON.parse(root.dataset.homeBlenderTrace).at(-1).reason).toBe('unknown');
    expect(root.dataset.homeBlenderTrace).not.toContain('private.example');
  });

  it('normalizes existing page metadata and never reserializes arbitrary fields', () => {
    const root = { dataset: {
      homeBlenderTrace: JSON.stringify([
        { event: 'ready', at: 100.8, stack: 'private stack'.repeat(1000), url: 'https://private.example/token' },
        { event: 'fallback', at: 101.9, reason: 'model-timeout', password: 'not-a-real-password' },
        { event: 'fallback', at: 102, reason: 'https://private.example/secret', nested: { session: 'private' } },
        { event: 'ready', at: '103', sneaky: 'invalid timestamp type' },
        { event: 'unrecognized', at: 104, details: 'not in event contract' },
      ]),
    } };
    recordHomeBlenderRuntimeEvent('context-lost', { root, at: 105 });
    expect(JSON.parse(root.dataset.homeBlenderTrace)).toEqual([
      { event: 'ready', at: 100 },
      { event: 'fallback', at: 101, reason: 'model-timeout' },
      { event: 'fallback', at: 102, reason: 'unknown' },
      { event: 'context-lost', at: 105 },
    ]);
    expect(root.dataset.homeBlenderTrace.length).toBeLessThan(250);
    expect(root.dataset.homeBlenderTrace).not.toContain('private');
    expect(root.dataset.homeBlenderTrace).not.toContain('token');
    expect(root.dataset.homeBlenderTrace).not.toContain('stack');
    expect(root.dataset.homeBlenderLastEvent).toBe('context-lost');
  });

  it('does not throw on corrupted DOM metadata, unsupported events or absent DOM', () => {
    const root = { dataset: { homeBlenderTrace: '{bad' } };
    expect(recordHomeBlenderRuntimeEvent('ready', { root, at: 5 })).toEqual({ event: 'ready', at: 5 });
    expect(JSON.parse(root.dataset.homeBlenderTrace)).toEqual([{ event: 'ready', at: 5 }]);
    const before = root.dataset.homeBlenderTrace;
    expect(recordHomeBlenderRuntimeEvent('fake-error', { root, at: 6 })).toBeNull();
    expect(recordHomeBlenderRuntimeEvent('mount', { root: null })).toBeNull();
    expect(root.dataset.homeBlenderTrace).toBe(before);
    root.dataset.homeBlenderTrace = JSON.stringify({ malformed: true });
    recordHomeBlenderRuntimeEvent('fallback', { root, at: 7, reason: 'webgl-constructor' });
    expect(JSON.parse(root.dataset.homeBlenderTrace)).toEqual([
      { event: 'fallback', at: 7, reason: 'webgl-constructor' },
    ]);
  });
});
