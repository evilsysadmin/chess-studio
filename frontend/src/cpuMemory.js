import { identifyOpening } from './openings.js';

function recordOf(rivalry) {
  return rivalry?.record || {};
}


function recurringIncidentComment(record) {
  const incidents = record?.incidents && typeof record.incidents === 'object' ? record.incidents : {};
  const candidates = [
    ['human:MISSED_MATE', Number(incidents['human:MISSED_MATE'] || 0), (n) => `El expediente conserva ${n} mates ignorados. Si aparece otro hoy, ya podemos llamarlo especialidad.`],
    ['human:QUEEN_EN_PRISE_TO_PAWN', Number(incidents['human:QUEEN_EN_PRISE_TO_PAWN'] || 0), (n) => `Tus damas han quedado expuestas a peones ${n} veces. Las piezas mayores han solicitado representación sindical.`],
    ['human:ALLOWED_MATE', Number(incidents['human:ALLOWED_MATE'] || 0), (n) => `Has permitido mate ${n} veces en posiciones registradas. Conviene revisar las amenazas antes de redactar el testamento.`],
    ['cpu:KNIGHT_FORK', Number(incidents['cpu:KNIGHT_FORK'] || 0), (n) => `Constan ${n} horquillas de caballo sufridas. Los caballos de esta casa ya te reconocen por el ruido.`],
    ['cpu:PAWN_FORK', Number(incidents['cpu:PAWN_FORK'] || 0), (n) => `El archivo cuenta ${n} horquillas de peón contra ti. La infantería está adquiriendo demasiada confianza.`],
  ].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]);
  if (!candidates.length) return null;
  return candidates[0][2](candidates[0][1]);
}

export function startMemoryComment(rivalry, context = {}) {
  const record = recordOf(rivalry);
  const streak = Number(record.currentStreak || 0);
  const recent = Array.isArray(record.recentGames) ? record.recentGames : [];

  if (context.rescue) return 'Has vuelto a una de tus derrotas para intentar salvarla. Eso es formación o necromancia; veremos cuál de las dos.';
  if (context.lab) return 'Laboratorio abierto. Esta vez no puedes alegar que la posición te pilló por sorpresa.';
  if (context.runMode === 'cup') return 'Copa personal. Ocho partidas, un acta y suficientes oportunidades para que la estadística pierda la paciencia.';
  if (context.runMode === 'boss') return `Boss Run, nivel ${context.difficulty}. La escalera sólo tiene una dirección aceptable y sospecho que vas a explorar la otra.`;
  if (context.runMode === 'streak') return `Modo racha, nivel ${context.difficulty}. Cada victoria compra un rival peor. Excelente modelo de negocio.`;
  if (context.rematch && recent[0]) {
    if (recent[0].outcome === 'loss') return 'Revancha inmediata. Perdiste la anterior y has vuelto antes de que el cadáver se enfríe. Admiro la eficiencia logística.';
    if (recent[0].outcome === 'win') return '¿Revancha después de ganar? Qué desagradable combinación de confianza y falta de pudor.';
    return 'Revancha tras tablas. Al parecer el empate te resultó personalmente ofensivo.';
  }

  if (streak <= -4) {
    return `Llevas ${Math.abs(streak)} derrotas seguidas contra mí. A estas alturas ya no es una racha; es una relación contractual.`;
  }
  if (streak >= 4) {
    return `${streak} victorias seguidas. Admito que la estadística empieza a resultar ofensiva. Disfrútala mientras conserve pulso.`;
  }
  if (streak <= -2) {
    return `Vienes de ${Math.abs(streak)} derrotas consecutivas. Bonito volver a ver a un cliente recurrente.`;
  }
  if (streak >= 2) {
    return `Dos victorias seguidas o más. Veo que hoy has venido con intenciones y, sorprendentemente, algunas pruebas.`;
  }

  // No lo soltamos en cada partida: una de cada cuatro aperturas de sesión,
  // siempre a partir de datos registrados y sólo si existe reincidencia real.
  if (Number(record.games || 0) >= 4 && Number(record.games || 0) % 4 === 1) {
    const incident = recurringIncidentComment(record);
    if (incident) return incident;
  }

  const memories = Array.isArray(record.memories) ? record.memories : [];
  const games = Number(record.games || 0);
  if (memories.length && games >= 8 && games % 6 === 0) {
    const memory = memories[Math.min(memories.length - 1, games % memories.length)];
    if (memory?.type === 'hardestWin') return `La hemeroteca conserva esto: ${memory.text} Procura no convertir un hito en una anomalía estadística.`;
    if (memory?.type === 'humanStreak') return `Tengo memoria y, por desgracia, consta que ${memory.text.toLowerCase()} Hoy podemos corregir ese exceso de confianza.`;
    if (memory?.type === 'cpuStreak') return `Archivo histórico: ${memory.text} Hubo una época bastante cómoda. Siempre podemos restaurarla.`;
    if (memory?.type === 'anniversary') return `${memory.text} Una relación suficientemente larga como para tener jurisprudencia y suficientemente mala como para seguir aquí.`;
  }

  const sameDifficulty = recent.filter((g) => Number(g.difficulty) === Number(context.difficulty));
  if (sameDifficulty.length >= 3) {
    const wins = sameDifficulty.filter((g) => g.outcome === 'win').length;
    const losses = sameDifficulty.filter((g) => g.outcome === 'loss').length;
    if (losses >= wins + 2) return `Insistes con el nivel ${context.difficulty}. El historial no respalda tu optimismo, pero admiro la fe.`;
    if (wins >= losses + 2) return `Nivel ${context.difficulty} otra vez. Aquí últimamente me estás cobrando alquiler; habrá que corregirlo.`;
  }

  if (games >= 50 && games % 10 === 0) return `${games} partidas entre nosotros. Ya no eres un rival: eres archivo histórico.`;
  return null;
}

export function openingMemoryComment(history, rivalry) {
  const played = (history || []).map((m) => m?.san).filter(Boolean);
  const opening = identifyOpening(played);
  if (!opening) return null;

  const recent = Array.isArray(recordOf(rivalry).recentGames) ? recordOf(rivalry).recentGames : [];
  const same = recent.filter((g) => g.opening === opening);
  if (same.length < 2) return null;

  const wins = same.filter((g) => g.outcome === 'win').length;
  const losses = same.filter((g) => g.outcome === 'loss').length;
  if (losses >= 2 && losses > wins) {
    return `${opening}. Otra vez. La has jugado ${same.length} veces recientemente y el balance ya ha solicitado asistencia psicológica.`;
  }
  if (wins >= 2 && wins > losses) {
    return `${opening}. Sí, la recuerdo: últimamente te funciona demasiado bien. Qué desagradable costumbre.`;
  }
  return `${opening} de nuevo. ${same.length} precedentes recientes y todavía no hemos aprendido a evitarnos.`;
}

export function resultMemoryComment(outcome, rivalry, context = {}) {
  const record = recordOf(rivalry);
  const streak = Number(record.currentStreak || 0);
  const milestones = record.milestones || {};
  const series = context.series;

  if (series?.winner === 'human') return `Te llevas la serie ${series.humanWins}-${series.cpuWins}. Disfruta del acta; pediré una auditoría.`;
  if (series?.winner === 'cpu') return `Serie cerrada ${series.cpuWins}-${series.humanWins}. Puedes llamarlo revancha si eso ayuda al proceso de duelo.`;
  if (series && !series.winner) return `Marcador de la serie: tú ${series.humanWins}, yo ${series.cpuWins}. Todavía quedan formas creativas de empeorarlo.`;

  const latest = Array.isArray(record.recentGames) ? record.recentGames[0] : null;
  if (outcome === 'win' && milestones.fastestWinMoves && latest?.date === milestones.fastestWinDate) {
    return `Nueva victoria más rápida: ${context.moves} jugadas. Esto sí merece guardarse, aunque me resulte administrativamente repugnante.`;
  }
  if (outcome === 'loss' && streak <= -3) return `${Math.abs(streak)} derrotas seguidas. El expediente ya no necesita interpretación, sólo índice.`;
  if (outcome === 'win' && streak >= 3) return `${streak} victorias seguidas. Empiezo a considerar el sabotaje como herramienta pedagógica.`;
  if (outcome === 'draw') return 'Tablas. Hemos empleado una cantidad notable de electricidad para no resolver absolutamente nada.';
  return null;
}
