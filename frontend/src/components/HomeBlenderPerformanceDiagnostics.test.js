import { describe, expect, it, vi } from 'vitest';
import {
  createHomeBlenderGpuTimer,
  createHomeBlenderFrameSamples,
  homeBlenderP95Ms,
  homeBlenderGpuResourceCounts,
  homeBlenderModelDrawInventory,
  homeBlenderDistinctGpuSamplesMs,
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
    expect(disabled.completedSamples).toBe(0);
    expect(software.completedSamples).toBe(0);
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
    expect(timer.completedSamples).toBe(0);
    ready();
    expect(timer.poll()).toBe(4.25);
    expect(timer.lastMs).toBe(4.25);
    expect(timer.completedSamples).toBe(1);
    expect(timer.status).toBe('ready');
    expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
    timer.dispose();
    expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
  });

  it('binds a completed GPU result to the query start tag, not its later poll', () => {
    const { gl, ready, setDisjoint } = fakeGpu();
    const timer = createHomeBlenderGpuTimer(gl, { enabled: true, sampleEvery: 1 });
    timer.begin(142.5);
    timer.end();
    expect(timer.lastCompletedTag).toBe(null);
    expect(timer.poll()).toBe(null);
    ready();
    expect(timer.poll()).toBe(4.25);
    expect(timer.lastCompletedTag).toBe(142.5);
    timer.begin(205);
    timer.end();
    expect(timer.lastCompletedTag).toBe(142.5);
    setDisjoint();
    expect(timer.poll()).toBe(null);
    expect(timer.lastCompletedTag).toBe(null);
    timer.dispose();
    expect(timer.lastCompletedTag).toBe(null);
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
    expect(timer.completedSamples).toBe(0);
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

  it('counts only distinct completed GPU measurements, never repeated polling reads', () => {
    const { gl, ready } = fakeGpu();
    const timer = createHomeBlenderGpuTimer(gl, { enabled: true, sampleEvery: 1 });
    timer.begin();
    timer.end();
    ready();
    expect(timer.poll()).toBe(4.25);
    expect(timer.completedSamples).toBe(1);
    expect(timer.poll()).toBe(null);
    expect(timer.completedSamples).toBe(1);
    timer.begin();
    timer.end();
    // A new query is pending but the last known valid GPU result is unchanged.
    expect(timer.lastMs).toBe(4.25);
    expect(timer.completedSamples).toBe(1);
    expect(timer.poll()).toBe(4.25);
    expect(timer.completedSamples).toBe(2);
  });

  it('accepts independent GPU query completions, not duplicate snapshots of the last result', () => {
    expect(homeBlenderDistinctGpuSamplesMs([
      { gpuStatus: 'sampling', gpuSampleCount: 0, gpuMs: null },
      { gpuStatus: 'ready', gpuSampleCount: 1, gpuMs: 3.25 },
      { gpuStatus: 'ready', gpuSampleCount: 1, gpuMs: 3.25 }, // Same old result.
      { gpuStatus: 'sampling', gpuSampleCount: 2, gpuMs: null },
      { gpuStatus: 'ready', gpuSampleCount: 2, gpuMs: 5.25 },
      { gpuStatus: 'ready', gpuSampleCount: 2, gpuMs: 5.25 },
      { gpuStatus: 'disjoint', gpuSampleCount: 2, gpuMs: null },
      { gpuStatus: 'ready', gpuSampleCount: 3, gpuMs: 7.25 },
      { gpuStatus: 'ready', gpuSampleCount: 4, gpuMs: NaN },
      { gpuStatus: 'ready', gpuSampleCount: 5, gpuMs: -1 },
      { gpuStatus: 'ready', gpuSampleCount: 6, gpuMs: 9.25 },
    ])).toEqual([3.25, 5.25, 7.25, 9.25]);
    expect(homeBlenderDistinctGpuSamplesMs([])).toEqual([]);
    expect(homeBlenderDistinctGpuSamplesMs([
      { gpuStatus: 'ready', gpuSampleCount: null, gpuMs: 2 },
      { gpuStatus: 'ready', gpuSampleCount: 0, gpuMs: 2 },
    ])).toEqual([]);
  });

  it('reports Three GPU allocation counts, never guesses texture VRAM bytes', () => {
    expect(homeBlenderGpuResourceCounts({ info: { memory: { textures: 38, geometries: 117 }, programs: [1, 2] } }))
      .toEqual({ textures: 38, geometries: 117, programs: 2 });
    expect(homeBlenderGpuResourceCounts(null))
      .toEqual({ textures: null, geometries: null, programs: null });
  });
});


describe('Home Blender authored-model GPU draw inventory', () => {
  it('counts visible material groups and shared resources without calling them actual GPU draws', () => {
    const stone = { name: 'Stone', transparent: false };
    const flame = { name: 'Flame', transparent: true };
    const sharedGeometry = { groups: [
      { materialIndex: 0, count: 12 },
      { materialIndex: 1, count: 6 },
      { materialIndex: 1, count: 0 },
    ] };
    const root = { visible: true, parent: null };
    const first = {
      isMesh: true, visible: true, parent: root, castShadow: true,
      geometry: sharedGeometry, material: [stone, flame],
    };
    const second = {
      isMesh: true, visible: true, parent: root, castShadow: false,
      geometry: sharedGeometry, material: [stone, flame],
    };
    const hiddenGroup = { visible: false, parent: root };
    const hiddenMesh = {
      isMesh: true, visible: true, parent: hiddenGroup,
      castShadow: true, geometry: {}, material: stone,
    };
    const invisibleMaterial = {
      isMesh: true, parent: root, castShadow: true,
      geometry: {}, material: { visible: false },
    };
    root.traverse = (visitor) => {
      for (const node of [root, first, second, hiddenGroup, hiddenMesh, invisibleMaterial]) visitor(node);
    };
    expect(homeBlenderModelDrawInventory(root)).toEqual({
      meshes: 3, drawSlotCandidates: 4, transparentSlots: 2,
      shadowCasterSlots: 2, sharedGeometryMeshes: 1,
      uniqueGeometries: 2, uniqueMaterials: 2,
      topMaterials: [
        { material: 'Flame', slots: 2, transparentSlots: 2, shadowCasterSlots: 1 },
        { material: 'Stone', slots: 2, transparentSlots: 0, shadowCasterSlots: 1 },
      ],
      permutedStaticBatchGroups: [],
    });
  });

  it('counts only explicit multi-material groups, and handles missing models', () => {
    const root = { traverse: (visit) => {
      visit({ isMesh: true, geometry: { groups: [] }, material: [{}, {}] });
      visit({ isMesh: true, geometry: { groups: [{ materialIndex: 3, count: 5 }] }, material: [{}] });
      visit({ isMesh: true, geometry: { groups: [] }, material: { transparent: false } });
      visit({ isMesh: false, geometry: {}, material: {} });
    } };
    expect(homeBlenderModelDrawInventory(root)).toEqual({
      meshes: 3, drawSlotCandidates: 1, transparentSlots: 0,
      shadowCasterSlots: 0, sharedGeometryMeshes: 0,
      uniqueGeometries: 3, uniqueMaterials: 1,
      topMaterials: [
        { material: '(unnamed)', slots: 1, transparentSlots: 0, shadowCasterSlots: 0 },
      ],
      permutedStaticBatchGroups: [],
    });
    expect(homeBlenderModelDrawInventory(null).drawSlotCandidates).toBe(0);
    expect(homeBlenderModelDrawInventory(null).topMaterials).toEqual([]);
    expect(homeBlenderModelDrawInventory(null).permutedStaticBatchGroups).toEqual([]);
  });

  it('identifies only opaque static batches with identical material sets but different slot order', () => {
    const wood = { name: 'Wood', transparent: false };
    const brass = { name: 'Brass', transparent: false };
    const glass = { name: 'Glass', transparent: true };
    const root = { visible: true };
    const mesh = (name, list, options = {}) => ({
      name, parent: options.parent || root, isMesh: true, visible: true,
      castShadow: options.castShadow ?? true,
      geometry: { groups: list.map((_, materialIndex) => ({ materialIndex, count: 6 })) },
      material: list,
    });
    const nodes = [
      mesh('HOME_ARCH_BATCH_0_wood', [wood, brass]),
      mesh('HOME_PROP_BATCH_1_brass', [brass, wood]),
      mesh('HOME_ARCH_BATCH_2_wood', [wood, brass]),
      mesh('HOME_ARCH_BATCH_3_transparent', [glass, wood]),
      mesh('HOME_ARCH_BATCH_4_transparent', [wood, glass]),
      mesh('HOME_PROP_BATCH_5_other-shadow', [brass, wood], { castShadow: false }),
      mesh('HOME_ARCH_unbatched', [brass, wood]),
      mesh('HOME_ARCH_BATCH_6_dup', [wood, wood]),
      mesh('HOME_ARCH_BATCH_7_dup', [wood, wood]),
      mesh('HOME_ARCH_BATCH_8_missing-group', [brass, wood]),
    ];
    nodes[9].geometry.groups.pop();
    const hidden = { parent: root, visible: false };
    nodes.push(mesh('HOME_ARCH_BATCH_9_hidden', [brass, wood], { parent: hidden }));
    root.traverse = (visit) => [root, ...nodes].forEach(visit);
    expect(homeBlenderModelDrawInventory(root).permutedStaticBatchGroups).toEqual([{
      materials: ['Brass', 'Wood'], shadowCaster: true,
      batches: 3, orderedVariants: 2,
      examples: ['HOME_ARCH_BATCH_0_wood', 'HOME_ARCH_BATCH_2_wood', 'HOME_PROP_BATCH_1_brass'],
    }]);
  });

  it('ranks at most ten authored material names, combining repeated labels', () => {
    const materials = Array.from({ length: 12 }, (_, i) => ({
      name: `MAT_${String(i).padStart(2, '0')}`,
      transparent: i === 0,
    }));
    const root = {
      traverse(visitor) {
        for (const material of materials) {
          visitor({ isMesh: true, geometry: {}, material, castShadow: material === materials[0] });
        }
        // Multiple distinct material objects can carry the same authored name.
        visitor({ isMesh: true, geometry: {}, material: { name: 'MAT_00', transparent: false }, castShadow: true });
      },
    };
    const ranking = homeBlenderModelDrawInventory(root).topMaterials;
    expect(ranking).toHaveLength(10);
    expect(ranking[0]).toEqual({
      material: 'MAT_00', slots: 2, transparentSlots: 1, shadowCasterSlots: 2,
    });
    expect(ranking.slice(1).map((entry) => entry.material)).toEqual(
      materials.slice(1, 10).map((material) => material.name),
    );
  });
});
