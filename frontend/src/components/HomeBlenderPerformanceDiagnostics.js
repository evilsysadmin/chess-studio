// Opt-in Home GPU profiling. All queries are asynchronous: never wait for GPU completion.
export function createHomeBlenderGpuTimer(gl, { enabled = false, software = false, sampleEvery = 30 } = {}) {
  const noop = () => {};
  const inactive = (status) => ({
    get status() { return status; },
    get lastMs() { return null; },
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
  let frame = 0;
  let active = null;
  let pending = null;
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
        lastMs = null;
        status = 'disjoint';
        return null;
      }
      if (!gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)) return null;
      const nanoseconds = gl.getQueryParameter(pending, gl.QUERY_RESULT);
      safelyDelete(pending);
      pending = null;
      if (!Number.isFinite(nanoseconds) || nanoseconds < 0) {
        lastMs = null;
        status = 'invalid';
        return null;
      }
      lastMs = nanoseconds / 1_000_000;
      status = 'ready';
      return lastMs;
    } catch {
      safelyDelete(pending);
      pending = null;
      lastMs = null;
      status = 'error';
      return null;
    }
  };
  return {
    get status() { return status; },
    get lastMs() { return lastMs; },
    poll,
    begin() {
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
      } catch {
        safelyDelete(query);
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
      } catch {
        safelyDelete(query);
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
