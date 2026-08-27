// Una cuenta nueva debe ver un camino claro, no métricas vacías ni datos de
// otra persona. El historial de actividad es la fuente más fiable porque se
// registra al comenzar la primera partida, incluso antes de que termine.
export function isFreshAccount({ activity = [], tournament = {} } = {}) {
  const hasPlayed = Array.isArray(activity) && activity.some((event) => event?.state === 'started' || event?.state === 'finished');
  const tournamentProgress = Number(tournament?.progressPoints || tournament?.points || 0);
  // Combat entrega créditos iniciales a todo recluta. No son progreso y no
  // deben esconder la bienvenida de una cuenta recién creada.
  return !hasPlayed && tournamentProgress <= 0;
}
