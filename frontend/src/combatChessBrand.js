export const COMBAT_CHESS_NAME = 'Combat Chess';
export const COMBAT_CHESS_GENRE = 'Roguelike militar';
export const COMBAT_CHESS_TAGLINE = 'Forma tu ejército. Haz veteranos. Rompe las reglas. Sobrevive.';
export const COMBAT_CHESS_FREE_LABEL = 'Combat Chess · Batalla libre';
export const COMBAT_CHESS_CAMPAIGN_LABEL = 'Combat Chess · Campaña';
export const COMBAT_CHESS_FREE_DESCRIPTION = 'Una batalla aislada con tu ejército persistente: niveles, esquive, bajas, rangos y metamorfosis, sin mapa de campaña.';
export const COMBAT_CHESS_CAMPAIGN_DESCRIPTION = 'Campaña roguelike por nodos con el mismo ejército persistente: combates, élites, campamentos, eventos y bosses.';

// El paraguas visible es siempre Combat Chess. Los IDs internos conservan
// `combat` / `roguelike` para no romper partidas guardadas ni migraciones.
export function combatRecordModeLabel(record) {
  if (!record?.log) return null;
  return record.variant === 'roguelike' ? COMBAT_CHESS_CAMPAIGN_LABEL : COMBAT_CHESS_FREE_LABEL;
}
