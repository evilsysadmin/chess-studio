// Pure presentation policy. Never infer visible actor geometry from an
// off-camera route: in narrow touch rooms use a small genuine activity cue.
// Stable copy tied to actual scene choreography, never an invented actor sighting.
// A single stable cue spans the sustained carry and the brief placement,
// avoiding a one-frame message that a player cannot meaningfully read.
const LOG_WORK_COPY = Object.freeze({
  text: 'Preparando el fuego',
  ariaLabel: 'Hans está preparando el fuego fuera de cámara',
});
const HEARTH_CUE_COPY = Object.freeze({
  'carry-log': LOG_WORK_COPY,
  'place-log': LOG_WORK_COPY,
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
