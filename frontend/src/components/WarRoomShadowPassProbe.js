// Only active when the War Room GPU profiler explicitly opts in. Three's
// shadowMap.render wraps the actual depth pass. WebGLRenderer.renderBufferDirect
// is the common per-draw submission path; use its real info.calls delta to
// distinguish chess pieces from the Blender shell and remaining casters.
// A callback count or scene.traverse() alone is NOT an actual GPU draw count.
export function warRoomShadowDrawFamily(object) {
  for (let node = object; node; node = node.parent) {
    const data = node.userData;
    if (data?.type && data?.color && data?.square) return 'pieces';
    if (data?.warRoomVariant && data?.warRoomRuntimeFinish) return 'shell';
    if (/^war-room-v[234]-blender-shell$/.test(node.name || '')) return 'shell';
  }
  return 'other';
}

export function installWarRoomShadowPassProbe(renderer) {
  const shadowMap = renderer?.shadowMap;
  const counts = renderer?.info?.render;
  const original = shadowMap?.render;
  if (typeof original !== 'function' || !counts) return null;
  const originalDirect = renderer?.renderBufferDirect;
  const hasDirect = typeof originalDirect === 'function';
  let shadowCalls = 0;
  let passes = 0;
  let valid = true;
  let insideShadow = false;
  let familyValid = hasDirect;
  let families = { pieces: 0, shell: 0, other: 0 };
  // Opt-in only, ephemeral per real renderer.render() call. Keys are actual
  // Three objects (not names, which may collide after Blender batching).
  const casterCalls = new Map();
  let casterValid = hasDirect;

  // Preserve exact receiver/arguments: Three may supply a shader-material
  // override or geometry group. We only observe the call after it succeeds.
  const directWrapper = function (...args) {
    if (!insideShadow) return originalDirect.apply(this, args);
    const before = counts.calls;
    let succeeded = false;
    try {
      const result = originalDirect.apply(this, args);
      succeeded = true;
      return result;
    } finally {
      const after = counts.calls;
      if (!succeeded || !Number.isSafeInteger(before) || before < 0
          || !Number.isSafeInteger(after) || after < before) {
        familyValid = false;
      } else {
        const delta = after - before;
        const object = args[4];
        const family = warRoomShadowDrawFamily(object);
        families[family] += delta;
        if (delta > 0) {
          if (!object || typeof object !== 'object' || casterCalls.size > 512) {
            casterValid = false;
          } else {
            const current = casterCalls.get(object);
            if (current) current.calls += delta;
            else casterCalls.set(object, {
              name: String(object.name || object.parent?.name || '(unnamed)').slice(0, 96),
              family, calls: delta,
            });
          }
        }
      }
    }
  };

  const wrapped = function (...args) {
    const before = counts.calls;
    let succeeded = false;
    insideShadow = true;
    try {
      const result = original.apply(this, args);
      succeeded = true;
      return result;
    } finally {
      insideShadow = false;
      const after = counts.calls;
      if (!succeeded || !Number.isSafeInteger(before) || before < 0
          || !Number.isSafeInteger(after) || after < before) {
        valid = false;
        familyValid = false;
      } else {
        shadowCalls += after - before;
        passes += 1;
      }
    }
  };

  try {
    shadowMap.render = wrapped;
    if (shadowMap.render !== wrapped) return null;
    if (hasDirect) {
      renderer.renderBufferDirect = directWrapper;
      if (renderer.renderBufferDirect !== directWrapper) familyValid = false;
    }
  } catch {
    if (shadowMap.render === wrapped) shadowMap.render = original;
    if (renderer.renderBufferDirect === directWrapper) renderer.renderBufferDirect = originalDirect;
    return null;
  }

  return {
    begin() {
      shadowCalls = 0;
      passes = 0;
      valid = true;
      insideShadow = false;
      familyValid = hasDirect && renderer.renderBufferDirect === directWrapper;
      families = { pieces: 0, shell: 0, other: 0 };
      casterCalls.clear();
      casterValid = hasDirect && renderer.renderBufferDirect === directWrapper;
    },
    sample(totalCalls) {
      if (!valid || !Number.isSafeInteger(totalCalls)
          || shadowCalls > totalCalls || totalCalls < 0) return null;
      const result = { shadowCalls, mainCalls: totalCalls - shadowCalls, shadowPasses: passes };
      const { pieces, shell, other } = families;
      // Missing API, unusual internal Three path, or invalid counters must
      // yield unavailable, never misleading zeros or partial attribution.
      if (familyValid && pieces + shell + other === shadowCalls) {
        result.shadowFamilyCalls = { pieces, shell, other };
        const candidates = [...casterCalls.values()];
        const counted = candidates.reduce((sum, item) => sum + item.calls, 0);
        if (casterValid && counted === shadowCalls) {
          candidates.sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
          const top = candidates.slice(0, 8);
          result.shadowTopCasters = {
            top: top.map((item) => ({ ...item })),
            unrankedCalls: shadowCalls - top.reduce((sum, item) => sum + item.calls, 0),
          };
        }
      }
      return result;
    },
    dispose() {
      if (shadowMap.render === wrapped) shadowMap.render = original;
      if (hasDirect && renderer.renderBufferDirect === directWrapper) {
        renderer.renderBufferDirect = originalDirect;
      }
    },
  };
}
