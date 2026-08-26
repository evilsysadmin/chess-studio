import { beforeEach, describe, expect, it } from 'vitest';
import {
  COMBAT_DECORATIONS,
  loadCombatService,
  meritForStats,
  rankForService,
  recordCombatServiceEvent,
  resetCombatService,
  summarizeCombatService,
} from './combatService.js';

beforeEach(() => localStorage.clear());

describe('hoja de servicio de Combate', () => {
  it('arranca como Recluta sin inventar historial', () => {
    const summary = summarizeCombatService(loadCombatService());
    expect(summary.rank.label).toBe('Recluta');
    expect(summary.merit).toBe(0);
    expect(summary.decorations).toHaveLength(0);
  });

  it('premia hechos reales de supervivencia y evita duplicar una batalla', () => {
    const first = recordCombatServiceEvent({
      battleId: 'battle-1', outcome: 'win', survivorCount: 16, variant: 'combat',
    });
    expect(first.record.stats).toMatchObject({ battles: 1, wins: 1, flawlessWins: 1 });
    expect(first.newDecorations.map((m) => m.id)).toEqual(expect.arrayContaining(['first-sortie', 'first-win', 'no-casualties']));

    const duplicate = recordCombatServiceEvent({
      battleId: 'battle-1', outcome: 'win', survivorCount: 16, variant: 'combat',
    });
    expect(duplicate.record.stats.wins).toBe(1);
    expect(duplicate.meritGained).toBe(0);
  });

  it('no permite llegar a oficial perdiendo en bucle', () => {
    const stats = {
      battles: 500, wins: 0, draws: 0, losses: 500,
      retirements: 0, totalSurvivors: 0, survivorSamples: 0,
      flawlessWins: 0, hardshipWins: 0, currentWinStreak: 0, bestWinStreak: 0,
      roguelikeFloorsCleared: 0, highestFloorCleared: 0, bossesDefeated: 0,
      towerCompletions: 0, endlessFloorsCleared: 0,
    };
    expect(meritForStats(stats)).toBeGreaterThan(350);
    expect(rankForService(stats).label).toBe('Recluta');
  });

  it('condecoraciones de veteranía exigen piezas realmente mejoradas y supervivientes', () => {
    const result = recordCombatServiceEvent({
      battleId: 'veteranos', outcome: 'win', survivorCount: 12, variant: 'combat',
      veteranPieces: 12, elitePieces: 1,
    });
    const ids = result.record.decorations.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['veteran-squad', 'elite-piece', 'old-guard']));
  });

  it('registra pisos, boss y Torre como servicio de campaña', () => {
    const result = recordCombatServiceEvent({
      battleId: 'boss-10', outcome: 'win', survivorCount: 5,
      variant: 'roguelike', roguelikeFloor: 10, roguelikeMode: 'tower', bossDefeated: true,
    });
    expect(result.record.stats).toMatchObject({
      wins: 1,
      hardshipWins: 1,
      roguelikeFloorsCleared: 1,
      highestFloorCleared: 10,
      bossesDefeated: 1,
      towerCompletions: 1,
    });
    const ids = result.record.decorations.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['under-fire', 'tower-3', 'tower-5', 'tower-9', 'king-slayer', 'tower-complete']));
  });

  it('migra el mejor piso antiguo de forma conservadora: alcanzado no significa superado', () => {
    localStorage.setItem('chess-study-roguelike-best-floor', '7');
    resetCombatService();
    const summary = summarizeCombatService(loadCombatService());
    expect(summary.stats.highestFloorCleared).toBe(6);
    expect(summary.decorations.some((m) => m.id === 'tower-5')).toBe(true);
  });

  it('el catálogo de medallas no repite ids', () => {
    expect(new Set(COMBAT_DECORATIONS.map((m) => m.id)).size).toBe(COMBAT_DECORATIONS.length);
  });
});
