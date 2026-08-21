export const COMBAT_CHESS_NAME = 'Combat Chess';
export const COMBAT_CHESS_GENRE = 'Roguelike militar';
export const COMBAT_CHESS_TAGLINE = 'Forma tu ejército. Haz veteranos. Rompe las reglas. Sobrevive.';

// El nombre visible cambia; los IDs internos siguen usando `roguelike` para no
// romper partidas guardadas, tests ni migraciones de perfil.
export function combatRecordModeLabel(record) {
  if (!record?.log) return null;
  return record.variant === 'roguelike' ? COMBAT_CHESS_NAME : 'Combate';
}
