export const GAME_STATUS_LABELS = Object.freeze({
  playing: '',
  check: 'Jaque',
  checkmate: 'Jaque mate',
  stalemate: 'Tablas por ahogado',
  draw: 'Tablas',
  repetition: 'Tablas por repetición',
});

export function gameStatusView({
  status,
  turn,
  humanColor,
  busy = false,
  zenMode = false,
  turnBanner = null,
  flagFallen = null,
  flagFinalOutcome = null,
  forcedOutcome = null,
} = {}) {
  const statusLabel = GAME_STATUS_LABELS[status] || '';
  const statusClass = ['checkmate', 'stalemate', 'draw', 'repetition'].includes(status)
    ? 'danger'
    : status === 'check'
      ? 'success'
      : '';

  const finalOutcome = forcedOutcome || (flagFallen
    ? flagFinalOutcome
    : status === 'checkmate'
      ? (turn === humanColor ? 'loss' : 'win')
      : 'draw');

  let statusText;
  if (forcedOutcome) statusText = 'Sudden Death · tres vidas agotadas';
  else if (flagFallen) statusText = flagFinalOutcome === 'draw'
    ? 'Tiempo agotado · tablas por material insuficiente'
    : `Se acabó el tiempo (${flagFallen === 'w' ? 'blancas' : 'negras'})`;
  else if (busy) statusText = 'La CPU está pensando…';
  else if (!zenMode && turnBanner) statusText = turnBanner;
  else statusText = statusLabel || (turn === humanColor ? 'Tu turno' : 'Turno de la CPU');

  return { statusLabel, statusClass, finalOutcome, statusText };
}
