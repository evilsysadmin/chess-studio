import { describe, it, expect, beforeEach } from 'vitest';
import { updateRating, ratingChangeDetails, cpuRatingForDifficulty, ratingScoreForOutcome, ratingLabel, ratingPeriodCheckpoints, ratingProgress, loadRating, RATING_TIERS, loadRatingHistory, recordRatingHistory, resetRatingHistory, difficultyForRating } from './playerRating.js';

beforeEach(() => localStorage.clear());


describe('ratingScoreForOutcome — partidas y torneo', () => {
  it('victoria=1, tablas=0.5 y derrota/abandono=0', () => {
    expect(ratingScoreForOutcome('win')).toBe(1);
    expect(ratingScoreForOutcome('draw')).toBe(0.5);
    expect(ratingScoreForOutcome('loss')).toBe(0);
    expect(ratingScoreForOutcome('retired')).toBe(0);
  });

  it('una derrota competitiva reduce rating si no estás pegado al piso', () => {
    const before = { rating: 1100, games: 20 };
    const after = updateRating(before, 60, ratingScoreForOutcome('loss'));
    expect(after.rating).toBeLessThan(before.rating);
  });
});

describe('updateRating', () => {
  it('ganarle a un rival fuerte sube más que ganarle a uno flojo', () => {
    const base = { rating: 800, games: 0 };
    const vsFuerte = updateRating(base, 90, 1);
    const vsFlojo = updateRating(base, 5, 1);
    expect(vsFuerte.rating - base.rating).toBeGreaterThan(vsFlojo.rating - base.rating);
  });

  it('perder contra un rival flojo castiga más que perder contra uno fuerte', () => {
    const base = { rating: 800, games: 0 };
    const vsFlojo = updateRating(base, 5, 0);
    const vsFuerte = updateRating(base, 90, 0);
    expect(base.rating - vsFlojo.rating).toBeGreaterThan(base.rating - vsFuerte.rating);
  });

  it('nunca baja de 400', () => {
    let state = { rating: 400, games: 0 };
    for (let i = 0; i < 10; i++) state = updateRating(state, 0, 0);
    expect(state.rating).toBeGreaterThanOrEqual(400);
  });

  it('cuenta la cantidad de partidas jugadas', () => {
    let state = { rating: 800, games: 0 };
    state = updateRating(state, 50, 1);
    state = updateRating(state, 50, 0);
    expect(state.games).toBe(2);
  });

  it('el rating por defecto (400) es exactamente el piso — no arranca por debajo de a dónde podría volver', () => {
    // No se importa DEFAULT_RATING directo (no está exportado a propósito,
    // es un detalle interno) — se verifica indirecto: el piso nunca baja de
    // 400, así que loadRating() en un perfil nuevo debería dar exactamente eso.
    expect(loadRating().rating).toBe(400);
  });

  it('los primeros partidos (rating "provisional") se mueven más que los partidos ya establecidos', () => {
    const nuevo = { rating: 400, games: 0 }; // partido número 1, provisional
    const establecido = { rating: 400, games: 20 }; // ya pasó el período provisional

    const gananciaNuevo = updateRating(nuevo, 50, 1).rating - nuevo.rating;
    const gananciaEstablecido = updateRating(establecido, 50, 1).rating - establecido.rating;

    expect(gananciaNuevo).toBeGreaterThan(gananciaEstablecido);
  });

  it('el K-factor provisional es exactamente el doble del normal', () => {
    // mismo rating, mismo rival, mismo resultado -- solo cambia games
    const nuevo = { rating: 800, games: 0 };
    const establecido = { rating: 800, games: 20 };

    const deltaNuevo = updateRating(nuevo, 60, 1).rating - nuevo.rating;
    const deltaEstablecido = updateRating(establecido, 60, 1).rating - establecido.rating;

    // el delta es K * (score - expected) redondeado -- con el mismo expected,
    // el delta provisional debería ser ~2x el establecido (con margen por el redondeo)
    expect(Math.round(deltaNuevo / deltaEstablecido)).toBe(2);
  });

  it('deja de ser provisional exactamente en PROVISIONAL_GAMES (12) partidos, no antes ni después', () => {
    const justoAntes = { rating: 800, games: 11 }; // este es el partido 12, todavía provisional
    const justoDespues = { rating: 800, games: 12 }; // este es el partido 13, ya establecido

    const deltaAntes = updateRating(justoAntes, 60, 1).rating - justoAntes.rating;
    const deltaDespues = updateRating(justoDespues, 60, 1).rating - justoDespues.rating;

    expect(deltaAntes).toBeGreaterThan(deltaDespues);
  });
});

describe('ELO dinámico por fuerza efectiva de la CPU', () => {
  it('la fuerza efectiva crece con la dificultad y respeta los saltos del motor', () => {
    const levels = [0, 20, 45, 60, 65, 70, 90, 100];
    const ratings = levels.map(cpuRatingForDifficulty);
    for (let i = 1; i < ratings.length; i += 1) expect(ratings[i]).toBeGreaterThan(ratings[i - 1]);
    expect(cpuRatingForDifficulty(65)).toBeGreaterThan(cpuRatingForDifficulty(60));
    expect(cpuRatingForDifficulty(65)).toBeLessThan(cpuRatingForDifficulty(70));
  });

  it('devuelve el delta exacto, rating rival y expectativa usados en el cálculo', () => {
    const base = { rating: 900, games: 20 };
    const win = ratingChangeDetails(base, 65, 1);
    const loss = ratingChangeDetails(base, 65, 0);
    expect(win.delta).toBeGreaterThan(0);
    expect(loss.delta).toBeLessThan(0);
    expect(win.cpuRating).toBe(cpuRatingForDifficulty(65));
    expect(win.expectedScore).toBeGreaterThan(0);
    expect(win.expectedScore).toBeLessThan(1);
  });

  it('la performance competitiva es el resultado: ganar a 65 paga más que ganar a 20', () => {
    const base = { rating: 900, games: 20 };
    expect(ratingChangeDetails(base, 65, 1).delta).toBeGreaterThan(ratingChangeDetails(base, 20, 1).delta);
  });
});

describe('ratingLabel', () => {
  it('devuelve etiquetas crecientes con el rating', () => {
    expect(ratingLabel(600)).toBe('Principiante');
    expect(ratingLabel(1500)).toBe('Avanzado');
    expect(ratingLabel(2000)).toBe('Maestro');
  });
});

describe('loadRating', () => {
  it('arranca en 400 (justo en el piso real de updateRating — no hay "más abajo" a donde caer)', () => {
    const state = loadRating();
    expect(state.rating).toBe(400);
    expect(ratingLabel(state.rating)).toBe('Principiante');
  });
});

describe('RATING_TIERS', () => {
  it('cubre todo el rango sin huecos ni superposiciones', () => {
    for (let i = 0; i < RATING_TIERS.length - 1; i++) {
      expect(RATING_TIERS[i].max + 1).toBe(RATING_TIERS[i + 1].min);
    }
    expect(RATING_TIERS[0].min).toBe(0);
    expect(RATING_TIERS[RATING_TIERS.length - 1].max).toBe(Infinity);
  });
});

describe('ratingProgress', () => {
  it('calcula cuánto falta para la siguiente categoría', () => {
    const p = ratingProgress(850); // mitad de Aficionado (700-999)
    expect(p.tier.label).toBe('Aficionado');
    expect(p.pointsToNextTier).toBe(150);
    expect(p.progressPct).toBe(50);
    expect(p.isMaxTier).toBe(false);
  });

  it('en la categoría tope, no hay "siguiente" y el progreso es 100%', () => {
    const p = ratingProgress(2500);
    expect(p.tier.label).toBe('Maestro');
    expect(p.isMaxTier).toBe(true);
    expect(p.pointsToNextTier).toBeNull();
    expect(p.progressPct).toBe(100);
  });
});

describe('recordRatingHistory / loadRatingHistory', () => {
  it('arranca vacío', () => {
    expect(loadRatingHistory()).toEqual([]);
  });

  it('graba una foto por cada llamada, en orden', () => {
    recordRatingHistory(600);
    recordRatingHistory(615);
    recordRatingHistory(608);
    const history = loadRatingHistory();
    expect(history.map((p) => p.rating)).toEqual([600, 615, 608]);
    expect(history[0].date).toBeDefined();
  });

  it('recorta a los últimos 200 puntos, sin crecer sin límite', () => {
    for (let i = 0; i < 250; i++) recordRatingHistory(600 + i);
    const history = loadRatingHistory();
    expect(history).toHaveLength(200);
    expect(history[history.length - 1].rating).toBe(849); // el último grabado
  });

  it('resetRatingHistory lo vacía', () => {
    recordRatingHistory(700);
    resetRatingHistory();
    expect(loadRatingHistory()).toEqual([]);
  });
});

describe('ratingPeriodCheckpoints', () => {
  it('resume hoy, siete y treinta días usando el punto anterior como referencia', () => {
    const history = [
      { date: '2026-07-01T12:00:00Z', rating: 700 },
      { date: '2026-08-01T12:00:00Z', rating: 730 },
      { date: '2026-08-20T12:00:00Z', rating: 760 },
      { date: '2026-08-25T07:00:00Z', rating: 775 },
      { date: '2026-08-25T10:00:00Z', rating: 770 },
    ];
    const checkpoints = ratingPeriodCheckpoints(history, new Date('2026-08-25T12:00:00Z'));
    expect(checkpoints.map((item) => item.label)).toEqual(['Hoy', '7 días', '30 días']);
    expect(checkpoints[0]).toMatchObject({ delta: 10, games: 2, hasData: true });
    expect(checkpoints[1]).toMatchObject({ delta: 40, games: 3, hasData: true });
    expect(checkpoints[2]).toMatchObject({ delta: 70, games: 4, hasData: true });
  });

  it('tolera historial vacío o puntos inválidos sin fabricar progreso', () => {
    expect(ratingPeriodCheckpoints([], new Date('2026-08-25T12:00:00Z'))).toEqual([]);
    expect(ratingPeriodCheckpoints([{ date: 'no', rating: 'x' }], new Date('2026-08-25T12:00:00Z'))).toEqual([]);
  });
});

describe('difficultyForRating', () => {
  it('nunca baja de 0 ni supera 100', () => {
    expect(difficultyForRating(0)).toBe(0);
    expect(difficultyForRating(200)).toBe(0);
    expect(difficultyForRating(5000)).toBe(100);
  });

  it('el rating por defecto (600, con el que arranca cualquiera) da una dificultad accesible', () => {
    const d = difficultyForRating(600);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(30); // accesible, no un muro desde el primer combate
  });

  it('sube de forma monótona con el rating — nunca baja al subir el rating', () => {
    const ratings = [200, 400, 600, 800, 1000, 1300, 1600, 1900, 2200];
    const difficulties = ratings.map(difficultyForRating);
    for (let i = 1; i < difficulties.length; i++) {
      expect(difficulties[i]).toBeGreaterThanOrEqual(difficulties[i - 1]);
    }
  });

  it('un jugador Maestro (1900+) enfrenta dificultad alta, cerca del tope', () => {
    expect(difficultyForRating(1900)).toBeGreaterThanOrEqual(90);
  });
});
