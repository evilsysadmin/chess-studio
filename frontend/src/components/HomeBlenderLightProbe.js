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
]);

export function homeBlenderLightProbeMode(search = '') {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const mode = params.get('homeLightProbe');
  return params.get('homeGpuProfile') === '1' && DIAGNOSTIC_MODES.has(mode)
    ? mode : 'normal';
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
  const family = mode === 'aux-off' ? null
    : mode === 'wall-pair' ? 'wall' : mode.slice(4, -4);
  let disabled = 0;
  for (const entry of torches) {
    const light = entry?.light;
    if (light && light.castShadow !== true
      && (family === null || light.userData?.homeLightProbeFamily === family)) {
      light.visible = false;
      disabled += 1;
    }
  }
  return disabled;
}

// Two gentle, wider-spread torch fills between the original four flames.
// Diagnostic only: the four real torch Light objects are left in place
// (hidden from shading) so their independent glow sprites keep flickering.
// Do not promote the candidate as a production lighting policy without
// actual WebGL screenshot review and repeat physical-GPU A/B data.
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
