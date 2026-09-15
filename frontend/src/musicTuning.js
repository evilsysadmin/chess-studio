// Afinación de concierto única para toda la radio de Chess Studio.
// Las partituras MIDI y las frecuencias históricas del generador Al-Ándalus
// se escribieron contra A4=440 Hz; este módulo aplica el mismo desplazamiento
// a síntesis, cuerdas físicas y muestras para que nunca convivan dos afinaciones.
export const STANDARD_CONCERT_PITCH_HZ = 440;
export const CHESS_STUDIO_CONCERT_PITCH_HZ = 432;
export const CHESS_STUDIO_TUNING_RATIO = CHESS_STUDIO_CONCERT_PITCH_HZ / STANDARD_CONCERT_PITCH_HZ;
export const CHESS_STUDIO_TUNING_CENTS = 1200 * Math.log2(CHESS_STUDIO_TUNING_RATIO);

export function tuneStandardFrequency(frequency) {
  return Number(frequency) * CHESS_STUDIO_TUNING_RATIO;
}

export function midiToChessStudioFrequency(note) {
  return CHESS_STUDIO_CONCERT_PITCH_HZ * (2 ** ((Number(note) - 69) / 12));
}

export function orchestralPlaybackRateForSemitones(semitones) {
  return CHESS_STUDIO_TUNING_RATIO * (2 ** (Number(semitones) / 12));
}
