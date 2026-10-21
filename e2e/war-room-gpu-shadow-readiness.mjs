/**
 * War Room hardware benchmarks must measure a fully warmed shadow pass.
 * Software renderer and touch emulations deliberately use the lite profile.
 */
export function expectedWarRoomGpuShadowWarmup(renderer, emulatedTouch) {
  if (renderer !== 'hardware' && renderer !== 'software') {
    throw new TypeError('GPU benchmark requires hardware or software renderer');
  }
  if (typeof emulatedTouch !== 'boolean') {
    throw new TypeError('GPU benchmark requires an explicit touch profile');
  }
  return renderer === 'software' || emulatedTouch
    ? 'disabled-lite'
    : 'ready-budgeted';
}
