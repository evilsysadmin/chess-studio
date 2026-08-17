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
        'Cero logros desbloqueados. Ni uno. Hay 14 esperando y ni te asomaste.',
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
