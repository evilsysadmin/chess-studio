export function chroniclesPartyRelic(state, memberId) {
  if (memberId === 'bishop' && state?.spectralLantern) return 'spectral-lantern';
  return null;
}
