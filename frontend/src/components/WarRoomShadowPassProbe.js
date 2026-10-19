// Profiler-only instrumentation of Three.js' existing shadow pass.
// Never issues draws/queries, changes lights, or changes material/shader state.
// Three's render.info includes shadow passes; a total alone can't tell us
// whether to optimize the shell or the depth-map submission path.
export function installWarRoomShadowPassProbe(renderer) {
  const shadowMap = renderer?.shadowMap;
  const counts = renderer?.info?.render;
  const original = shadowMap?.render;
  if (typeof original !== 'function' || !counts) return null;
  let shadowCalls = 0;
  let passes = 0;
  let valid = true;
  const wrapped = function (...args) {
    const before = counts.calls;
    let succeeded = false;
    try {
      const result = original.apply(this, args);
      succeeded = true;
      return result;
    } finally {
      const after = counts.calls;
      if (!succeeded || !Number.isSafeInteger(before) || before < 0
          || !Number.isSafeInteger(after) || after < before) {
        valid = false;
      } else {
        shadowCalls += after - before;
        passes += 1;
      }
    }
  };
  try {
    shadowMap.render = wrapped;
    if (shadowMap.render !== wrapped) return null;
  } catch {
    return null;
  }
  return {
    begin() {
      shadowCalls = 0;
      passes = 0;
      valid = true;
    },
    sample(totalCalls) {
      if (!valid || !Number.isSafeInteger(totalCalls)
          || shadowCalls > totalCalls || totalCalls < 0) return null;
      return { shadowCalls, mainCalls: totalCalls - shadowCalls, shadowPasses: passes };
    },
    dispose() {
      if (shadowMap.render === wrapped) shadowMap.render = original;
    },
  };
}
