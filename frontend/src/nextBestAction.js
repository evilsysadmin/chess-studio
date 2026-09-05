export function nextBestAction({ outcome, moveCount = 0, hasReport = false } = {}) {
  if (outcome === 'loss' && hasReport && moveCount >= 8) {
    return { id: 'review', eyebrow: 'Siguiente paso', title: 'Revisa el momento decisivo', detail: 'Encuentra la jugada que cambió la partida antes de volver a intentarlo.', label: 'Revisar partida' };
  }
  if (outcome === 'win') {
    return { id: 'advance', eyebrow: 'Mantén el ritmo', title: 'Sube un poco la exigencia', detail: 'Tu siguiente objetivo ya puede pedirte un rival más fuerte.', label: 'Ver siguiente objetivo' };
  }
  if (outcome === 'draw') {
    return { id: 'advance', eyebrow: 'Siguiente paso', title: 'Convierte mejor la ventaja', detail: 'Revisa el cierre y avanza con un objetivo concreto.', label: 'Ver siguiente objetivo' };
  }
  return { id: 'advance', eyebrow: 'Siguiente paso', title: 'Entrena una decisión', detail: 'Avanza con un objetivo nuevo en lugar de repetir la misma partida.', label: 'Ver siguiente objetivo' };
}

const HOME_CORE_MODE_ACTIONS = Object.freeze({
  tournament: Object.freeze({
    id: 'tournament',
    eyebrow: 'Continúa donde estabas',
    title: 'Vuelve a Torneo',
    detail: 'Retoma el circuito de rivales sin buscar otra puerta del castillo.',
    label: 'Continuar Torneo',
  }),
  practice: Object.freeze({
    id: 'practice',
    eyebrow: 'Continúa donde estabas',
    title: 'Vuelve a práctica',
    detail: 'Sigue entrenando sin presión con el mismo acceso directo.',
    label: 'Continuar práctica',
  }),
  casual: Object.freeze({
    id: 'quick',
    eyebrow: 'Continúa donde estabas',
    title: 'Otra partida rápida',
    detail: 'Vuelve al tablero con una CPU ajustada a tu nivel.',
    label: 'Jugar otra partida',
  }),
});

const HOME_QUICK_FALLBACK = Object.freeze({
  id: 'quick',
  eyebrow: 'Tu siguiente partida',
  title: 'Partida rápida',
  detail: 'Entra al tablero sin elegir entre veinte mandangas antes de mover un peón.',
  label: 'Jugar ahora',
});

export function homeNextBestAction(activity = []) {
  const latestCoreGame = activity.find((row) => (
    row?.state === 'finished'
    && HOME_CORE_MODE_ACTIONS[String(row?.mode || 'casual')]
  ));
  if (!latestCoreGame) return HOME_QUICK_FALLBACK;
  return HOME_CORE_MODE_ACTIONS[String(latestCoreGame.mode || 'casual')] || HOME_QUICK_FALLBACK;
}
