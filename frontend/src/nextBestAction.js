export function nextBestAction({ outcome, moveCount = 0, hasReport = false } = {}) {
  if (outcome === 'loss' && hasReport && moveCount >= 8) {
    return { id: 'review', eyebrow: 'Siguiente paso', title: 'Revisa el momento decisivo', detail: 'Encuentra la jugada que cambió la partida antes de volver a intentarlo.', label: 'Revisar partida' };
  }
  if (outcome === 'win') {
    return { id: 'again', eyebrow: 'Mantén el ritmo', title: 'Sube un poco la exigencia', detail: 'Otra partida consolida mejor lo aprendido que una explicación larga.', label: 'Jugar otra' };
  }
  if (outcome === 'draw') {
    return { id: 'again', eyebrow: 'Siguiente paso', title: 'Desempata en el tablero', detail: 'Mismo contexto, una oportunidad nueva para convertir la ventaja.', label: 'Jugar otra' };
  }
  return { id: 'again', eyebrow: 'Siguiente paso', title: 'Vuelve al tablero', detail: 'Repite con la misma configuración y ajusta una sola decisión.', label: 'Intentarlo de nuevo' };
}

export function homeNextBestAction(activity = []) {
  const latest = activity.find((row) => row?.state === 'finished');
  if (!latest) return null;
  if (latest.outcome === 'loss') return { id: 'practice', eyebrow: 'Recomendado para ti', title: 'Practica sin presión', detail: 'Tu última partida terminó en derrota. Usa pistas gratis para probar otra idea.', label: 'Abrir práctica' };
  if (latest.outcome === 'win') return { id: 'tournament', eyebrow: 'Recomendado para ti', title: 'Pon a prueba la racha', detail: 'Vienes de ganar. Torneo te propone el siguiente rival adecuado.', label: 'Ir a Torneo' };
  return { id: 'quick', eyebrow: 'Recomendado para ti', title: 'Busca el desempate', detail: 'Una partida rápida mantiene la continuidad sin complicar la preparación.', label: 'Jugar otra' };
}
