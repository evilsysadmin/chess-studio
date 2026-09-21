function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

// Shared finish for procedural drums. Keep this deliberately conservative:
// the authored kit and pattern remain the personality; this layer only gives
// the hits a believable body and a tiny room around them.
export const AMBIENT_PERCUSSION_FINISH = Object.freeze({
  busGain: 1.02,
  lowShelfHz: 118,
  lowShelfDb: 3.2,
  compressor: Object.freeze({
    threshold: -18,
    knee: 18,
    ratio: 2.2,
    attack: 0.018,
    release: 0.18,
  }),
  room: Object.freeze({
    delayMs: 18,
    gain: 0.035,
    highpassHz: 180,
    lowpassHz: 4800,
  }),
  snare: Object.freeze({
    bodyGain: 0.22,
    startHz: 188,
    endHz: 154,
    duration: 0.105,
  }),
});

export function snareBodyFrequencies(tone = 0) {
  const safeTone = clamp(Number(tone) || 0, -1, 1);
  const { startHz, endHz } = AMBIENT_PERCUSSION_FINISH.snare;
  return Object.freeze({
    startHz: startHz * (1 + safeTone * 0.045),
    endHz: endHz * (1 + safeTone * 0.035),
  });
}
