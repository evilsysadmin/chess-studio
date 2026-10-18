// Explicit physical-GPU experiment, never an automatic visual/quality policy.
// Query opt-in requires the existing GPU profiler as a second deliberate flag.
// Real users, including those using ?homeGpuProfile=1 alone, see the canon.
export function homeBlenderLightProbeMode(search = '') {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  return params.get('homeGpuProfile') === '1' && params.get('homeLightProbe') === 'aux-off'
    ? 'aux-off' : 'normal';
}

// A/B/B/A needs two comparable FULL renderers. The production governor
// correctly degrades under sustained jank, but doing so in just one visit
// would compare a different scene instead of light-shader cost. Lock full
// only for the explicit trial, never for profiling alone or ordinary Home.
export function homeBlenderLightProbeLocksFullLod(search = '', initialLod = null) {
  if (initialLod !== 'full') return false;
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  return params.get('homeGpuProfile') === '1'
    && ['normal', 'aux-off'].includes(params.get('homeLightProbe'));
}

// The ancillary lights don't cast shadows; keep the shadow-casting key,
// dominant fireplaces, fill/ambient, PBR environment, and *all* additive
// glow sprites unchanged. Invisible Three lights are excluded from shader
// light lists. No flicker/power configuration or scene assets are mutated.
export function applyHomeBlenderLightProbe(torches, mode) {
  if (mode !== 'aux-off') return 0;
  let disabled = 0;
  for (const entry of torches) {
    if (entry?.light && entry.light.castShadow !== true) {
      entry.light.visible = false;
      disabled += 1;
    }
  }
  return disabled;
}
