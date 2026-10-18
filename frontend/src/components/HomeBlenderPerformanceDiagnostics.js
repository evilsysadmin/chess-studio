// Opt-in Home GPU profiling. All queries are asynchronous: never wait for GPU completion.
export function createHomeBlenderGpuTimer(gl, { enabled = false, software = false, sampleEvery = 30 } = {}) {
  const noop = () => {};
  const inactive = (status) => ({
    get status() { return status; },
    get lastMs() { return null; },
    get lastCompletedTag() { return null; },
    get completedSamples() { return 0; },
    begin: noop, end: noop, poll: () => null, dispose: noop,
  });
  if (!enabled) return inactive('disabled');
  if (software) return inactive('software');
  if (!gl?.createQuery || !gl?.getQueryParameter || !gl?.beginQuery || !gl?.endQuery) {
    return inactive('unsupported');
  }

  let extension;
  try {
    extension = gl.getExtension?.('EXT_disjoint_timer_query_webgl2');
  } catch {
    return inactive('unsupported');
  }
  if (!extension) return inactive('unsupported');

  let status = 'sampling';
  let lastMs = null;
  let completedSamples = 0;
  let frame = 0;
  let active = null;
  let activeTag = null;
  let pending = null;
  let pendingTag = null;
  let lastCompletedTag = null;
  let disposed = false;
  const safelyDelete = (query) => {
    if (!query) return;
    try { gl.deleteQuery(query); } catch { /* Context may already be lost. */ }
  };
  const poll = () => {
    if (disposed || !pending) return null;
    try {
      // A disjoint event invalidates an elapsed query, even if a result is available.
      if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
        safelyDelete(pending);
        pending = null;
        pendingTag = null;
        lastMs = null;
        lastCompletedTag = null;
        status = 'disjoint';
        return null;
      }
      if (!gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)) return null;
      const nanoseconds = gl.getQueryParameter(pending, gl.QUERY_RESULT);
      safelyDelete(pending);
      pending = null;
      if (!Number.isFinite(nanoseconds) || nanoseconds < 0) {
        pendingTag = null;
        lastCompletedTag = null;
        lastMs = null;
        status = 'invalid';
        return null;
      }
      lastMs = nanoseconds / 1_000_000;
      lastCompletedTag = pendingTag;
      pendingTag = null;
      // The last successful result remains readable while the next query is
      // pending. Benchmark consumers need an identity to avoid counting it twice.
      completedSamples += 1;
      status = 'ready';
      return lastMs;
    } catch {
      safelyDelete(pending);
      pending = null;
      pendingTag = null;
      lastMs = null;
      lastCompletedTag = null;
      status = 'error';
      return null;
    }
  };
  return {
    get status() { return status; },
    get lastMs() { return lastMs; },
    get lastCompletedTag() { return lastCompletedTag; },
    get completedSamples() { return completedSamples; },
    poll,
    begin(tag = null) {
      if (disposed || status === 'error') return;
      poll();
      frame += 1;
      if (active || pending || frame % sampleEvery !== 0) return;
      let query = null;
      try {
        query = gl.createQuery();
        if (!query) return;
        gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        active = query;
        activeTag = tag;
      } catch {
        safelyDelete(query);
        activeTag = null;
        status = 'error';
      }
    },
    end() {
      if (disposed || !active) return;
      const query = active;
      active = null;
      try {
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        pending = query;
        pendingTag = activeTag;
        activeTag = null;
      } catch {
        safelyDelete(query);
        activeTag = null;
        status = 'error';
      }
    },
    dispose() {
      if (disposed) return;
      // We never block to collect a pending query during teardown.
      if (active) {
        try { gl.endQuery(extension.TIME_ELAPSED_EXT); } catch { /* Context lost. */ }
        safelyDelete(active);
      }
      safelyDelete(pending);
      active = null;
      pending = null;
      activeTag = null;
      pendingTag = null;
      lastCompletedTag = null;
      disposed = true;
    },
  };
}

export function homeBlenderP95Ms(samples) {
  const finite = samples.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  return finite.length ? finite[Math.ceil(finite.length * 0.95) - 1] : null;
}

export function createHomeBlenderFrameSamples(maxSamples = 120) {
  const costs = [];
  const vsyncGaps = [];
  const add = (list, value) => {
    if (!Number.isFinite(value) || value < 0 || value > 250) return;
    if (list.length === maxSamples) list.shift();
    list.push(value);
  };
  return {
    addCpu: (ms) => add(costs, ms),
    addVsyncGap: (ms) => add(vsyncGaps, ms),
    snapshot: () => ({
      cpuP95Ms: homeBlenderP95Ms(costs),
      vsyncP95Ms: homeBlenderP95Ms(vsyncGaps),
      cpuSamples: costs.length,
      vsyncSamples: vsyncGaps.length,
    }),
  };
}

// One-time authored-GLB draw inventory for the opt-in physical-GPU profiler.
// These are visible *potential* draw slots, NOT observed WebGL draw calls:
// frustum culling, material groups, shadow passes, and renderer batching can
// all change the actual count. Do not present them as GPU milliseconds or VRAM.
export function homeBlenderModelDrawInventory(root) {
  const geometries = new Set();
  const materials = new Set();
  const materialDrawSlots = new Map();
  const stats = {
    meshes: 0,
    drawSlotCandidates: 0,
    transparentSlots: 0,
    shadowCasterSlots: 0,
    sharedGeometryMeshes: 0,
    uniqueGeometries: 0,
    uniqueMaterials: 0,
    topMaterials: [],
  };
  if (typeof root?.traverse !== 'function') return stats;
  root.traverse((object) => {
    if (!object?.isMesh || !object.geometry || object.visible === false) return;
    // Omit children under a hidden ancestor (e.g. day-only moon features).
    for (let parent = object.parent; parent; parent = parent.parent) {
      if (parent.visible === false) return;
    }
    stats.meshes += 1;
    if (geometries.has(object.geometry)) stats.sharedGeometryMeshes += 1;
    geometries.add(object.geometry);
    const materialArray = Array.isArray(object.material) ? object.material : null;
    // Three.js draws multi-material meshes only through explicit geometry
    // groups; without groups the array creates no draw entries.
    const groups = materialArray
      ? (object.geometry.groups || [])
      : [{ materialIndex: 0 }];
    for (const group of groups) {
      if (group.count === 0) continue;
      const material = materialArray ? materialArray[group.materialIndex] : object.material;
      if (!material || material.visible === false) continue;
      materials.add(material);
      stats.drawSlotCandidates += 1;
      if (material.transparent) stats.transparentSlots += 1;
      if (object.castShadow) stats.shadowCasterSlots += 1;
      // A bounded opt-in ranking reveals *where* authored draw candidates
      // concentrate before attempting GLB batching or shadow changes. Different
      // material instances with the same authored name share a diagnostic row.
      const name = String(material.name || '').trim() || '(unnamed)';
      let entry = materialDrawSlots.get(name);
      if (!entry) {
        entry = { material: name, slots: 0, transparentSlots: 0, shadowCasterSlots: 0 };
        materialDrawSlots.set(name, entry);
      }
      entry.slots += 1;
      if (material.transparent) entry.transparentSlots += 1;
      if (object.castShadow) entry.shadowCasterSlots += 1;
    }
  });
  stats.uniqueGeometries = geometries.size;
  stats.uniqueMaterials = materials.size;
  stats.topMaterials = [...materialDrawSlots.values()]
    .sort((a, b) => b.slots - a.slots || a.material.localeCompare(b.material))
    .slice(0, 10);
  return stats;
}

// Three.js exposes allocation counts, not texture byte totals. Never label these as MB.
export function homeBlenderGpuResourceCounts(renderer) {
  const memory = renderer?.info?.memory;
  const finite = (value) => Number.isFinite(value) && value >= 0 ? value : null;
  return {
    textures: finite(memory?.textures),
    geometries: finite(memory?.geometries),
    programs: Array.isArray(renderer?.info?.programs) ? renderer.info.programs.length : null,
  };
}

/**
 * Extract only distinct, successful asynchronous GPU timing results from
 * diagnostic snapshots. A browser can publish the same last-result value
 * for several seconds while a subsequent query is pending: repeating that
 * value does not create another independent observation.
 */
export function homeBlenderDistinctGpuSamplesMs(snapshots) {
  let lastAcceptedCount = 0;
  const samples = [];
  for (const snapshot of snapshots) {
    const { gpuSampleCount, gpuStatus, gpuMs } = snapshot || {};
    if (gpuStatus !== 'ready'
      || !Number.isSafeInteger(gpuSampleCount)
      || gpuSampleCount <= lastAcceptedCount
      || !Number.isFinite(gpuMs)
      || gpuMs < 0) continue;
    lastAcceptedCount = gpuSampleCount;
    samples.push(gpuMs);
  }
  return samples;
}
