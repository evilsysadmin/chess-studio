// Traduce un nivel de dificultad 0–100 a una etiqueta legible. Se usa tanto
// en el selector del menú como en la partida y en el modo torneo, para que
// el mismo número siempre se lea igual en toda la app.
export function difficultyLabel(level) {
  if (level < 20) return 'Principiante';
  if (level < 45) return 'Aficionado';
  if (level < 70) return 'Intermedio';
  if (level < 90) return 'Avanzado';
  return 'Implacable';
}
