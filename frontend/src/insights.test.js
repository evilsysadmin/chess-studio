import { describe, it, expect } from 'vitest';
import { computeInsights, generateCoaching, generateRoast, selectTrainingNow, tierTrendComment, trainingTargetForCoaching } from './insights.js';

const gameHistory = [
  {
    date: '2026-01-01', outcome: 'win', humanColor: 'w', mode: 'tournament',
    moves: [{ san: 'e4', captured: false }, { san: 'c5', captured: false }, { san: 'Nf3', captured: false }, { san: 'd6', captured: false }],
  },
  {
    date: '2026-01-02', outcome: 'win', humanColor: 'w', mode: 'tournament',
    moves: [
      { san: 'e4', captured: false }, { san: 'e5', captured: false }, { san: 'Nf3', captured: false },
      { san: 'Nc6', captured: false }, { san: 'Bxc6', captured: true },
    ],
  },
  { date: '2026-01-03', outcome: 'loss', humanColor: 'b', mode: 'practice', moves: [] },
  { date: '2026-01-04', outcome: 'win', humanColor: 'w', mode: 'tournament', moves: [] },
];

const combatHistory = [
  {
    date: '2026-01-05', outcome: 'win', humanColor: 'w',
    log: [
      { san: 'e4', by: 'human', captured: false }, { san: 'e5', by: 'cpu', captured: false },
      { san: 'Bxf7', by: 'human', captured: true },
    ],
  },
];

const ratingHistory = [
  { date: '2026-01-01', rating: 600 },
  { date: '2026-01-02', rating: 615 },
  { date: '2026-01-05', rating: 590 },
  { date: '2026-01-06', rating: 640 },
];

describe('computeInsights', () => {
  it('cuenta el total de partidas de todos los modos juntos', () => {
    const result = computeInsights(gameHistory, combatHistory, ratingHistory);
    expect(result.totalGames).toBe(5);
  });

  it('calcula el porcentaje de victorias global', () => {
    const result = computeInsights(gameHistory, combatHistory, ratingHistory);
    expect(result.overall).toEqual({ wins: 4, draws: 0, losses: 1, total: 5, winPct: 80 });
  });

  it('desglosa por modo, sin incluir modos sin partidas', () => {
    const result = computeInsights(gameHistory, combatHistory, ratingHistory);
    expect(result.byMode.tournament).toEqual({ wins: 3, draws: 0, losses: 0, total: 3, winPct: 100 });
    expect(result.byMode.practice).toEqual({ wins: 0, draws: 0, losses: 1, total: 1, winPct: 0 });
    expect(result.byMode.combat).toEqual({ wins: 1, draws: 0, losses: 0, total: 1, winPct: 100 });
    expect(result.byMode.casual).toBeUndefined(); // no hubo ninguna partida casual en los datos de prueba
  });

  it('reconoce la apertura favorita solo entre las que de verdad calzan', () => {
    // La partida 2 y la batalla de combate juegan "e4 e5" pero se desvían
    // enseguida (Bxc6 / Bxf7) sin calzar con ninguna apertura de la tabla
    // — solo la partida 1 (Siciliana real) debería contar.
    const result = computeInsights(gameHistory, combatHistory, ratingHistory);
    expect(result.favoriteOpening).toEqual({ name: 'Defensa Siciliana', count: 1 });
  });

  it('cuenta la preferencia de color', () => {
    const result = computeInsights(gameHistory, combatHistory, ratingHistory);
    expect(result.colorPreference).toEqual({ white: 4, black: 1 });
  });

  it('encuentra la racha de victorias más larga, cruzando modos por fecha real', () => {
    // win, win, loss (corta la racha), win, win -> la más larga es 2
    const result = computeInsights(gameHistory, combatHistory, ratingHistory);
    expect(result.longestWinStreak).toBe(2);
  });

  it('resume la evolución del rating', () => {
    const result = computeInsights(gameHistory, combatHistory, ratingHistory);
    expect(result.ratingTrend).toEqual({ min: 590, max: 640, first: 600, last: 640, delta: 40 });
  });

  it('cuenta capturas hechas por el humano, no las de la CPU', () => {
    // partida 2: Bxc6 en índice 4 (par -> blancas), humanColor='w' -> cuenta
    // combate: Bxf7 con by:'human' -> cuenta. Total = 2.
    const result = computeInsights(gameHistory, combatHistory, ratingHistory);
    expect(result.humanCaptures).toBe(2);
  });

  it('no revienta con historiales completamente vacíos', () => {
    const result = computeInsights([], [], []);
    expect(result.totalGames).toBe(0);
    expect(result.overall).toBeNull();
    expect(result.favoriteOpening).toBeNull();
    expect(result.ratingTrend).toBeNull();
    expect(result.longestWinStreak).toBe(0);
  });
});

describe('generateRoast', () => {
  it('sin partidas, no hay nada que comentar', () => {
    expect(generateRoast({ totalGames: 0 })).toEqual([]);
  });

  it('comenta un win rate bajo', () => {
    const insights = { totalGames: 10, overall: { winPct: 15 }, colorPreference: { white: 5, black: 5 }, humanCaptures: 30, favoriteOpening: null, longestWinStreak: 2, byMode: {} };
    const lines = generateRoast(insights);
    const lowWinRatePhrases = ['menos de una de cada cuatro', 'debería empezar a cobrarte', 'Pierdes más de lo que ganas'];
    expect(lines.some((l) => lowWinRatePhrases.some((p) => l.includes(p)))).toBe(true);
  });

  it('detecta preferencia fuerte de color', () => {
    const insights = { totalGames: 10, overall: { winPct: 50 }, colorPreference: { white: 9, black: 1 }, humanCaptures: 30, favoriteOpening: null, longestWinStreak: 2, byMode: {} };
    const lines = generateRoast(insights);
    expect(lines.some((l) => l.includes('blancas'))).toBe(true);
  });

  it('detecta apertura muy repetida, pero no una variada', () => {
    const repetitive = { totalGames: 10, overall: { winPct: 50 }, colorPreference: { white: 5, black: 5 }, humanCaptures: 30, favoriteOpening: { name: 'Defensa Siciliana', count: 8 }, longestWinStreak: 2, byMode: {} };
    expect(generateRoast(repetitive).some((l) => l.includes('Repertorio de una sola carta'))).toBe(true);

    const varied = { totalGames: 10, overall: { winPct: 50 }, colorPreference: { white: 5, black: 5 }, humanCaptures: 30, favoriteOpening: { name: 'Defensa Siciliana', count: 2 }, longestWinStreak: 2, byMode: {} };
    expect(generateRoast(varied).some((l) => l.includes('Repertorio de una sola carta'))).toBe(false);
  });

  it('agrega el zasca de la peor jugada solo si se le pasa worstMove', () => {
    const insights = { totalGames: 10, overall: { winPct: 50 }, colorPreference: { white: 5, black: 5 }, humanCaptures: 30, favoriteOpening: null, longestWinStreak: 2, byMode: {} };
    expect(generateRoast(insights).some((l) => l.includes('plumazo'))).toBe(false);

    const worstMove = { moveReport: { played: 'Qb1-b8', loss: 294 } };
    const withZasca = generateRoast(insights, worstMove);
    expect(withZasca.some((l) => l.includes('Qb1-b8') && l.includes('294'))).toBe(true);
  });

  it('describe el delta de rating sin convertirlo en una trayectoria', () => {
    const rising = { totalGames: 10, overall: { winPct: 50 }, colorPreference: { white: 5, black: 5 }, humanCaptures: 30, favoriteOpening: null, longestWinStreak: 2, byMode: {}, ratingTrend: { first: 600, last: 660, min: 540, max: 690, delta: 60 } };
    const falling = { ...rising, ratingTrend: { first: 700, last: 640, min: 620, max: 760, delta: -60 } };
    const risingCopy = generateRoast(rising).join(' ');
    const fallingCopy = generateRoast(falling).join(' ');
    expect(risingCopy).toMatch(/60 puntos por encima del primero|60 puntos por encima del primer registro/);
    expect(fallingCopy).toMatch(/60 puntos por debajo del primero|60 puntos por debajo del primer registro/);
    expect(risingCopy).not.toMatch(/sube que da gusto|mejorando de verdad|racha de gloria/i);
    expect(fallingCopy).not.toMatch(/va en picada|no para de bajar|cuesta abajo/i);
  });

  it('siempre devuelve al menos una línea si hay partidas jugadas', () => {
    const balanced = { totalGames: 20, overall: { winPct: 55 }, colorPreference: { white: 10, black: 10 }, humanCaptures: 60, favoriteOpening: { name: 'Apertura Italiana', count: 5 }, longestWinStreak: 3, byMode: {} };
    expect(generateRoast(balanced).length).toBeGreaterThan(0);
  });
});

describe('tierTrendComment', () => {
  it('sin variación observada, describe el dato sin inventar una tendencia', () => {
    const flat = { min: 800, max: 800, first: 800, last: 800, delta: 0 };
    const comment = tierTrendComment('Aficionado', flat);
    expect(comment).toContain('no muestran variación de rating');
    expect(comment).not.toMatch(/mejorando|bajando|estancado/i);
  });

  it('un último registro mayor no se vende como mejora demostrada', () => {
    const trend = { min: 500, max: 600, first: 500, last: 560, delta: 60 };
    const comment = tierTrendComment('Principiante', trend);
    expect(comment).toContain('+60');
    expect(comment).toContain('primer y el último registro');
    expect(comment).toContain('no demuestra por sí solo');
  });

  it('un último registro menor no se vende como caída sostenida', () => {
    const trend = { min: 1300, max: 1450, first: 1450, last: 1360, delta: -90 };
    const comment = tierTrendComment('Avanzado', trend);
    expect(comment).toContain('-90');
    expect(comment).toContain('primer y el último registro');
    expect(comment).toContain('no demuestra por sí solo');
  });

  it('un delta chico no se convierte en estancamiento demostrado', () => {
    const trend = { min: 590, max: 610, first: 600, last: 598, delta: -2 };
    const comment = tierTrendComment('Principiante', trend);
    expect(comment).toContain('-2');
    expect(comment).toContain('demasiado poco para llamarlo estancado');
    expect(comment).not.toContain('mejorando');
    expect(comment).not.toContain('bajando');
  });

  it('cada categoría tiene su propia sugerencia (no todas caen en el mismo texto genérico)', () => {
    const trend = { min: 500, max: 600, first: 600, last: 598, delta: -2 };
    const principiante = tierTrendComment('Principiante', trend);
    const maestro = tierTrendComment('Maestro', trend);
    expect(principiante).not.toBe(maestro);
  });
});

describe('generateRoast — extras (logros y puzzles)', () => {
  const base = { totalGames: 10, overall: { winPct: 50 }, colorPreference: { white: 5, black: 5 }, humanCaptures: 30, favoriteOpening: null, longestWinStreak: 2, byMode: {} };

  it('comenta el hito de muchas partidas jugadas', () => {
    const many = { ...base, totalGames: 55 };
    expect(generateRoast(many).some((l) => l.includes('55 partidas'))).toBe(true);
  });

  it('comenta cero logros desbloqueados', () => {
    const lines = generateRoast(base, null, { achievementsUnlocked: 0, achievementsTotal: 14, puzzlesSolved: 5 });
    expect(lines.some((l) => l.includes('Cero logros'))).toBe(true);
  });

  it('comenta casi todos los logros desbloqueados', () => {
    const lines = generateRoast(base, null, { achievementsUnlocked: 11, achievementsTotal: 14, puzzlesSolved: 5 });
    expect(lines.some((l) => l.includes('11 de 14 logros'))).toBe(true);
  });

  it('sin datos de extras, no revienta ni agrega nada de logros/puzzles', () => {
    const lines = generateRoast(base);
    expect(lines.some((l) => l.includes('logro') || l.includes('puzzle'))).toBe(false);
  });
});


describe('generateCoaching', () => {
  const base = {
    totalGames: 12,
    overall: { wins: 4, draws: 1, losses: 7, total: 12, winPct: 33 },
    byMode: {},
    favoriteOpening: { name: 'Defensa Siciliana', count: 8 },
    openingDossier: [{ name: 'Defensa Siciliana', games: 5, wins: 1, draws: 0, losses: 4, winPct: 20, white: 1, black: 4 }],
    colorPreference: { white: 2, black: 10 },
    longestWinStreak: 2,
    ratingTrend: { min: 520, max: 600, first: 600, last: 550, delta: -50 },
    humanCaptures: 30,
  };

  it('convierte reincidencias tácticas en consejos accionables', () => {
    const rivalry = { incidents: { 'human:MISSED_MATE': 3 } };
    const tips = generateCoaching(base, rivalry, { puzzlesSolved: 8, personalPuzzles: 2 });
    expect(tips.some((t) => t.title.includes('mates') && t.action.includes('jaques'))).toBe(true);
  });

  it('prioriza una apertura con mal rendimiento sin inventar evaluación del motor', () => {
    const tips = generateCoaching(base, { incidents: {} }, { puzzlesSolved: 8 });
    expect(tips.some((t) => t.title.includes('Defensa Siciliana') && t.action.includes('Aperturas famosas'))).toBe(true);
  });

  it('sugiere puzzles personales cuando hay poca táctica entrenada', () => {
    const tips = generateCoaching(base, { incidents: { 'cpu:KNIGHT_FORK': 2 } }, { puzzlesSolved: 1, personalPuzzles: 4 });
    expect(tips.some((t) => t.action.includes('Tus crímenes'))).toBe(true);
  });

  it('mantiene el coaching de rating en hechos primer-último, no en causas o trayectorias', () => {
    const lower = generateCoaching(base, { incidents: {} }, { puzzlesSolved: 8 });
      .find((item) => item.evidence?.kind === 'rating');
    const higher = generateCoaching({
      ...base,
      totalGames: 12,
      ratingTrend: { min: 580, max: 710, first: 600, last: 670, delta: 70 },
    }, { incidents: {} }, { puzzlesSolved: 8 }).find((item) => item.evidence?.kind === 'rating');
    expect(lower?.diagnosis).toContain('50 puntos por debajo del primero');
    expect(lower?.diagnosis).toContain('no demuestra por sí solo');
    expect(higher?.diagnosis).toContain('70 puntos por encima del primero');
    expect(higher?.diagnosis).toContain('no una tendencia garantizada');
    expect(lower?.title).not.toMatch(/volumen/i);
    expect(higher?.title).not.toMatch(/cómodo/i);
  });
});


describe('trainingTargetForCoaching', () => {
  it('ofrece entrenamiento sólo cuando hay posiciones personales del incidente medido', () => {
    const item = { training: { filter: { incidentKey: 'human:MISSED_MATE', label: 'Mates ignorados' } } };
    const puzzles = [
      { id: 'p1', incidentKeys: ['human:MISSED_MATE'] },
      { id: 'p2', incidentKeys: ['cpu:KNIGHT_FORK'] },
    ];
    expect(trainingTargetForCoaching(item, puzzles)).toMatchObject({
      source: 'personal', count: 1, label: 'Entrenar este error',
      filter: { incidentKey: 'human:MISSED_MATE' },
    });
  });

  it('no inventa un CTA si el diagnóstico no tiene posiciones relacionadas', () => {
    const item = { training: { filter: { incidentKey: 'human:MISSED_MATE' } } };
    expect(trainingTargetForCoaching(item, [{ id: 'p1', incidentKeys: ['cpu:KNIGHT_FORK'] }])).toBeNull();
    expect(trainingTargetForCoaching({ title: 'Consejo genérico' }, [{ id: 'p1' }])).toBeNull();
  });

  it('filtra por apertura usando la procedencia real de las autopsias', () => {
    const item = { training: { filter: { opening: 'Defensa Siciliana', label: 'Defensa Siciliana' } } };
    const puzzles = [
      { id: 'p1', opening: 'Defensa Siciliana' },
      { id: 'p2', opening: 'Apertura Italiana' },
    ];
    expect(trainingTargetForCoaching(item, puzzles)?.count).toBe(1);
  });
});


describe('selectTrainingNow', () => {
  it('prioriza un error medido y entrenable frente a un consejo genérico de la misma prioridad', () => {
    const coaching = [
      { priority: 'high', priorityLabel: 'ALTA', title: 'Volumen', evidence: { kind: 'rating', count: 40 } },
      { priority: 'high', priorityLabel: 'ALTA', title: 'Mates', evidence: { kind: 'incident', count: 3 }, training: { filter: { incidentKey: 'human:MISSED_MATE' } } },
    ];
    const puzzles = [{ id: 'm1', incidentKeys: ['human:MISSED_MATE'] }];
    expect(selectTrainingNow(coaching, puzzles)).toMatchObject({ item: { title: 'Mates' }, target: { count: 1 } });
  });

  it('si no hay material personal mantiene la prioridad sin inventar un CTA', () => {
    const coaching = [
      { priority: 'high', priorityLabel: 'ALTA', title: 'Siciliana', evidence: { kind: 'opening', count: 7 }, training: { filter: { opening: 'Defensa Siciliana' } } },
      { priority: 'medium', priorityLabel: 'MEDIA', title: 'Otro', evidence: { kind: 'rating', count: 20 } },
    ];
    const selected = selectTrainingNow(coaching, []);
    expect(selected.item.title).toBe('Siciliana');
    expect(selected.target).toBeNull();
  });
});
