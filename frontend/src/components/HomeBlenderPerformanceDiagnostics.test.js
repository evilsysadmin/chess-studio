import { describe, expect, it, vi } from 'vitest';
import {
  createHomeBlenderGpuTimer,
  createHomeBlenderFrameSamples,
  homeBlenderP95Ms,
  homeBlenderGpuResourceCounts,
} from './HomeBlenderPerformanceDiagnostics.js';

function fakeGpu() {
  const extension = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  let available = false;
  let disjoint = false;
  const gl = {
    QUERY_RESULT_AVAILABLE: 0x8867,
    QUERY_RESULT: 0x8866,
    getExtension: vi.fn(() => extension),
    createQuery: vi.fn(() => ({ id: 1 })),
    beginQuery: vi.fn(),
    endQuery: vi.fn(),
    deleteQuery: vi.fn(),
    getParameter: vi.fn(() => disjoint),
    getQueryParameter: vi.fn((query, kind) => kind === gl.QUERY_RESULT_AVAILABLE ? available : 4_250_000),
  };
  return { gl, ready: () => { available = true; }, setDisjoint: () => { disjoint = true; } };
}

describe('Home Blender optional GPU profiler', () => {
  it('never even requests timer extensions when disabled or software-rendered', () => {
    const { gl } = fakeGpu();
    const disabled = createHomeBlenderGpuTimer(gl);
    const software = createHomeBlenderGpuTimer(gl, { enabled: true, software: true });
    expect(disabled.status).toBe('disabled');
    expect(software.status).toBe('software');
    disabled.begin();
    software.begin();
    expect(gl.getExtension).not.toHaveBeenCalled();
    expect(gl.createQuery).not.toHaveBeenCalled();
    expect(createHomeBlenderGpuTimer(null, { enabled: true }).status).toBe('unsupported');
    gl.getExtension.mockReturnValueOnce(null);
    expect(createHomeBlenderGpuTimer(gl, { enabled: true }).status).toBe('unsupported');
  });

  it('samples one nonblocking timer query per 30 drawn frames and deletes it', () => {
    const { gl, ready } = fakeGpu();
    const timer = createHomeBlenderGpuTimer(gl, { enabled: true });
    for (let i = 0; i < 29; i += 1) {
      timer.begin();
      timer.end();
    }
    expect(gl.createQuery).not.toHaveBeenCalled();
    timer.begin();
    timer.end();
    expect(gl.createQuery).toHaveBeenCalledTimes(1);
    expect(gl.beginQuery).toHaveBeenCalledWith(0x88bf, expect.any(Object));
    expect(gl.endQuery).toHaveBeenCalledWith(0x88bf);
    expect(timer.poll()).toBe(null); // Result not available: no synchronous GPU wait.
    expect(timer.status).toBe('sampling');
    ready();
    expect(timer.poll()).toBe(4.25);
    expect(timer.lastMs).toBe(4.25);
    expect(timer.status).toBe('ready');
    expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
    timer.dispose();
    expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects disjoint results rather than publishing a fabricated GPU time', () => {
    const { gl, setDisjoint } = fakeGpu();
    const timer = createHomeBlenderGpuTimer(gl, { enabled: true, sampleEvery: 1 });
    timer.begin();
    timer.end();
    setDisjoint();
    expect(timer.poll()).toBe(null);
    expect(timer.lastMs).toBe(null);
    expect(timer.status).toBe('disjoint');
    expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
  });

  it('releases an unresolved query without blocking when the scene unmounts', () => {
    const { gl } = fakeGpu();
    const timer = createHomeBlenderGpuTimer(gl, { enabled: true, sampleEvery: 1 });
    timer.begin();
    timer.end();
    timer.dispose();
    timer.dispose();
    expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
    expect(gl.getQueryParameter).not.toHaveBeenCalled();
  });

  it('handles timer-query API errors as unavailable, without affecting rendering', () => {
    const { gl } = fakeGpu();
    gl.beginQuery.mockImplementationOnce(() => { throw new Error('context lost'); });
    const timer = createHomeBlenderGpuTimer(gl, { enabled: true, sampleEvery: 1 });
    expect(() => { timer.begin(); timer.end(); }).not.toThrow();
    expect(timer.status).toBe('error');
    expect(timer.lastMs).toBe(null);
    expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
  });
});

describe('Home Blender bounded performance diagnostics', () => {
  it('computes p95 from bounded real samples, ignoring invalid values', () => {
    expect(homeBlenderP95Ms([])).toBe(null);
    expect(homeBlenderP95Ms([NaN, -1, 2, 4, 9])).toBe(9);
    const samples = createHomeBlenderFrameSamples(3);
    samples.addCpu(1);
    samples.addCpu(3);
    samples.addCpu(9);
    samples.addCpu(5); // Evicts 1.
    samples.addCpu(Infinity);
    samples.addVsyncGap(16);
    samples.addVsyncGap(21);
    samples.addVsyncGap(1000); // Timer sleep is never a valid natural frame gap.
    expect(samples.snapshot()).toEqual({
      cpuP95Ms: 9,
      vsyncP95Ms: 21,
      cpuSamples: 3,
      vsyncSamples: 2,
    });
  });

  it('reports Three GPU allocation counts, never guesses texture VRAM bytes', () => {
    expect(homeBlenderGpuResourceCounts({ info: { memory: { textures: 38, geometries: 117 }, programs: [1, 2] } }))
      .toEqual({ textures: 38, geometries: 117, programs: 2 });
    expect(homeBlenderGpuResourceCounts(null))
      .toEqual({ textures: null, geometries: null, programs: null });
  });
});
