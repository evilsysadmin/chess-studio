// insights.js — Estadísticas agregadas ("así juegas"), calculadas al
// instante a partir de lo que ya está guardado (historial de partidas, de
// combate, evolución de rating) — SIN volver a analizar cada partida
// contra el motor. Eso es a propósito: re-analizar aunque sea las últimas
// 10 partidas significaría decenas de llamadas al backend, con esta
// pantalla tardando varios segundos en abrir en vez de sentirse instantánea.
// Por la misma razón, esto NO incluye "tu error más repetido" — esa sí
// necesitaría el análisis jugada por jugada. Queda como posible mejora
// futura, no como omisión silenciosa.

import { identifyOpening } from './openings.js';

function winStats(games) {
  if (games.length === 0) return null;
  const wins = games.filter((g) => g.outcome === 'win').length;
  const draws = games.filter((g) => g.outcome === 'draw').length;
  const losses = games.length - wins - draws;
  return { wins, draws, losses, total: games.length, winPct: Math.round((wins / games.length) * 100) };
}

function favoriteOpening(games) {
  const counts = {};
  for (const g of games) {
    const sans = (g.moves || g.log || []).map((m) => m.san);
    const opening = identifyOpening(sans);
    if (opening) counts[opening] = (counts[opening] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? { name: entries[0][0], count: entries[0][1] } : null;
}

function openingDossier(games) {
  const stats = {};
  for (const g of games) {
    const sans = (g.moves || []).map((m) => m.san);
    const opening = identifyOpening(sans);
    if (!opening) continue;
    if (!stats[opening]) stats[opening] = { name: opening, games: 0, wins: 0, draws: 0, losses: 0, white: 0, black: 0 };
    const row = stats[opening];
    row.games += 1;
    if (g.outcome === 'win') row.wins += 1;
    else if (g.outcome === 'draw') row.draws += 1;
    else row.losses += 1;
    if (g.humanColor === 'w') row.white += 1;
    else if (g.humanColor === 'b') row.black += 1;
  }
  return Object.values(stats)
    .map((row) => ({ ...row, winPct: Math.round((row.wins / row.games) * 100) }))
    .sort((a, b) => b.games - a.games || b.winPct - a.winPct)
    .slice(0, 8);
}

function colorPreference(games) {
  const white = games.filter((g) => g.humanColor === 'w').length;
  const black = games.filter((g) => g.humanColor === 'b').length;
  return { white, black };
}

// Racha de victorias más larga, en orden cronológico real (mezclando todos
// los modos por fecha) — una racha "de verdad" cruza modos, no se corta
// porque una victoria fue en Torneo y la siguiente en Combate.
function longestWinStreak(games) {
  const sorted = [...games].sort((a, b) => new Date(a.date) - new Date(b.date));
  let longest = 0;
  let current = 0;
  for (const g of sorted) {
    if (g.outcome === 'win') {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export function ratingTrend(history) {
  if (!history || history.length === 0) return null;
  const ratings = history.map((p) => p.rating);
  const first = ratings[0];
  const last = ratings[ratings.length - 1];
  return {
    min: Math.min(...ratings),
    max: Math.max(...ratings),
    first,
    last,
    delta: last - first,
  };
}

// Capturas hechas por el humano — no cuenta las de la CPU. Para las
// partidas normales/torneo/práctica hay que derivar de qué color fue cada
// jugada por la paridad del índice (no viene guardado explícito); en
// Combate el registro ya trae `by` directo.
function humanCaptures(gameHistory, combatHistory) {
  let count = 0;
  for (const g of gameHistory) {
    (g.moves || []).forEach((m, i) => {
      const mover = i % 2 === 0 ? 'w' : 'b';
      if (mover === g.humanColor && m.captured) count += 1;
    });
  }
  for (const g of combatHistory) {
    (g.log || []).forEach((m) => {
      if (m.by === 'human' && m.captured) count += 1;
    });
  }
  return count;
}

export function computeInsights(gameHistory, combatHistory, ratingHistory) {
  const taggedGameHistory = gameHistory.map((g) => ({ ...g, category: g.mode || 'tournament' }));
  const taggedCombatHistory = combatHistory.map((g) => ({ ...g, category: 'combat' }));
  const allGames = [...taggedGameHistory, ...taggedCombatHistory];

  const byMode = {};
  for (const category of ['tournament', 'practice', 'casual', 'combat']) {
    const games = allGames.filter((g) => g.category === category);
    if (games.length > 0) byMode[category] = winStats(games);
  }

  return {
    totalGames: allGames.length,
    overall: winStats(allGames),
    byMode,
    favoriteOpening: favoriteOpening(allGames),
    openingDossier: openingDossier(taggedGameHistory),
    colorPreference: colorPreference(allGames),
    longestWinStreak: longestWinStreak(allGames),
    ratingTrend: ratingTrend(ratingHistory),
    humanCaptures: humanCaptures(gameHistory, combatHistory),
  };
}

function pickRoastLine(arr, seed) {
  return arr[((seed % arr.length) + arr.length) % arr.length];
}

// "Cómo te ve" — resumen con sarcasmo, sin pelos en la lengua. A propósito
// usa SOLO datos que insights.js ya calcula gratis (nada de volver a
// analizar partidas contra el motor) — por eso no hay línea sobre
// "imprecisión" en sentido estricto, esa sí necesitaría el análisis caro.
// Si `worstMove` viene informado (el resultado de "Buscar mi peor jugada
// de siempre", si ya se corrió), se suma un zasca concreto sobre esa
// jugada puntual — gratis también, porque ya está calculada de antes.
//
// Cada categoría tiene VARIAS frases posibles — se elige con un seed
// derivado de tus propias estadísticas (no al azar en cada visita), así
// que dos perfiles distintos suenan distinto, pero el mismo perfil no
// cambia de frase cada vez que entras a mirar.
export function generateRoast(insights, worstMove = null, extras = {}) {
  if (insights.totalGames === 0) return [];
  const lines = [];
  const seed = Math.round(insights.overall.winPct) + insights.totalGames * 7 + insights.humanCaptures * 3 + insights.longestWinStreak * 11;

  if (insights.totalGames < 3) {
    lines.push(pickRoastLine([
      'Con tan pocas partidas esto todavía es más boceto que retrato. Vuelve cuando tengas currículum de verdad.',
      'Muy poquitas partidas para sacar conclusiones — pero bueno, ya que insistes, aquí va igual.',
    ], seed));
  } else if (insights.totalGames >= 50) {
    lines.push(pickRoastLine([
      `${insights.totalGames} partidas y contando. A este punto ya no es hobby, es una relación seria con la CPU.`,
      `Llevas ${insights.totalGames} partidas jugadas. Alguien tiene tiempo libre.`,
    ], seed));
  } else if (insights.totalGames >= 20) {
    lines.push(pickRoastLine([
      `${insights.totalGames} partidas ya en el historial — le estás dando en serio a esto.`,
    ], seed));
  }

  const pct = insights.overall.winPct;
  lines.push(pickRoastLine(
    pct < 25 ? [
      'Ganas menos de una de cada cuatro. El ajedrez no te odia, pero tampoco te quiere.',
      'Con ese porcentaje, la CPU debería empezar a cobrarte por las clases.',
      'Pierdes más de lo que ganas, y por bastante. Ánimo, técnicamente.',
    ] : pct < 45 ? [
      'Un porcentaje de victorias flojito, la verdad — ni para presumir ni para esconderte del todo.',
      'Ganas menos de la mitad. Vas tirando, sin más.',
      'Regulero. Ahí, ahí.',
    ] : pct < 65 ? [
      'Te defiendes decentemente. Nada del otro mundo, pero tampoco un desastre.',
      'Un porcentaje digno, de esos que no dan ni para presumir ni para llorar.',
      'Ganas más de lo que pierdes. Felicidades, supongo.',
    ] : pct < 85 ? [
      'Ganas la mayoría. O juegas bien de verdad, o la CPU te tiene cariño.',
      'Un porcentaje que ya empieza a oler a fanfarroneo en las cenas familiares.',
      'Se te da bien esto. Raro, pero bien.',
    ] : [
      'Casi nunca pierdes. Sospechosamente bien, la verdad — ¿seguro que no hiciste trampa?',
      'Un porcentaje casi perfecto. O eres un genio, o la CPU juega con los ojos cerrados.',
    ],
    seed
  ));

  const { white, black } = insights.colorPreference;
  const totalColor = white + black;
  if (totalColor >= 4) {
    if (white / totalColor > 0.75) {
      lines.push(pickRoastLine([
        'Casi siempre juegas con blancas. ¿Manía, comodidad, o le tienes respeto a mover segundo?',
        'Blancas, blancas, y más blancas. A las negras casi ni las conoces.',
      ], seed));
    } else if (black / totalColor > 0.75) {
      lines.push(pickRoastLine([
        'Rarísimo lo tuyo — casi nunca te tocan blancas. Raro gusto el de esperar a que muevan primero.',
        'Vives instalado en las negras. Curioso, la mayoría huye de eso.',
      ], seed));
    }
  }

  if (insights.totalGames >= 5) {
    const capturesPerGame = insights.humanCaptures / insights.totalGames;
    if (capturesPerGame < 1.5) {
      lines.push(pickRoastLine([
        'Capturas poquísimas piezas por partida. Juegas con una prudencia que raya en el miedo escénico.',
        'Casi ni tocas las piezas del rival. ¿Ajedrez o meditación?',
      ], seed));
    } else if (capturesPerGame > 5) {
      lines.push(pickRoastLine([
        'Te gusta comer piezas, eso está clarísimo. Estilo agresivo, o simplemente no sabes hacer otra cosa.',
        'Comes todo lo que se mueve. Enhorabuena, o condolencias — depende de cómo te vaya luego.',
      ], seed));
    }
  }

  if (insights.favoriteOpening && insights.totalGames >= 4) {
    const repeatRate = insights.favoriteOpening.count / insights.totalGames;
    if (repeatRate > 0.6) {
      lines.push(pickRoastLine([
        `Siempre la misma apertura (${insights.favoriteOpening.name}). Repertorio de una sola carta, macho.`,
        `${insights.favoriteOpening.name} otra vez. A este paso te la van a poner de apodo.`,
      ], seed));
    }
  } else if (!insights.favoriteOpening && insights.totalGames >= 4) {
    lines.push(pickRoastLine([
      'Ni una sola apertura con nombre en todo tu historial. Juegas a lo bruto, sin libro ni nada.',
      'Cero teoría de aperturas reconocible. Improvisas desde la primera jugada, valiente.',
    ], seed));
  }

  if (insights.longestWinStreak <= 1 && insights.totalGames >= 5) {
    lines.push(pickRoastLine([
      'Ni una racha de dos victorias seguidas en todo este tiempo. Constancia: cero.',
      'Ganas una y pierdes la siguiente, como un péndulo. Nada de rachas por aquí.',
    ], seed));
  } else if (insights.longestWinStreak >= 5) {
    lines.push(pickRoastLine([
      `Una racha de ${insights.longestWinStreak} seguidas en algún momento — a saber contra qué estaba jugando la CPU ese día.`,
      `${insights.longestWinStreak} victorias seguidas en tu mejor momento. Hasta tú te sorprendiste, seguro.`,
    ], seed));
  }

  if (insights.overall.draws / insights.overall.total > 0.3 && insights.totalGames >= 5) {
    lines.push(pickRoastLine([
      'Un montón de tablas en tu historial. ¿Estrategia de manual, o simple miedo a comprometerte?',
      'Empatas muchísimo. Ni ganar ni perder — la zona de confort hecha estilo de juego.',
    ], seed));
  }

  if (insights.ratingTrend) {
    const { delta } = insights.ratingTrend;
    if (delta <= -40) {
      lines.push(pickRoastLine([
        'Tu rating va en picada. Cuesta abajo y sin frenos.',
        'El rating no para de bajar. En algún momento tocará fondo, supongo.',
      ], seed));
    } else if (delta >= 40) {
      lines.push(pickRoastLine([
        'Tu rating sube que da gusto. A ver cuánto dura la racha de gloria.',
        'Vas mejorando de verdad, según el número. No te lo creas demasiado todavía.',
      ], seed));
    }
  }

  const modeEntries = Object.entries(insights.byMode || {}).filter(([, s]) => s.total >= 3);
  if (modeEntries.length >= 2) {
    const sorted = [...modeEntries].sort((a, b) => b[1].winPct - a[1].winPct);
    const [bestMode, bestStats] = sorted[0];
    const [worstModeName, worstStats] = sorted[sorted.length - 1];
    if (bestStats.winPct - worstStats.winPct >= 30) {
      const MODE_LABEL = { tournament: 'Torneo', practice: 'Práctica', casual: 'Partida rápida', combat: 'Combate' };
      lines.push(pickRoastLine([
        `Se te da bastante mejor ${MODE_LABEL[bestMode] || bestMode} que ${MODE_LABEL[worstModeName] || worstModeName}. Cuestión de estilo, o de que en un modo te dejan pensar más.`,
      ], seed));
    }
  }

  if (typeof extras.achievementsUnlocked === 'number' && typeof extras.achievementsTotal === 'number') {
    const rate = extras.achievementsUnlocked / extras.achievementsTotal;
    if (extras.achievementsUnlocked === 0) {
      lines.push(pickRoastLine([
        `Cero logros desbloqueados. Ni uno. Hay ${extras.achievementsTotal} esperando y ni te asomaste.`,
        'Ningún logro todavía — capaz ni sabías que existían, sinceramente.',
      ], seed));
    } else if (rate >= 0.7) {
      lines.push(pickRoastLine([
        `${extras.achievementsUnlocked} de ${extras.achievementsTotal} logros — casi los tienes todos. Alguien se lo tomó personal.`,
        `Con ${extras.achievementsUnlocked} logros desbloqueados, esto ya parece un trabajo de medio tiempo.`,
      ], seed));
    }
  }

  if (typeof extras.puzzlesSolved === 'number') {
    if (extras.puzzlesSolved === 0 && insights.totalGames >= 5) {
      lines.push(pickRoastLine([
        'Cero puzzles resueltos pese a jugar bastante. El modo Puzzle existe, por si te enterabas ahora.',
      ], seed));
    } else if (extras.puzzlesSolved >= 15) {
      lines.push(pickRoastLine([
        `${extras.puzzlesSolved} puzzles resueltos. Se nota que la táctica no te da miedo.`,
      ], seed));
    }
  }


  const rivalryRecord = extras.rivalryRecord;
  if (rivalryRecord?.games >= 5) {
    const losses = Number(rivalryRecord.losses || 0);
    const wins = Number(rivalryRecord.wins || 0);
    if (losses >= wins * 2 && losses >= 4) {
      lines.push(pickRoastLine([
        `La CPU te lleva ${losses} derrotas por ${wins} victorias. Esto ya no es una rivalidad; es una domiciliación bancaria.`,
        `${wins} victorias tuyas y ${losses} de la CPU. Sigues llamándolo rivalidad por autoestima, lo entiendo.`,
        'Tu marcador contra la CPU tiene la alegría cromática de una esquela. Al menos la constancia es admirable.',
      ], seed + losses));
    } else if (wins >= losses * 2 && wins >= 4) {
      lines.push(pickRoastLine([
        `Le estás ganando claramente a la CPU (${wins}-${losses}). Bien. Ya puedes dejar de mirar el marcador cada treinta segundos.`,
        `El cara a cara va ${wins}-${losses} a tu favor. Empieza a ser ofensivo. Para la máquina, digo.`,
      ], seed + wins));
    }
  }

  const incidentEntries = Object.entries(extras.incidents || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (incidentEntries.length && Number(incidentEntries[0][1]) >= 3) {
    const [crime, countRaw] = incidentEntries[0];
    const count = Number(countRaw);
    const crimeRoasts = {
      'human:MISSED_MATE': `Has ignorado mate inmediato ${count} veces. A estas alturas el botón de rematar debería parpadear y emitir humo.`,
      'human:ALLOWED_MATE': `Has regalado mate en una ${count} veces. La hospitalidad está bien; entregar el rey en recepción ya es demasiado.`,
      'human:QUEEN_EN_PRISE_TO_PAWN': `Has dejado la dama a tiro de peón ${count} veces. Tus damas merecen sindicato, casco y plus de peligrosidad.`,
      'cpu:PAWN_TAKES_QUEEN': `${count} damas tuyas han muerto contra peones. No es mala suerte cuando ya puedes hacer una estadística con ello.`,
      'cpu:KNIGHT_FORK': `${count} horquillas serias de caballo sufridas. Los caballos rivales ya entran al tablero con reserva.`,
      'cpu:PAWN_FORK': `${count} horquillas de peón sufridas. Una pieza que no sabe retroceder te ha convertido en cliente recurrente.`,
      'human:STALEMATE_BLUNDER': `${count} ahogados desde posición ganadora. La victoria te llega a casa y tú finges que no estabas esperando ningún paquete.`,
    };
    if (crimeRoasts[crime]) lines.push(crimeRoasts[crime]);
  }

  if (worstMove) {
    lines.push(pickRoastLine([
      `Y no hablemos de esa ${worstMove.moveReport.played}, que te costó ${worstMove.moveReport.loss} puntos de evaluación de un plumazo — el motor todavía se está riendo de esa.`,
      `Esa ${worstMove.moveReport.played} tuya (-${worstMove.moveReport.loss}) va a quedar en los anales. No para bien.`,
    ], seed));
  }

  if (lines.length === 0) {
    lines.push('Juegas de forma bastante equilibrada, la verdad. Aburrido para el sarcasmo, pero bien por ti.');
  }

  return lines;
}


const INCIDENT_COACHING = {
  'human:MISSED_MATE': {
    title: 'Deja de perdonar mates',
    diagnosis: (n) => `${n} mate${n === 1 ? '' : 's'} inmediato${n === 1 ? '' : 's'} ignorado${n === 1 ? '' : 's'}. El rival estaba listo para firmar la defunción y tú le diste prórroga.`,
    action: 'Antes de cada jugada candidata haz un barrido CCT: jaques, capturas y amenazas. Si hay jaque, comprueba primero si alguno es mate.',
  },
  'human:ALLOWED_MATE': {
    title: 'Mira qué amenaza el otro',
    diagnosis: (n) => `${n} mate${n === 1 ? '' : 's'} en una concedido${n === 1 ? '' : 's'}. La defensa no puede consistir en esperar que el rival sea educado.`,
    action: 'Antes de soltar una pieza, pregunta: “si paso turno, ¿qué jaques tiene?”. Hazlo especialmente cuando tu rey tenga pocas casillas.',
  },
  'human:QUEEN_EN_PRISE_TO_PAWN': {
    title: 'La dama no es material fungible',
    diagnosis: (n) => `${n} ${n === 1 ? 'vez' : 'veces'} dejando la dama a tiro de peón. Nueve puntos aparcados en zona de carga y descarga.`,
    action: 'Tras mover la dama, revisa las dos diagonales de ataque de los peones enemigos. Son dos casillas; no hace falta convocar a la NASA.',
  },
  'cpu:PAWN_TAKES_QUEEN': {
    title: 'Vacuna antidiagnóstico de dama',
    diagnosis: (n) => `${n} dama${n === 1 ? '' : 's'} tuya${n === 1 ? '' : 's'} capturada${n === 1 ? '' : 's'} por un peón. Ya hay suficiente evidencia para llamarlo patrón.`,
    action: 'En posiciones tácticas, marca mentalmente las casillas atacadas por peones antes de calcular líneas largas. Lo barato también mata.',
  },
  'human:STALEMATE_BLUNDER': {
    title: 'Aprende a rematar sin resucitar al cadáver',
    diagnosis: (n) => `${n} victoria${n === 1 ? '' : 's'} convertida${n === 1 ? '' : 's'} en ahogado. Generosidad reglamentaria no solicitada.`,
    action: 'En finales ganados, conserva al menos una casilla legal para el rey enemigo hasta que tengas el mate preparado. Practica mates básicos de dama y torre.',
  },
  'cpu:KNIGHT_FORK': {
    title: 'Los caballos no aparecen por magia',
    diagnosis: (n) => `${n} horquilla${n === 1 ? '' : 's'} seria${n === 1 ? '' : 's'} de caballo sufrida${n === 1 ? '' : 's'}. La L también cuenta como geometría.`,
    action: 'Antes de colocar rey, dama o torres cerca, visualiza los saltos de caballo hacia casillas centrales y de jaque. Prioriza las horquillas con jaque.',
  },
  'cpu:PAWN_FORK': {
    title: 'Respeta la infantería',
    diagnosis: (n) => `${n} horquilla${n === 1 ? '' : 's'} de peón sufrida${n === 1 ? '' : 's'}. Presupuesto de un punto, daños de consejo de administración.`,
    action: 'Cuando dos piezas caras queden separadas por una casilla de avance de peón, comprueba si el rival puede empujar con tempo y atacar ambas.',
  },
};

function coachingPriority(count) {
  if (count >= 4) return { priority: 'high', priorityLabel: 'ALTA' };
  if (count >= 2) return { priority: 'medium', priorityLabel: 'MEDIA' };
  return { priority: 'low', priorityLabel: 'VIGILAR' };
}

// Consejos accionables a partir de hechos ya guardados. No pretende adivinar
// debilidades posicionales que no se hayan medido: usa reincidencias tácticas,
// resultados por apertura, sesgo de color, puzzles y tendencia de rating.
export function generateCoaching(insights, rivalry = null, extras = {}) {
  if (!insights || insights.totalGames === 0) return [];
  const items = [];
  const incidents = rivalry?.incidents || extras.incidents || {};

  const tactical = Object.entries(incidents)
    .filter(([key, count]) => INCIDENT_COACHING[key] && Number(count) > 0)
    .sort((a, b) => b[1] - a[1]);

  for (const [key, rawCount] of tactical.slice(0, 2)) {
    const count = Number(rawCount);
    const rule = INCIDENT_COACHING[key];
    items.push({ ...coachingPriority(count), title: rule.title, diagnosis: rule.diagnosis(count), action: rule.action });
  }

  const dossier = (insights.openingDossier || []).filter((row) => row.games >= 3);
  const worstOpening = [...dossier].sort((a, b) => a.winPct - b.winPct || b.games - a.games)[0];
  if (worstOpening && worstOpening.winPct <= 40) {
    items.push({
      priority: worstOpening.winPct <= 25 ? 'high' : 'medium',
      priorityLabel: worstOpening.winPct <= 25 ? 'ALTA' : 'MEDIA',
      title: `Revisa ${worstOpening.name}`,
      diagnosis: `${worstOpening.games} partidas y ${worstOpening.winPct}% de victorias. Esa apertura te está cobrando alquiler y ni siquiera te deja las llaves.`,
      action: 'Repasa sus primeras 8–10 jugadas en “Aperturas famosas” y revisa dos derrotas tuyas en replay buscando el primer momento en que abandonaste el plan normal.',
    });
  }

  if (insights.favoriteOpening && insights.totalGames >= 8) {
    const repeatRate = insights.favoriteOpening.count / insights.totalGames;
    if (repeatRate >= 0.65) {
      items.push({
        priority: 'low', priorityLabel: 'AMPLIAR',
        title: 'Tu repertorio cabe en una servilleta',
        diagnosis: `${insights.favoriteOpening.name} aparece en ${Math.round(repeatRate * 100)}% de tus partidas. Saberla bien está genial; depender de ella para respirar, menos.`,
        action: 'Añade una segunda apertura para blancas o una defensa alternativa para negras y juega al menos 5 partidas antes de juzgarla.',
      });
    }
  }

  const { white = 0, black = 0 } = insights.colorPreference || {};
  const colorTotal = white + black;
  if (colorTotal >= 8) {
    const dominant = Math.max(white, black) / colorTotal;
    if (dominant >= 0.78) {
      const weakColor = white > black ? 'negras' : 'blancas';
      items.push({
        priority: 'low', priorityLabel: 'EQUILIBRAR',
        title: `Juega más con ${weakColor}`,
        diagnosis: `Tu historial está muy cargado hacia ${white > black ? 'blancas' : 'negras'}. Muy cómodo todo hasta que el color te lo elige otro.`,
        action: `Fuerza 5 partidas seguidas con ${weakColor}. No busques rating: busca posiciones que hoy te resultan menos familiares.`,
      });
    }
  }

  const puzzlesSolved = Number(extras.puzzlesSolved || 0);
  const personalPuzzles = Number(extras.personalPuzzles || 0);
  if (insights.totalGames >= 6 && puzzlesSolved < 5) {
    items.push({
      priority: tactical.length ? 'high' : 'medium',
      priorityLabel: tactical.length ? 'ALTA' : 'MEDIA',
      title: 'Menos partidas automáticas, más táctica',
      diagnosis: `${puzzlesSolved} ${puzzlesSolved === 1 ? 'puzzle resuelto' : 'puzzles resueltos'} frente a ${insights.totalGames} partidas. Estás acumulando experiencia, pero no necesariamente corrigiendo hábitos.`,
      action: personalPuzzles > 0
        ? `Haz primero 3 de “Tus crímenes” antes de tu próxima partida. Tienes ${personalPuzzles} posiciones sacadas de errores reales tuyos.`
        : 'Haz 5 puzzles cortos antes de tu próxima partida y luego juega a la misma dificultad. El objetivo es reconocer patrones, no coleccionar partidas.',
    });
  }

  if (insights.ratingTrend?.delta <= -30) {
    items.push({
      priority: 'high', priorityLabel: 'ALTA',
      title: 'Deja de hacer volumen por hacer volumen',
      diagnosis: `El rating ha caído ${Math.abs(insights.ratingTrend.delta)} puntos desde el primer registro. Seguir encadenando partidas puede entrenar exactamente los errores que quieres quitar.`,
      action: 'Abre Autopsia tras cada derrota durante las próximas 3 partidas y revisa sólo el peor incidente. Una corrección concreta por partida, no veinte.',
    });
  } else if (insights.ratingTrend?.delta >= 60 && insights.totalGames >= 10) {
    items.push({
      priority: 'low', priorityLabel: 'SUBIR LISTÓN',
      title: 'Te estás quedando cómodo',
      diagnosis: `Has ganado ${insights.ratingTrend.delta} puntos. Bien. Ahora deja de admirar la gráfica como si fuera una estatua ecuestre.`,
      action: 'Si encadenas 3 victorias más con margen, sube un nivel de dificultad y conserva el mismo repertorio unas partidas para comparar.',
    });
  }

  if (items.length === 0) {
    items.push({
      priority: 'low', priorityLabel: 'MANTENER',
      title: 'No hay un incendio dominante',
      diagnosis: 'Tus datos no muestran una reincidencia clara todavía. Molesto para el sarcasmo; buena señal para ti.',
      action: 'Sigue jugando y abre Autopsia en las derrotas. Cuando aparezca un patrón repetido, esta sección lo convertirá en prioridad.',
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 5);
}

// Genérico a propósito a la hora de sugerir qué hacer — no analiza tus
// jugadas para esto (eso sí sería caro), así que no inventa un
// diagnóstico específico tipo "te falla el medio juego". Solo combina tu
// categoría actual con la tendencia reciente del rating, y sugiere
// herramientas que ya existen en la app, no problemas que no puede saber
// que tienes de verdad.
export function tierTrendComment(tierLabel, trend) {
  if (!trend || trend.min === trend.max) {
    return `${tierLabel} — todavía no hay suficiente historial para ver una tendencia clara.`;
  }

  const { delta } = trend;
  const TIER_TIPS = {
    Principiante: 'quizá te sirva pasar más tiempo en "Partida de práctica" (pistas del motor gratis) o repasar el Tutorial, que ya trae aperturas famosas.',
    Aficionado: 'capaz vale la pena revisar tus partidas guardadas con la "pista inversa" — ahí ves exactamente dónde el motor prefería otra cosa.',
    Intermedio: 'a este nivel, "Buscar mi peor jugada de siempre" (en Así juegas) suele ser más revelador que jugar más partidas sueltas.',
    Avanzado: 'quizá subir la dificultad de la CPU en las próximas partidas — a este nivel, un rival más flojo enseña poco.',
    Experto: 'a este nivel ya no hay mucho que la app pueda "enseñarte" de forma genérica — el Modo Combate al menos mantiene las cosas interesantes.',
    Maestro: 'llegaste arriba de todo lo que mide este rating — a partir de acá, jugar más no cambia mucho el número.',
  };
  const tip = TIER_TIPS[tierLabel] || '';

  if (delta >= 30) {
    return `${tierLabel}, pero vas mejorando — el número no miente, subiste ${delta} puntos desde el primer registro.`;
  }
  if (delta <= -30) {
    return `${tierLabel}, y viene bajando últimamente (${delta} puntos) — ${tip}`;
  }
  return `${tierLabel}, bastante estancado por ahora (apenas ${delta >= 0 ? '+' : ''}${delta} desde el primer registro) — ${tip}`;
}
