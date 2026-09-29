// Incidentes tácticos del jugador que cuentan como graves (Sudden Death,
// control de amenazas y presión). Extraído de GameScreen.
export const HUMAN_SERIOUS_INCIDENTS = new Set(['MISSED_MATE', 'STALEMATE_BLUNDER', 'ALLOWED_MATE', 'QUEEN_EN_PRISE_TO_PAWN', 'QUEEN_SACRIFICE_OFFER', 'ROOK_SACRIFICE_OFFER']);

export function isSeriousHumanIncident(comment) {
  return !!comment?.event?.type && HUMAN_SERIOUS_INCIDENTS.has(comment.event.type);
}
