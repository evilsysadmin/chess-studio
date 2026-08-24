export const COMBAT_CHESS_NAME = 'Combat Chess';
export const COMBAT_CHESS_GENRE = 'Roguelike militar';
export const COMBAT_CHESS_FREE_LABEL = 'Combat Chess · Batalla libre';
export const COMBAT_CHESS_CAMPAIGN_LABEL = 'Combat Chess · Campaña';
export const COMBAT_CHESS_FREE_DESCRIPTION = 'Una batalla aislada con tu ejército persistente: niveles, esquive, bajas, rangos y metamorfosis, sin mapa de campaña.';
export const COMBAT_CHESS_CAMPAIGN_DESCRIPTION = 'Campaña roguelike por nodos con el mismo ejército persistente: combates, élites, campamentos, eventos y bosses.';

// El paraguas visible es siempre Combat Chess. Los IDs internos conservan
// `combat` / `roguelike` para no romper partidas guardadas ni migraciones.
// Los registros roguelike antiguos no tenían `roguelikeMode`: eran la Torre,
// así que mantenemos ese fallback por compatibilidad histórica.
export function combatRecordModeLabel(record = {}) {
  if (!(record?.log || record?.variant === 'combat' || record?.variant === 'roguelike' || record?.roguelikeMode)) return null;
  if (record?.variant !== 'roguelike' && !record?.roguelikeMode) return COMBAT_CHESS_FREE_LABEL;
  switch (record?.roguelikeMode) {
    case 'campaign': return COMBAT_CHESS_CAMPAIGN_LABEL;
    case 'endless': return 'Combat Chess · Torre infinita';
    case 'tower': return 'Combat Chess · Torre';
    default: return record?.variant === 'roguelike' ? 'Combat Chess · Torre' : COMBAT_CHESS_FREE_LABEL;
  }
}
