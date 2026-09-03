import { identifyOpening } from './openings.js';
import { seriesFacts, seriesLiveMoment } from './series.js';

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

  // Rehidratar una partida pendiente no es empezar otra conversación. El
  // transcript ya conserva lo que Matthias dijo antes del F5/Continuar.
  if (context.resumed) return null;
  if (context.rescue) return 'Has vuelto a una de tus derrotas para intentar salvarla. Eso es formación o necromancia; veremos cuál de las dos.';
  if (context.lab) return 'Laboratorio abierto. Esta vez no puedes alegar que la posición te pilló por sorpresa.';
  if (context.runMode === 'cup') return 'Copa personal. Ocho partidas, un acta y suficientes oportunidades para que la estadística pierda la paciencia.';
  if (context.runMode === 'boss') return `Boss Run, nivel ${context.difficulty}. La escalera sólo tiene una dirección aceptable y sospecho que vas a explorar la otra.`;
  if (context.runMode === 'streak') return `Modo racha, nivel ${context.difficulty}. Cada victoria compra un rival peor. Excelente modelo de negocio.`;
  if (context.series && !context.series.winner && Array.isArray(context.series.games) && context.series.games.length === 0) {
    const seriesStats = context.seriesHistoryStats || {};
    const seriesHistory = Array.isArray(context.seriesHistory) ? context.seriesHistory : [];
    const seriesStreak = Number(seriesStats.currentStreak || 0);
    if (seriesStreak <= -2) return `Nueva serie. Vienes de ${Math.abs(seriesStreak)} series perdidas seguidas contra mí. Ya no es una muestra: empieza a ser documentación.`;
    if (seriesStreak >= 2) return `Nueva serie. Llevas ${seriesStreak} series ganadas seguidas. He abierto un expediente específico para esta insolencia.`;
    const lastSeries = seriesHistory[0];
    if (lastSeries?.winner === 'cpu') return `Nueva serie. La última terminó ${lastSeries.humanWins}-${lastSeries.cpuWins} para ti, es decir, peor de lo que suena cuando lo digo despacio.`;
    if (lastSeries?.winner === 'human') return `Nueva serie. La anterior fue tuya ${lastSeries.humanWins}-${lastSeries.cpuWins}. Consta en acta; no significa que vaya a repetirse.`;
  }
  if (context.series && !context.series.winner && Array.isArray(context.series.games) && context.series.games.length) {
    const moment = seriesLiveMoment(context.series);
    if (moment?.kind === 'decider') return `Decisiva. ${moment.detail} He archivado las partidas anteriores para evitar amnesias convenientes.`;
    if (moment?.kind === 'human-match-point') return `Punto de serie para ti. ${moment.detail} Intentaré que el expediente no termine de esa forma tan ofensiva.`;
    if (moment?.kind === 'cpu-match-point') return `Punto de serie para mí. ${moment.detail} Por fin una situación administrativamente razonable.`;
    // El propio marcador ya cuenta el resto de la historia: no hacemos hablar
    // a la CPU al inicio de cada partida sólo porque exista una serie activa.
    return null;
  }

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

  if (recent[0] && Number(record.games || 0) >= 3 && Number(record.games || 0) % 5 === 2) {
    const last = recent[0];
    const opening = last.opening ? ` con ${last.opening}` : '';
    const moves = last.moves ? ` en ${last.moves} medias jugadas` : '';
    if (last.outcome === 'loss') return `La última fue para mí${opening}${moves}. Tranquilo: el expediente recuerda aunque tú prefieras no hacerlo.`;
    if (last.outcome === 'win') return `La última te la llevaste tú${opening}${moves}. Lo recuerdo con una precisión bastante poco saludable.`;
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

  const record = recordOf(rivalry);
  const allTime = record?.byOpening?.[opening];
  if (allTime && Number(allTime.games || 0) >= 4) {
    const games = Number(allTime.games || 0);
    const wins = Number(allTime.wins || 0);
    const losses = Number(allTime.losses || 0);
    if (losses >= wins + 2) return `${opening}. El expediente completo aquí va ${wins}-${losses} en ${games} partidas. Insistir también es una forma de investigación.`;
    if (wins >= losses + 2) return `${opening}. El histórico aquí va ${wins}-${losses} en ${games}. Empiezo a considerar esta apertura una provocación personal.`;
    return `${opening} otra vez. Ya hay ${games} precedentes registrados y el balance sigue sin concedernos una coartada.`;
  }

  const recent = Array.isArray(record.recentGames) ? record.recentGames : [];
  const same = recent.filter((g) => g.opening === opening);
  if (same.length < 2) return null;
  const wins = same.filter((g) => g.outcome === 'win').length;
  const losses = same.filter((g) => g.outcome === 'loss').length;
  if (losses >= 2 && losses > wins) return `${opening}. Otra vez. La has jugado ${same.length} veces recientemente y el balance ya ha solicitado asistencia psicológica.`;
  if (wins >= 2 && wins > losses) return `${opening}. Sí, la recuerdo: últimamente te funciona demasiado bien. Qué desagradable costumbre.`;
  return `${opening} de nuevo. ${same.length} precedentes recientes y todavía no hemos aprendido a evitarnos.`;
}


const HUMAN_TROUBLE_EVENTS = new Set(['MISSED_MATE', 'STALEMATE_BLUNDER', 'ALLOWED_MATE', 'QUEEN_EN_PRISE_TO_PAWN']);
const HUMAN_SUCCESS_EVENTS = new Set(['MATE_FOUND', 'PAWN_TAKES_QUEEN', 'QUEEN_CAPTURE']);

function compactOutcomeRow(row = {}) {
  return {
    games: Number(row.games || 0),
    wins: Number(row.wins || 0),
    draws: Number(row.draws || 0),
    losses: Number(row.losses || 0),
  };
}

function difficultySummary(record, difficulty) {
  if (difficulty == null) return null;
  const recent = Array.isArray(record?.recentGames) ? record.recentGames : [];
  const same = recent.filter((game) => Number(game?.difficulty) === Number(difficulty));
  if (same.length < 4) return null;
  return {
    level: Number(difficulty),
    games: same.length,
    wins: same.filter((game) => game.outcome === 'win').length,
    draws: same.filter((game) => game.outcome === 'draw').length,
    losses: same.filter((game) => game.outcome === 'loss').length,
  };
}

/**
 * Expediente mínimo para un comentario de jugada. No aumenta la frecuencia de
 * comentarios: sólo enriquece un evento que ya había sido considerado
 * noteworthy. Todos los datos salen del estado persistido de rivalidad.
 */
export function noteworthyMemoryFacts(rivalry, event, actor = 'human', context = {}) {
  if (!event?.type) return null;
  const record = recordOf(rivalry);
  const key = `${actor}:${event.type}`;
  const occurrenceNumber = Math.max(1, Number(context.occurrenceNumber || 0) || Number(record?.incidents?.[key] || 0) + 1);
  const memory = {
    incident: {
      key,
      occurrenceNumber,
      previousOccurrences: Math.max(0, occurrenceNumber - 1),
    },
  };

  const games = Number(record.games || 0);
  if (games >= 3) {
    memory.rivalry = {
      games,
      wins: Number(record.wins || 0),
      draws: Number(record.draws || 0),
      losses: Number(record.losses || 0),
    };
    const streak = Number(record.currentStreak || 0);
    if (Math.abs(streak) >= 2) {
      memory.streak = {
        owner: streak > 0 ? 'human' : 'cpu',
        games: Math.abs(streak),
      };
    }
  }

  const opening = String(context.opening || '').trim();
  const openingRow = opening ? record?.byOpening?.[opening] : null;
  if (openingRow && Number(openingRow.games || 0) >= 3) {
    memory.currentOpening = { name: opening, ...compactOutcomeRow(openingRow) };
  }

  const difficulty = difficultySummary(record, context.difficulty);
  if (difficulty) memory.currentDifficultyRecent = difficulty;

  const recent = Array.isArray(record.recentGames) ? record.recentGames : [];
  const last = recent[0];
  if (last && (context.rematch || occurrenceNumber > 1)) {
    memory.lastGame = {
      outcome: last.outcome || null,
      difficulty: last.difficulty ?? null,
      opening: last.opening || null,
      moves: Number(last.moves || 0),
    };
  }

  return memory;
}

/**
 * Fallback local cuando Workers AI no está disponible. Sólo añade memoria a
 * eventos muy graves/brillantes y con una muestra suficiente; las
 * reincidencias ya las cubre recurrenceSuffix().
 */
export function noteworthyMemorySuffix(memory, event, actor = 'human') {
  if (!memory || !event?.type || Number(memory?.incident?.previousOccurrences || 0) > 0) return '';
  if (Number(event.priority || 0) < 85) return '';

  const opening = memory.currentOpening;
  if (opening?.games >= 4) {
    const humanTrouble = (actor === 'human' && HUMAN_TROUBLE_EVENTS.has(event.type))
      || (actor === 'cpu' && HUMAN_SUCCESS_EVENTS.has(event.type));
    const humanSuccess = (actor === 'human' && HUMAN_SUCCESS_EVENTS.has(event.type))
      || (actor === 'cpu' && HUMAN_TROUBLE_EVENTS.has(event.type));
    if (humanTrouble && opening.losses >= opening.wins + 2) {
      return ` En ${opening.name} llevas ${opening.wins}-${opening.losses} en ${opening.games} registradas. El escenario del crimen empieza a ser reconocible.`;
    }
    if (humanSuccess && opening.wins >= opening.losses + 2) {
      return ` En ${opening.name} llevas ${opening.wins}-${opening.losses} en ${opening.games} registradas. Empiezo a tener motivos documentales para odiar esta apertura.`;
    }
  }

  const difficulty = memory.currentDifficultyRecent;
  if (difficulty?.games >= 5) {
    const humanTrouble = (actor === 'human' && HUMAN_TROUBLE_EVENTS.has(event.type))
      || (actor === 'cpu' && HUMAN_SUCCESS_EVENTS.has(event.type));
    if (humanTrouble && difficulty.losses >= difficulty.wins + 3) {
      return ` En nivel ${difficulty.level} el balance reciente ya va ${difficulty.wins}-${difficulty.losses}. La estadística no está siendo precisamente ambigua.`;
    }
  }
  return '';
}

function resultCareerMemory(record, outcome, context = {}) {
  const games = Number(record?.games || 0);
  // Hitos deliberadamente escasos: no convertimos cada final en una rueda de
  // prensa. Estos comentarios sólo aparecen en umbrales o balances fuertes.
  if ([10, 25, 50, 100, 200].includes(games)) {
    return `${games} partidas oficiales entre nosotros: tú ${Number(record.wins || 0)}, yo ${Number(record.losses || 0)}, tablas ${Number(record.draws || 0)}. Ya hay suficiente muestra para dejar de llamarlo casualidad.`;
  }

  const opening = String(context.opening || '').trim();
  const row = opening ? record?.byOpening?.[opening] : null;
  if (row && Number(row.games || 0) >= 6 && Number(row.games || 0) % 3 === 0) {
    const wins = Number(row.wins || 0);
    const losses = Number(row.losses || 0);
    if (outcome === 'loss' && losses >= wins + 3) return `${opening}: el expediente queda ${wins}-${losses} en ${row.games}. A estas alturas ya reconozco el lugar del accidente.`;
    if (outcome === 'win' && wins >= losses + 3) return `${opening}: ${wins}-${losses} para ti en ${row.games}. Esta apertura está empezando a requerir medidas administrativas.`;
  }

  const difficulty = difficultySummary(record, context.difficulty);
  if (difficulty && difficulty.games >= 6 && difficulty.games % 3 === 0) {
    if (outcome === 'loss' && difficulty.losses >= difficulty.wins + 3) return `Nivel ${difficulty.level}: balance reciente ${difficulty.wins}-${difficulty.losses}. Sigues volviendo al mismo mostrador a presentar la misma reclamación.`;
    if (outcome === 'win' && difficulty.wins >= difficulty.losses + 3) return `Nivel ${difficulty.level}: últimamente vas ${difficulty.wins}-${difficulty.losses}. Consta en acta y me irrita de manera perfectamente objetiva.`;
  }
  return null;
}

export function resultMemoryComment(outcome, rivalry, context = {}) {
  const record = recordOf(rivalry);
  const streak = Number(record.currentStreak || 0);
  const milestones = record.milestones || {};
  const series = context.series;

  if (series?.winner === 'human') {
    const facts = seriesFacts(series);
    if (facts.sweep) return `Barrida ${series.humanWins}-${series.cpuWins}. Te llevas la serie sin conceder una sola victoria. Esto requerirá auditoría externa.`;
    if (facts.comeback) return `Te llevas la serie ${series.humanWins}-${series.cpuWins} remontando. Odio especialmente los expedientes que empiezan bien y terminan así.`;
    if (facts.decider) return `Te llevas la decisiva y la serie ${series.humanWins}-${series.cpuWins}. Disfruta del acta; pediré una auditoría.`;
    return `Te llevas la serie ${series.humanWins}-${series.cpuWins}. Disfruta del acta; pediré una auditoría.`;
  }
  if (series?.winner === 'cpu') {
    const facts = seriesFacts(series);
    if (facts.sweep) return `Serie cerrada con barrida ${series.cpuWins}-${series.humanWins}. La jurisprudencia acaba de ponerse bastante desagradable.`;
    if (facts.comeback) return `Serie cerrada ${series.cpuWins}-${series.humanWins} después de remontarte. Gracias por aportar tensión antes del resultado correcto.`;
    if (facts.decider) return `La decisiva es mía: serie ${series.cpuWins}-${series.humanWins}. El expediente agradece tu colaboración.`;
    return `Serie cerrada ${series.cpuWins}-${series.humanWins}. Puedes llamarlo revancha si eso ayuda al proceso de duelo.`;
  }
  if (series && !series.winner) {
    const moment = seriesLiveMoment(series);
    if (moment?.kind === 'decider') return `Todo o nada: ${series.humanWins}-${series.cpuWins}. La próxima victoria cierra la serie.`;
    if (moment?.kind === 'human-match-point') return `Punto de serie para ti: ${series.humanWins}-${series.cpuWins}. Una más y firmas el acta.`;
    if (moment?.kind === 'cpu-match-point') return `Punto de serie para mí: ${series.humanWins}-${series.cpuWins}. Conviene que la siguiente te importe bastante.`;
    return null;
  }

  const latest = Array.isArray(record.recentGames) ? record.recentGames[0] : null;
  if (outcome === 'win' && milestones.fastestWinMoves && latest?.date === milestones.fastestWinDate) {
    return `Nueva victoria más rápida: ${context.moves} jugadas. Esto sí merece guardarse, aunque me resulte administrativamente repugnante.`;
  }
  if (outcome === 'loss' && streak <= -3) return `${Math.abs(streak)} derrotas seguidas. El expediente ya no necesita interpretación, sólo índice.`;
  if (outcome === 'win' && streak >= 3) return `${streak} victorias seguidas. Empiezo a considerar el sabotaje como herramienta pedagógica.`;
  const career = resultCareerMemory(record, outcome, context);
  if (career) return career;
  if (outcome === 'draw') return 'Tablas. Hemos empleado una cantidad notable de electricidad para no resolver absolutamente nada.';
  return null;
}