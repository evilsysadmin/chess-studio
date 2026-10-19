// Opt-in census of REAL Three.js render submissions in the Home. Never renders
// additional frames, changes lights/shaders or touches ordinary sessions.
const fresh = () => ({ castle: 0, matthias: 0, runtime: 0 });

export function installHomeBlenderDrawPassProbe(renderer, classify) {
  const shadowMap = renderer?.shadowMap;
  const counts = renderer?.info?.render;
  const originalShadow = shadowMap?.render;
  const originalDirect = renderer?.renderBufferDirect;
  if (typeof originalShadow !== 'function' || typeof originalDirect !== 'function'
      || !counts || typeof classify !== 'function') return null;

  let insideShadow = false;
  let valid = true;
  let shadowCalls = 0;
  let shadowPasses = 0;
  let families = { shadow: fresh(), main: fresh() };
  const validCounter = (value) => Number.isSafeInteger(value) && value >= 0;

  const direct = function (...args) {
    const before = counts.calls;
    let succeeded = false;
    try {
      const result = originalDirect.apply(this, args);
      succeeded = true;
      return result;
    } finally {
      const after = counts.calls;
      if (!succeeded || !validCounter(before) || !validCounter(after) || after < before) {
        valid = false;
      } else if (after > before) {
        const family = classify(args[4]);
        if (!Object.hasOwn(families.main, family)) valid = false;
        else families[insideShadow ? 'shadow' : 'main'][family] += after - before;
      }
    }
  };
  const shadow = function (...args) {
    const before = counts.calls;
    let succeeded = false;
    insideShadow = true;
    try {
      const result = originalShadow.apply(this, args);
      succeeded = true;
      return result;
    } finally {
      insideShadow = false;
      const after = counts.calls;
      if (!succeeded || !validCounter(before) || !validCounter(after) || after < before) {
        valid = false;
      } else {
        shadowCalls += after - before;
        shadowPasses += 1;
      }
    }
  };
  try {
    shadowMap.render = shadow;
    renderer.renderBufferDirect = direct;
    if (shadowMap.render !== shadow || renderer.renderBufferDirect !== direct) {
      throw new Error('Three renderer does not support draw pass observation');
    }
  } catch {
    if (shadowMap.render === shadow) shadowMap.render = originalShadow;
    if (renderer.renderBufferDirect === direct) renderer.renderBufferDirect = originalDirect;
    return null;
  }

  return {
    begin() {
      insideShadow = false;
      valid = shadowMap.render === shadow && renderer.renderBufferDirect === direct;
      shadowCalls = 0;
      shadowPasses = 0;
      families = { shadow: fresh(), main: fresh() };
    },
    sample(totalCalls) {
      if (!valid || !validCounter(totalCalls) || shadowCalls > totalCalls) return null;
      const mainCalls = totalCalls - shadowCalls;
      const sum = (group) => Object.values(group).reduce((acc, count) => acc + count, 0);
      const observedShadow = sum(families.shadow);
      const observedMain = sum(families.main);
      // Even partial attribution cannot exceed the renderer's real counters.
      if (observedShadow > shadowCalls || observedMain > mainCalls) return null;
      // Unobserved render paths are unavailable, NEVER silently assigned to runtime.
      const attributed = observedShadow === shadowCalls && observedMain === mainCalls;
      return {
        totalCalls, shadowCalls, mainCalls, shadowPasses,
        families: attributed ? {
          shadow: { ...families.shadow },
          main: { ...families.main },
        } : null,
      };
    },
    dispose() {
      if (shadowMap.render === shadow) shadowMap.render = originalShadow;
      if (renderer.renderBufferDirect === direct) renderer.renderBufferDirect = originalDirect;
    },
  };
}

// Compare object identities, not names: the separately loaded actor's GLB
// can share authored prefixes with other meshes, and normal runtime sprites
// do not belong to either imported model.
export function homeBlenderDrawFamily(object, modelRoot, actorRoot) {
  for (let node = object; node; node = node.parent) {
    if (node === actorRoot && actorRoot) return 'matthias';
    if (node === modelRoot && modelRoot) return 'castle';
  }
  return 'runtime';
}
