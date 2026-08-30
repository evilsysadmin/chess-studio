import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOARD_THEMES,
  CONTRACTS,
  chooseContract,
  loadBoardTheme,
  loadCareer,
  recordCareerGame,
  reconcileCareerHistory,
  recordSpecialRunResult,
  saveBoardTheme,
  startSpecialRun,
  unlockedBoardThemes,
} from './career.js';
import { setAdminPreviewAccess } from './adminPreview.js';

const NOW = new Date('2026-08-22T12:00:00.000Z');

beforeEach(() => {
  localStorage.clear();
  setAdminPreviewAccess(false);
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function game(overrides = {}) {
  return {
    id: 'g1',
    date: '2026-08-22T10:00:00.000Z',
    outcome: 'win',
    difficulty: 65,
    humanColor: 'w',
    timeControl: { id: '5+0' },
    moves: Array.from({ length: 18 }, (_, i) => ({ san: i === 8 ? 'O-O' : 'e4', piece: i === 8 ? 'k' : 'p' })),
    ...overrides,
  };
}

describe('career persistente', () => {
  it('muestra todos los tableros durante una sesión de administrador sin cambiar hitos reales', () => {
    const career = loadCareer();
    expect(unlockedBoardThemes(career)).toHaveLength(1);
    setAdminPreviewAccess(true);
    expect(unlockedBoardThemes(career)).toEqual(BOARD_THEMES);
  });

  it('arranca con esquema completo y tema clásico', () => {
    const state = loadCareer();
    expect(state.version).toBe(2);
    expect(state.season).toMatchObject({ id: '2026-08', games: 0, wins: 0, draws: 0, losses: 0 });
    expect(state.records.bestWinStreak).toBe(0);
    expect(loadBoardTheme()).toBe('classic');
  });

  it('registra resultado, récords, ritmo, presión y contrato sin inventar datos', () => {
    const contract = CONTRACTS.find((item) => item.id === 'no-hints');
    const state = recordCareerGame(game(), {
      hintsUsed: 0,
      pressureMoves: 4,
      pressureIncidents: 1,
      contract,
    });
    expect(state.season).toMatchObject({ games: 1, wins: 1, draws: 0, losses: 0 });
    expect(state.records).toMatchObject({ fastestWinPlies: 18, longestGamePlies: 18, highestDifficultyWin: 65, bestWinStreak: 1, currentWinStreak: 1 });
    expect(state.byTimeControl['5+0']).toEqual({ games: 1, wins: 1, draws: 0, losses: 0 });
    expect(state.pressure).toEqual({ moves: 4, incidents: 1 });
    expect(state.contracts).toEqual({ offered: 1, completed: 1, failed: 0 });
  });

  it('normaliza hitos legacy de Contrato al vocabulario de Retos', () => {
    localStorage.setItem('chess-study-career', JSON.stringify({
      version: 2,
      milestones: [
        { id: 'old-1', text: 'Contrato cumplido: Sin ruedines.' },
        { id: 'old-2', text: 'Reto cumplido: Haz el trabajo.' },
      ],
    }));
    expect(loadCareer().milestones.map((row) => row.text)).toEqual([
      'Reto superado · Sin ruedines.',
      'Reto superado · Haz el trabajo.',
    ]);
  });

  it('una derrota corta la racha y puede fallar un contrato', () => {
    recordCareerGame(game());
    const contract = CONTRACTS.find((item) => item.id === 'win');
    const state = recordCareerGame(game({ id: 'g2', outcome: 'loss' }), { contract });
    expect(state.records.currentWinStreak).toBe(0);
    expect(state.records.bestWinStreak).toBe(1);
    expect(state.contracts.failed).toBe(1);
    expect(state.season.losses).toBe(1);
  });

  it('backfill desde historial reconstruye sólo métricas demostrables', () => {
    const state = reconcileCareerHistory([
      game({ id: 'a', date: '2026-08-20T10:00:00.000Z', difficulty: 40, moves: Array(20).fill({}), timeControl: { id: '3+2' } }),
      game({ id: 'b', date: '2026-08-21T10:00:00.000Z', outcome: 'loss', difficulty: 80, moves: Array(50).fill({}), timeControl: { id: '3+2' } }),
    ]);
    expect(state.season).toMatchObject({ games: 2, wins: 1, losses: 1, draws: 0 });
    expect(state.byTimeControl['3+2']).toEqual({ games: 2, wins: 1, draws: 0, losses: 1 });
    expect(state.records).toMatchObject({ fastestWinPlies: 20, longestGamePlies: 50, highestDifficultyWin: 40, bestWinStreak: 1 });
    expect(state.contracts).toEqual({ offered: 0, completed: 0, failed: 0 });
    expect(state.pressure).toEqual({ moves: 0, incidents: 0 });
  });

  it('Boss Run progresa seis victorias y archiva el resultado', () => {
    let run = startSpecialRun('boss');
    for (let i = 0; i < 6; i += 1) run = recordSpecialRunResult(run, 'win');
    expect(run).toMatchObject({ active: false, outcome: 'win', completedStages: 6, wins: 6 });
    const career = loadCareer();
    expect(career.records.bestBossStage).toBe(6);
    expect(career.runHistory[0]).toMatchObject({ mode: 'boss', outcome: 'win', completedStages: 6 });
  });

  it('themes sólo se pueden seleccionar cuando sus requisitos están demostrados', () => {
    expect(unlockedBoardThemes({ records: {}, contracts: {} }).map((theme) => theme.id)).toEqual(['classic']);
    expect(saveBoardTheme('royal')).toBe('classic');

    const earned = { records: { bestWinStreak: 8, highestDifficultyWin: 75, puzzleRushBest: 8 }, contracts: { failed: 0 } };
    const unlocked = unlockedBoardThemes(earned).map((theme) => theme.id);
    expect(unlocked).toEqual(expect.arrayContaining(['classic', 'midnight', 'blood', 'royal', 'forensic', 'obsidian']));
    expect(unlockedBoardThemes({ records: { bestWinStreak: 7 }, contracts: {} }).map((theme) => theme.id)).not.toContain('obsidian');
    expect(BOARD_THEMES).toHaveLength(6);
  });

  it('contrato ofertado cambia con el historial de incidentes y es estable por gameCount', () => {
    expect(chooseContract({ gameCount: 0, incidents: {} }).id).toBe('win');
    const disciplined = chooseContract({ gameCount: 0, incidents: { missedMate: 5 } });
    expect(disciplined.id).not.toBe('win');
    expect(chooseContract({ gameCount: 3, incidents: {} }).id).toBe(CONTRACTS[3].id);
  });
});
