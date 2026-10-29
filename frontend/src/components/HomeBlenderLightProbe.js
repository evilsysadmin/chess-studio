// Explicit physical-GPU experiment, never an automatic visual/quality policy.
// Query opt-in requires the existing GPU profiler as a second deliberate flag.
// Real users, including those using ?homeGpuProfile=1 alone, see the canon.
// Four explicit families account for the twelve existing auxiliary lights.
// Keep default 'aux-off' mode for historical A/B reports.
export const HOME_BLENDER_LIGHT_PROBE_FAMILIES = Object.freeze({
  all: 12, wall: 4, board: 2, stairs: 3, accent: 3,
});

const DIAGNOSTIC_MODES = new Set([
  'normal', 'aux-off', 'aux-wall-off', 'aux-board-off',
  'aux-stairs-off', 'aux-accent-off', 'wall-pair',
  // Explicitly profile the current production two-fill layout, not the
  // historical four-point baseline used by existing A/B reports.
  'pair-normal', 'pair-aux-board-off',
  'pair-aux-stairs-off', 'pair-aux-accent-off',
  // Profile just one of the three production accents while preserving the
  // other two, the two published wall fills and all visible flame sprites.
  'pair-aux-accent-dungeon-off',
  'pair-aux-accent-table-off',
  'pair-aux-accent-reading-off',
]);

export function homeBlenderLightProbeMode(search = '') {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const mode = params.get('homeLightProbe');
  return params.get('homeGpuProfile') === '1' && DIAGNOSTIC_MODES.has(mode)
    ? mode : 'normal';
}

// Full-quality Home uses the visual-reviewed two-point wall fill by default.
// The canonical four-sconce layout remains an instant URL rollback, and every
// explicit GPU A/B trial keeps its historical FOUR-light baseline. This avoids
// silently changing the meaning of earlier family-level hardware reports.
export function homeBlenderWallTorchLayout(search = '') {
  const params = new URLSearchParams(String(search).replace(/^[?]/, ''));
  const mode = params.get('homeLightProbe');
  if (params.get('homeGpuProfile') === '1' && DIAGNOSTIC_MODES.has(mode)) {
    return mode === 'wall-pair' || mode.startsWith('pair-') ? 'pair' : 'legacy';
  }
  return params.get('homeWallTorches') === 'legacy' ? 'legacy' : 'pair';
}

// A/B/B/A needs two comparable FULL renderers. The production governor
// correctly degrades under sustained jank, but doing so in just one visit
// would compare a different scene instead of light-shader cost. Lock full
// only for the explicit trial, never for profiling alone or ordinary Home.
export function homeBlenderLightProbeLocksFullLod(search = '', initialLod = null) {
  if (initialLod !== 'full') return false;
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  return params.get('homeGpuProfile') === '1'
    && DIAGNOSTIC_MODES.has(params.get('homeLightProbe'));
}

// The ancillary lights don't cast shadows; keep the shadow-casting key,
// dominant fireplaces, fill/ambient, PBR environment, and *all* additive
// glow sprites unchanged. Invisible Three lights are excluded from shader
// light lists. No flicker/power configuration or scene assets are mutated.
export function applyHomeBlenderLightProbe(torches, mode) {
  if (!DIAGNOSTIC_MODES.has(mode) || mode === 'normal') return 0;
  const pair = mode === 'wall-pair' || mode.startsWith('pair-');
  const selectedAccent = mode.startsWith('pair-aux-accent-')
    ? mode.slice('pair-aux-accent-'.length, -'-off'.length) : null;
  const family = mode === 'aux-off' ? null
    : mode === 'wall-pair' || mode === 'pair-normal' ? 'wall'
      : selectedAccent ? 'accent'
        : mode.startsWith('pair-aux-') ? mode.slice(9, -4) : mode.slice(4, -4);
  let disabled = 0;
  for (const entry of torches) {
    const light = entry?.light;
    if (!light || light.castShadow === true) continue;
    const lightFamily = light.userData?.homeLightProbeFamily;
    const exclude = pair
      ? lightFamily === 'wall' || (family !== 'wall' && lightFamily === family
        && (!selectedAccent || light.userData?.homeLightProbeAccent === selectedAccent))
      : family === null || lightFamily === family;
    if (exclude) {
      light.visible = false;
      disabled += 1;
    }
  }
  return disabled;
}

// Two gentle, wider-spread torch fills between the original four flames.
// Production-approved in PR #5850; the original four shading lights remain
// present for the exact legacy rollback and the flickering torch glow sprites.
export function homeBlenderWallPairFillPlan(xs) {
  if (!Array.isArray(xs) || xs.length !== 4 || !xs.every(Number.isFinite)) {
    return [];
  }
  return [
    (xs[0] + xs[1]) / 2,
    (xs[2] + xs[3]) / 2,
  ].map((x) => Object.freeze({
    x, y: 3.15, z: -5.5,
    color: 0xff8a3c, intensity: 10, distance: 8, decay: 2,
  }));
}
