// Timing decisions live outside the Web Audio scheduler so their musical
// behaviour can be regression-tested without constructing an AudioContext.

export function shouldPlayStructuredLead(mode, localStep, stepsPerSection) {
  if (mode === 'late') return localStep >= Math.floor(stepsPerSection / 2);
  // Sparse means one four-step phrase on, one phrase off. Keeping complete
  // phrases preserves their downbeat and contour; dropping every fourth step
  // used to remove the very notes that made the motif feel anchored.
  if (mode === 'sparse') return Math.floor(localStep / 4) % 2 === 0;
  return true;
}

export function shouldPlayStructuredSignature(signatureVoice, activeVoices = []) {
  if (!signatureVoice) return false;
  // A signature may intentionally harmonise another lane. Only suppress the
  // exact same player and pitch, which would otherwise schedule two attacks at
  // the same instant and sound like a flam, phase smear or accidental accent.
  return !activeVoices.some((voice) => voice
    && voice.instrument === signatureVoice.instrument
    && voice.note === signatureVoice.note);
}
