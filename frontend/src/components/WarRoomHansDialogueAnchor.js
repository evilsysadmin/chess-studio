const HANS_DIALOGUE_ANCHOR_SCREEN_STATES = new Set(['onscreen', 'edge', 'offscreen']);

export function hansDialogueAnchorScreenEligible(screenState) {
  return HANS_DIALOGUE_ANCHOR_SCREEN_STATES.has(String(screenState || ''));
}
