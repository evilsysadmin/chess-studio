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

export function homeNextBestAction(activity = []) {
  const latest = activity.find((row) => row?.state === 'finished');
  if (!latest) return null;
  if (latest.outcome === 'loss') return { id: 'practice', eyebrow: 'Recomendado para ti', title: 'Practica sin presión', detail: 'Tu última partida terminó en derrota. Usa pistas gratis para probar otra idea.', label: 'Abrir práctica' };
  if (latest.outcome === 'win') return { id: 'tournament', eyebrow: 'Recomendado para ti', title: 'Pon a prueba la racha', detail: 'Vienes de ganar. Torneo te propone el siguiente rival adecuado.', label: 'Ir a Torneo' };
  return { id: 'quick', eyebrow: 'Recomendado para ti', title: 'Convierte la próxima ventaja', detail: 'Una partida rápida adaptada mantiene la continuidad con un objetivo nuevo.', label: 'Jugar siguiente' };
}
