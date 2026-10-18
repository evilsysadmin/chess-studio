import { describe, expect, it } from 'vitest';
import {
  createWarRoomGpuProfile,
  warRoomGpuProfileRequested,
} from './WarRoomGpuProfile.js';

function rendererProbe({ webgl2 = true } = {}) {
  const deleted = [];
  let disjoint = false;
  let nextId = 0;
  const gl = {
    QUERY_RESULT_AVAILABLE: 'available',
    QUERY_RESULT: 'result',
    createQuery: () => ({ id: ++nextId }),
    deleteQuery: (query) => deleted.push(query.id),
    beginQuery: () => {},
    endQuery: () => {},
    getExtension: (name) => name === 'EXT_disjoint_timer_query_webgl2'
      ? { TIME_ELAPSED_EXT: 35007, GPU_DISJOINT_EXT: 'disjoint' } : null,
    getParameter: (name) => name === 'disjoint' && disjoint,
    getQueryParameter: (_query, name) => name === 'available' ? true : 3_750_000,
  };
  const canvas = { dataset: {} };
  return {
    renderer: { domElement: canvas, capabilities: { isWebGL2: webgl2 }, getContext: () => gl },
    canvas, deleted,
    setDisjoint: (next) => { disjoint = next; },
  };
}

describe('War Room GPU timer opt-in', () => {
  it('never installs timer queries or DOM telemetry during ordinary play', () => {
    const p = rendererProbe();
    const profile = createWarRoomGpuProfile(p.renderer);
    expect(profile).toBeNull();
    expect(p.canvas.dataset).toEqual({});
    expect(p.deleted).toHaveLength(0);
    expect(warRoomGpuProfileRequested({ search: '?warRoomGpuProfile=0' })).toBe(false);
    expect(warRoomGpuProfileRequested({ search: '?warRoomGpuProfile=1' })).toBe(true);
    expect(warRoomGpuProfileRequested({ storageFlag: '1' })).toBe(true);
  });

  it('samples the existing WebGL2 context asynchronously and publishes only new query results', () => {
    const p = rendererProbe();
    const profile = createWarRoomGpuProfile(p.renderer, {
      search: '?warRoomGpuProfile=1',
      sampleEvery: 2,
    });
    expect(p.canvas.dataset).toEqual({
      warRoomGpuProfileStatus: 'sampling',
      warRoomGpuProfileSamples: '0',
    });
    profile.begin(); profile.end(); profile.poll();
    expect(p.canvas.dataset.warRoomGpuProfileSamples).toBe('0');
    profile.begin(); profile.end(); profile.poll();
    expect(p.canvas.dataset).toMatchObject({
      warRoomGpuProfileStatus: 'ready',
      warRoomGpuProfileSamples: '1',
      warRoomGpuProfileLastMs: '3.75',
    });
    const queryStartedAt = Number(p.canvas.dataset.warRoomGpuProfileLastQueryStartedAtMs);
    expect(Number.isFinite(queryStartedAt)).toBe(true);
    expect(queryStartedAt).toBeGreaterThanOrEqual(0);
    profile.poll();
    expect(Number(p.canvas.dataset.warRoomGpuProfileLastQueryStartedAtMs)).toBe(queryStartedAt);
    expect(p.canvas.dataset.warRoomGpuProfileSamples).toBe('1');
    expect(p.deleted).toEqual([1]);
    profile.dispose();
    expect(p.canvas.dataset).toEqual({});
  });

  it('invalidates previous elapsed ms after GPU disjoint without fabricating an extra sample', () => {
    const p = rendererProbe();
    const profile = createWarRoomGpuProfile(p.renderer, {
      storageFlag: '1', sampleEvery: 1,
    });
    profile.begin(); profile.end(); profile.poll();
    expect(p.canvas.dataset.warRoomGpuProfileLastMs).toBe('3.75');
    profile.begin(); profile.end();
    p.setDisjoint(true);
    profile.poll();
    expect(p.canvas.dataset.warRoomGpuProfileStatus).toBe('disjoint');
    expect(p.canvas.dataset.warRoomGpuProfileSamples).toBe('1');
    expect(p.canvas.dataset.warRoomGpuProfileLastMs).toBeUndefined();
    expect(p.canvas.dataset.warRoomGpuProfileLastQueryStartedAtMs).toBeUndefined();
    profile.dispose();
    expect(p.deleted).toEqual([1, 2]);
  });

  it('fails closed for software and WebGL1 while leaving the chess renderer untouched', () => {
    for (const options of [{ softwareRenderer: true }, {}]) {
      const p = rendererProbe({ webgl2: options.softwareRenderer === true });
      const profile = createWarRoomGpuProfile(p.renderer, {
        storageFlag: '1', ...options,
      });
      expect(p.canvas.dataset.warRoomGpuProfileStatus).toBe(
        options.softwareRenderer ? 'software' : 'unsupported',
      );
      profile.begin(); profile.end(); profile.poll();
      expect(p.canvas.dataset.warRoomGpuProfileSamples).toBe('0');
      expect(p.canvas.dataset.warRoomGpuProfileLastMs).toBeUndefined();
      profile.dispose();
      expect(p.canvas.dataset).toEqual({});
    }
  });
});
