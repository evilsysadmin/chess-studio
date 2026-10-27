// Pure presentation policy. Never infer visible actor geometry from an
// off-camera route: in narrow touch rooms use a small genuine activity cue.
// Stable copy tied to actual scene choreography, never an invented actor sighting.
const HEARTH_CUE_COPY = Object.freeze({
  'place-log': Object.freeze({
    text: 'Colocando leña',
    ariaLabel: 'Hans está colocando leña fuera de cámara',
  }),
  'stoke-fire': Object.freeze({
    text: 'Atizando el fuego',
    ariaLabel: 'Hans está atizando el fuego fuera de cámara',
  }),
});

export function getWarRoomHansV2MobileHearthCueCopy(choreographyPhase = '') {
  return Object.hasOwn(HEARTH_CUE_COPY, choreographyPhase)
    ? HEARTH_CUE_COPY[choreographyPhase]
    : null;
}

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
    && getWarRoomHansV2MobileHearthCueCopy(choreographyPhase) !== null
    && narrativePhase !== 'matthias';
}
