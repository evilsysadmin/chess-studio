import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_PLAYER_PORTRAIT_CACHE_KEY,
  PLAYER_PORTRAIT_MAX_CHARS,
  buildPlayerPortraitFacts,
  formatPlayerPortraitCooldown,
  loadCachedPlayerPortrait,
  markPlayerPortraitManualRefresh,
  playerPortraitGenerationKey,
  playerPortraitManualRefreshState,
  saveCachedPlayerPortrait,
  shouldCommitManualPortraitRefresh,
} from './aiPlayerPortrait.js';
import { clearStorageMemoryFallback } from './safeStorage.js';

describe('AI player portrait', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
  });

  it('envía sólo hechos agregados y medidos con fuerza de evidencia explícita', () => {
    const facts = buildPlayerPortraitFacts({
      totalGames: 9,
      overall: { wins: 4, draws: 1, losses: 4, winPct: 44 },
      byMode: { casual: { total: 5, wins: 3, draws: 0, losses: 2, winPct: 60 }, practice: { total: 2, wins: 2, draws: 0, losses: 0, winPct: 100 } },
      favoriteOpening: { name: 'Defensa Siciliana', count: 5 },
      openingDossier: [{ name: 'Defensa Siciliana', games: 5, wins: 3, draws: 0, losses: 2, winPct: 60 }],
      colorPreference: { white: 6, black: 3 },
      longestWinStreak: 3,
      ratingTrend: { first: 1200, last: 1260, delta: 60, min: 1180, max: 1270 },
      humanCaptures: 31,
    }, {
      record: {
        games: 9,
        wins: 4,
        draws: 1,
        losses: 4,
        bestHumanStreak: 2,
        bestCpuStreak: 2,
        byTimeControl: {
          '3+2': { games: 4, wins: 1, draws: 1, losses: 2 },
          '5+0': { games: 5, wins: 3, draws: 0, losses: 2 },
          '15+10': { games: 10, wins: 7, draws: 1, losses: 2 },
          '1+0': { games: 2, wins: 2, draws: 0, losses: 0 },
          none: { games: 99, wins: 99, draws: 0, losses: 0 },
        },
      },
      incidents: { 'human:MISSED_MATE': 2 },
    }, { puzzlesSolved: 12, personalPuzzles: 4 }, { moveReport: { played: 'Qh5', suggested: 'Nf3', loss: 210 } });

    expect(facts.total_games).toBe(9);
    expect(facts.evidence_strength.games).toBe('medium');
    expect(facts.by_mode.casual.win_pct).toBe(60);
    expect(facts.by_mode.practice).toBeUndefined();
    expect(facts.by_time_control).toEqual({
      '3+2': { games: 4, wins: 1, draws: 1, losses: 2, win_pct: 25, evidence_strength: 'low' },
      '5+0': { games: 5, wins: 3, draws: 0, losses: 2, win_pct: 60, evidence_strength: 'medium' },
      '15+10': { games: 10, wins: 7, draws: 1, losses: 2, win_pct: 70, evidence_strength: 'high' },
    });
    expect(facts.favorite_opening).toEqual(expect.objectContaining({
      name: 'Defensa Siciliana',
      games: 5,
      evidence_strength: 'medium',
    }));
    expect(facts.openings[0]).toEqual(expect.objectContaining({
      name: 'Defensa Siciliana',
      games: 5,
      evidence_strength: 'medium',
    }));
    expect(facts.noteworthy_incidents).toEqual([{ key: 'human:MISSED_MATE', count: 2 }]);
    expect(facts.worst_recorded_move.centipawn_loss).toBe(210);
  });

  it('reutiliza el Player Model compartido como autoridad del retrato', () => {
    const sharedModel = {
      samples: { games: 7 },
      confidence: { games: 'medium' },
      outcomes: { wins: 5, draws: 1, losses: 1, winPct: 71 },
      colorPreference: { white: 4, black: 3 },
      openings: [{
        name: 'Defensa Siciliana',
        games: 4,
        wins: 3,
        draws: 0,
        losses: 1,
        winPct: 75,
        confidence: 'low',
      }],
      ratingTrend: { first: 1200, last: 1240, delta: 40, min: 1190, max: 1250 },
      timeControls: [{
        id: '5+0',
        games: 5,
        wins: 4,
        draws: 0,
        losses: 1,
        winPct: 80,
        confidence: 'medium',
      }],
    };
    const facts = buildPlayerPortraitFacts({
      totalGames: 99,
      overall: { wins: 0, draws: 0, losses: 99, winPct: 0 },
      byMode: {},
      favoriteOpening: { name: 'Defensa Siciliana', count: 4 },
      longestWinStreak: 2,
      humanCaptures: 20,
    }, {
      record: {
        games: 99,
        wins: 0,
        draws: 0,
        losses: 99,
        byTimeControl: {
          '5+0': { games: 99, wins: 0, draws: 0, losses: 99 },
        },
      },
    }, {}, null, sharedModel);

    expect(facts.total_games).toBe(7);
    expect(facts.record).toEqual({ wins: 5, draws: 1, losses: 1, win_pct: 71 });
    expect(facts.by_time_control['5+0']).toEqual({
      games: 5,
      wins: 4,
      draws: 0,
      losses: 1,
      win_pct: 80,
      evidence_strength: 'medium',
    });
    expect(facts.openings[0]).toEqual(expect.objectContaining({
      name: 'Defensa Siciliana',
      games: 4,
      win_pct: 75,
    }));
    expect(facts).not.toHaveProperty('learning_evidence');
  });

  it('incluye evidencia longitudinal ya medida sin inventar una conclusión paralela', () => {
    const sharedModel = {
      samples: { games: 12 },
      confidence: { games: 'medium' },
      outcomes: { wins: 6, draws: 2, losses: 4, winPct: 50 },
      colorPreference: { white: 6, black: 6 },
      openings: [],
      ratingTrend: null,
      timeControls: [],
      recurringErrors: [{
        incidentKey: 'cpu:KNIGHT_FORK',
        label: 'Horquillas de caballo sufridas',
        positions: 3,
        confidence: 'medium',
        improvementState: 'still-occurring',
        debt: { active: true, paid: false, progress: 1, target: 2 },
        postTrainingObservations: {
          latestCleanTrainingAt: '2026-09-10T10:00:00.000Z',
          observedGames: 2,
          recurrenceGames: 1,
          noRecurrenceGames: 1,
          latestObservationAt: '2026-09-14T10:00:00.000Z',
        },
      }],
      trainingProgress: {
        attempts: 4,
        solves: 3,
        cleanSolves: 2,
        attemptedPositions: 3,
        solvedPositions: 2,
        currentlyCleanPositions: 1,
        retentionCompletedPositions: 1,
        retentionDuePositions: 1,
        activeDebts: 1,
        paidDebts: 0,
        lastAttemptAt: '2026-09-14T09:00:00.000Z',
        lastCleanAt: '2026-09-14T09:05:00.000Z',
      },
      cleanPlay: {
        eligibleGames: 4,
        cleanGames: 2,
        cleanRate: 50,
        currentStreak: 1,
        bestStreak: 2,
        latestEligibleClean: true,
        latestEligibleAt: '2026-09-14T10:00:00.000Z',
        latestCleanAt: '2026-09-14T10:00:00.000Z',
      },
      positiveDecisions: {
        eligibleGames: 3,
        comparedMoves: 20,
        enginePreferredMoves: 8,
        preferredRate: 40,
        gamesWithPreferredMoves: 3,
        latestEvidenceAt: '2026-09-14T10:00:00.000Z',
      },
    };
    const facts = buildPlayerPortraitFacts({
      totalGames: 12,
      overall: { wins: 6, draws: 2, losses: 4, winPct: 50 },
      byMode: {},
      colorPreference: { white: 6, black: 6 },
      longestWinStreak: 2,
      humanCaptures: 24,
    }, {}, {}, null, sharedModel);

    expect(facts.learning_evidence.recurring_patterns[0]).toEqual({
      incident_key: 'cpu:KNIGHT_FORK',
      label: 'Horquillas de caballo sufridas',
      positions: 3,
      evidence_strength: 'medium',
      improvement_state: 'still-occurring',
      training_debt: { active: true, paid: false, progress: 1, target: 2 },
      post_training: {
        observed_games: 2,
        recurrence_games: 1,
        no_recurrence_games: 1,
        latest_clean_training_at: '2026-09-10T10:00:00.000Z',
        latest_observation_at: '2026-09-14T10:00:00.000Z',
      },
    });
    expect(facts.learning_evidence.training_progress).toEqual(expect.objectContaining({
      attempts: 4,
      clean_solves: 2,
      active_debts: 1,
      paid_debts: 0,
    }));
    expect(facts.learning_evidence.clean_play).toEqual(expect.objectContaining({
      eligible_games: 4,
      clean_games: 2,
      clean_rate: 50,
    }));
    expect(facts.learning_evidence.positive_decisions).toEqual(expect.objectContaining({
      compared_moves: 20,
      engine_preferred_moves: 8,
      preferred_rate: 40,
    }));
    expect(facts.learning_evidence).not.toHaveProperty('improved');
    expect(facts.learning_evidence).not.toHaveProperty('trend');
  });

  it('regenera automáticamente después de cada partida terminada', () => {
    expect(playerPortraitGenerationKey({ totalGames: 3 })).not.toBe(playerPortraitGenerationKey({ totalGames: 4 }));
    expect(playerPortraitGenerationKey({ totalGames: 4 })).not.toBe(playerPortraitGenerationKey({ totalGames: 5 }));
    expect(playerPortraitGenerationKey({ totalGames: 5 })).toBe('9:5');
  });

  it('cachea sólo el retrato de la generación actual', () => {
    const key = playerPortraitGenerationKey({ totalGames: 7 });
    expect(saveCachedPlayerPortrait(key, 'Te defiendes. Milagrosamente.', 'alice')).toBe(true);
    expect(loadCachedPlayerPortrait(key, 'alice')).toBe('Te defiendes. Milagrosamente.');
    expect(loadCachedPlayerPortrait('1:99', 'alice')).toBeNull();
    expect(localStorage.getItem(AI_PLAYER_PORTRAIT_CACHE_KEY)).toContain('Te defiendes');
  });

  it('invalida retratos del schema anterior al cambiar de modelo', () => {
    const key = playerPortraitGenerationKey({ totalGames: 7 });
    localStorage.setItem(AI_PLAYER_PORTRAIT_CACHE_KEY, JSON.stringify({ schema: 8, generationKey: key, text: 'Viejo Llama.' }));
    expect(loadCachedPlayerPortrait(key, 'alice')).toBeNull();
  });

  it('conserva retratos largos completos en cache', () => {
    const key = playerPortraitGenerationKey({ totalGames: 12 });
    const text = `${'Retrato con contexto. '.repeat(24)}Cierre completo.`;
    expect(text.length).toBeGreaterThan(420);
    expect(text.length).toBeLessThan(PLAYER_PORTRAIT_MAX_CHARS);
    expect(saveCachedPlayerPortrait(key, text, 'alice')).toBe(true);
    expect(loadCachedPlayerPortrait(key, 'alice')).toBe(text);
  });

  it('limita la regeneración manual a una cada seis horas y conserva el retrato', () => {
    const key = playerPortraitGenerationKey({ totalGames: 9 });
    expect(saveCachedPlayerPortrait(key, 'Primera lectura.', 'alice')).toBe(true);
    expect(playerPortraitManualRefreshState({ now: 1_000_000, identityScope: 'alice' }).allowed).toBe(true);
    expect(markPlayerPortraitManualRefresh({ now: 1_000_000, identityScope: 'alice' })).toBe(true);
    const blocked = playerPortraitManualRefreshState({ now: 1_000_000 + 60 * 60 * 1000, identityScope: 'alice' });
    expect(blocked.allowed).toBe(false);
    expect(formatPlayerPortraitCooldown(blocked.retryAfterMs)).toBe('5 h');
    expect(loadCachedPlayerPortrait(key, 'alice')).toBe('Primera lectura.');
    expect(playerPortraitManualRefreshState({ now: 1_000_000 + 6 * 60 * 60 * 1000, identityScope: 'alice' }).allowed).toBe(true);
  });

  it('permite a un admin saltarse el cooldown manual sin tocar la cache', () => {
    expect(markPlayerPortraitManualRefresh({ now: 1_000_000, identityScope: 'alice' })).toBe(true);
    const blocked = playerPortraitManualRefreshState({ now: 1_000_001, identityScope: 'alice' });
    expect(blocked.allowed).toBe(false);
    const admin = playerPortraitManualRefreshState({ now: 1_000_001, identityScope: 'alice', bypassCooldown: true });
    expect(admin).toEqual({ allowed: true, retryAfterMs: 0, nextAllowedAt: null });
  });

  it('nunca reutiliza el retrato cacheado de otra identidad', () => {
    const key = playerPortraitGenerationKey({ totalGames: 9 });
    expect(saveCachedPlayerPortrait(key, 'Lectura de Alice.', 'Alice')).toBe(true);
    expect(loadCachedPlayerPortrait(key, 'alice')).toBe('Lectura de Alice.');
    expect(loadCachedPlayerPortrait(key, 'bob')).toBeNull();
    expect(playerPortraitManualRefreshState({ now: 1_000_000, identityScope: 'bob' }).allowed).toBe(true);
  });

  it('confirma el cooldown manual sólo después de una lectura remota válida', () => {
    expect(shouldCommitManualPortraitRefresh('portrait_manual', 'Lectura remota válida')).toBe(true);
    expect(shouldCommitManualPortraitRefresh('portrait_auto', 'Lectura remota válida')).toBe(false);
    expect(shouldCommitManualPortraitRefresh('portrait_manual', '')).toBe(false);
    expect(shouldCommitManualPortraitRefresh('portrait_manual', null)).toBe(false);
  });
});
