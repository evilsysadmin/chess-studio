// Opt-in census of REAL Three.js render submissions in the Home. Never renders
// additional frames, changes lights/shaders or touches ordinary sessions.
const fresh = () => ({ castle: 0, matthias: 0, runtime: 0 });
const HOTSPOT_LIMIT = 12;

// Names are diagnostic labels, never identities: duplicate Blender names can
// appear in separate rows. Actual submissions are grouped by object reference.
function drawObjectPath(object) {
  const names = [];
  for (let node = object, depth = 0; node && depth < 12 && names.length < 4; node = node.parent, depth += 1) {
    const name = typeof node.name === 'string' ? node.name.trim().slice(0, 64) : '';
    if (name) names.push(name);
  }
  return names.length ? names.reverse().join(' / ').slice(0, 180) : '(unnamed mesh)';
}

function summarizeHotspots(objects, totalCalls) {
  const ranked = [...objects].map(([object, value]) => ({
    family: value.family, name: drawObjectPath(object), calls: value.calls,
  })).sort((a, b) => b.calls - a.calls || a.family.localeCompare(b.family) || a.name.localeCompare(b.name));
  const top = ranked.slice(0, HOTSPOT_LIMIT);
  return {
    uniqueObjects: ranked.length,
    top,
    otherCalls: totalCalls - top.reduce((sum, item) => sum + item.calls, 0),
  };
}

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
  let objects = { shadow: new Map(), main: new Map() };
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
        else {
          const pass = insideShadow ? 'shadow' : 'main';
          const delta = after - before;
          families[pass][family] += delta;
          const object = args[4];
          const previous = objects[pass].get(object);
          objects[pass].set(object, { family, calls: (previous?.calls || 0) + delta });
        }
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
      objects = { shadow: new Map(), main: new Map() };
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
        // Bounded leaderboard of measured calls, NOT GPU time or draw
        // candidates. Keep unavailable whenever the full census is invalid.
        hotspots: attributed ? {
          shadow: summarizeHotspots(objects.shadow, shadowCalls),
          main: summarizeHotspots(objects.main, mainCalls),
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
