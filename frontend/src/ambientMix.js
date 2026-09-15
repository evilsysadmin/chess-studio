const DEFAULT_STEM = 'lead';

// Each musical role gets its own small strip before the shared music bus.
// The cuts are deliberately broad: they create room without changing the
// authored timbre or turning the browser into a mastering plug-in rack.
export const AMBIENT_STEM_MIX = Object.freeze({
  signature: Object.freeze({ gain: 0.94, highpassHz: 105, lowpassHz: 8200 }),
  lead: Object.freeze({ gain: 1.00, highpassHz: 68, lowpassHz: 9400 }),
  counter: Object.freeze({ gain: 0.93, highpassHz: 92, lowpassHz: 7900 }),
  chords: Object.freeze({ gain: 0.91, highpassHz: 54, lowpassHz: 7200 }),
  bass: Object.freeze({ gain: 1.04, highpassHz: 27, lowpassHz: 1650 }),
});

export const AMBIENT_MASTERING = Object.freeze({
  musicHighpassHz: 24,
  presenceHz: 4300,
  presenceDb: 0.8,
  glue: Object.freeze({ threshold: -19, knee: 16, ratio: 2.25, attack: 0.026, release: 0.22 }),
  limiter: Object.freeze({ threshold: -4.5, knee: 2.5, ratio: 12, attack: 0.003, release: 0.11 }),
});

export function ambientStemName(stem) {
  return Object.prototype.hasOwnProperty.call(AMBIENT_STEM_MIX, stem) ? stem : DEFAULT_STEM;
}

export function ambientStemMix(stem) {
  return AMBIENT_STEM_MIX[ambientStemName(stem)];
}
