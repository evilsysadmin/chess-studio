// Pure presentation policy. Never infer visible actor geometry from an
// off-camera route: in narrow touch rooms use a small genuine activity cue.
export function showWarRoomHansV2MobileHearthCue({
  variant = '',
  screen = '',
  choreographyPhase = '',
  actorVisible = false,
  compactTouch = false,
  narrativePhase = '',
} = {}) {
  return variant === 'v2'
    && compactTouch
    && actorVisible
    && screen === 'offscreen'
    && choreographyPhase === 'stoke-fire'
    && narrativePhase !== 'matthias';
}
