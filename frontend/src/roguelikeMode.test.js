import { describe, it, expect, beforeEach } from 'vitest';
import { Chess } from 'chess.js';
import {
  ROGUELIKE_MODIFIERS,
  applyModifierToFen,
  modifierForFloor,
  modifierForRun,
  encounterForRun,
  seededUnit,
} from './roguelikeModifiers.js';
import {
  loadRun,
  startNewRun,
  markBattleStarted,
  markFloorCleared,
  chooseRunReward,
  advanceFloor,
  completeTower,
  continueIntoEndless,
  endRun,
  loadBestFloor,
  loadTowerCompleted,
  resetRoguelikeRun,
  difficultyForFloor,
  ROGUELIKE_TOWER_FLOORS,
} from './roguelikeRun.js';
import {
  ROGUELIKE_PERKS,
  rewardOptionsForFloor,
  applyRunPerksToRegistry,
} from './roguelikePerks.js';
import {
  ROGUELIKE_BOSS,
  ROGUELIKE_BOSS_FLOOR,
  bossDamageAfterHumanMove,
  bossPhaseForHp,
} from './roguelikeBoss.js';
import { createInitialRegistry, statsFor } from './combat.js';

beforeEach(() => localStorage.clear());

describe('encuentros Roguelike', () => {
  const baseFen = new Chess().fen();

  it('cada modificador produce un FEN válido', () => {
    for (const mod of ROGUELIKE_MODIFIERS) {
      const fen = applyModifierToFen(baseFen, mod.id, 'b');
      expect(() => new Chess(fen)).not.toThrow();
    }
  });

  it('extra_queen da dos damas y double_pawns da 16 peones', () => {
    const queens = new Chess(applyModifierToFen(baseFen, 'extra_queen', 'b')).board().flat().filter((p) => p?.type === 'q' && p.color === 'b');
    const pawns = new Chess(applyModifierToFen(baseFen, 'double_pawns', 'b')).board().flat().filter((p) => p?.type === 'p' && p.color === 'b');
    expect(queens).toHaveLength(2);
    expect(pawns).toHaveLength(16);
  });

  it('el piso 1 ya NO puede salir sin modificador', () => {
    const ids = [0, 0.2, 0.5, 0.8, 0.999].map((roll) => modifierForFloor(1, () => roll).id);
    expect(ids).not.toContain('none');
    expect(ids.every((id) => ['extra_knight', 'extra_bishop'].includes(id))).toBe(true);
  });

  it('misma seed+piso = mismo encuentro', () => {
    expect(modifierForRun('garrafa-claude', 7).id).toBe('extra_queen');
    expect(seededUnit('garrafa-claude', 7)).toBeCloseTo(0.8593932103831321, 12);
    expect(seededUnit('garrafa-claude', 8)).not.toBe(seededUnit('garrafa-claude', 7));
  });

  it('los pisos señalados tienen identidad fija', () => {
    expect(encounterForRun('x', 4)).toMatchObject({ label: 'La Fortaleza', modifierId: 'extra_rook', tier: 'elite' });
    expect(encounterForRun('x', 5)).toMatchObject({ label: 'El Usurero', modifierId: 'extra_queen', tier: 'miniboss' });
    expect(encounterForRun('x', 9)).toMatchObject({ label: 'La Guardia Final', modifierId: 'double_pawns', tier: 'elite' });
    expect(encounterForRun('x', 10)).toMatchObject({ label: 'El Rey Viejo', boss: true, modifierId: 'none' });
  });
});

describe('recompensas temporales', () => {
  it('ofrece tres cartas estables por seed+piso', () => {
    const a = rewardOptionsForFloor('seed', 3);
    const b = rewardOptionsForFloor('seed', 3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((perk) => perk.id)).size).toBe(3);
  });

  it('todos los perks ofrecibles existen', () => {
    const ids = new Set(ROGUELIKE_PERKS.map((perk) => perk.id));
    for (let floor = 1; floor <= 9; floor += 1) {
      for (const perk of rewardOptionsForFloor('catalogo', floor)) expect(ids.has(perk.id)).toBe(true);
    }
  });

  it('los bonus viven en campos temporales y statsFor los usa', () => {
    const chess = new Chess();
    const registry = createInitialRegistry(chess);
    const boosted = applyRunPerksToRegistry(registry, ['steel_pulse', 'silk_shoes'], 'w');
    const pawn = boosted.e2;
    expect(pawn.runStrengthBonus).toBeCloseTo(0.75);
    expect(pawn.runSpeedBonus).toBe(2);
    expect(statsFor(pawn).strength).toBeGreaterThan(statsFor(registry.e2).strength);
    expect(statsFor(pawn).speed).toBeGreaterThan(statsFor(registry.e2).speed);
    expect(boosted.e7.runStrengthBonus).toBeUndefined(); // CPU no hereda tus perks
  });
});

describe('máquina de estados del intento', () => {
  it('arranca sin intento en curso', () => {
    expect(loadRun()).toEqual({ floor: 1, inRun: false, phase: 'idle', seed: null, mode: 'tower', perks: [], rewardChosenForFloor: null });
  });

  it('startNewRun fija piso, seed y torre', () => {
    expect(startNewRun('seed-controlada')).toMatchObject({ inRun: true, floor: 1, phase: 'battle', seed: 'seed-controlada', mode: 'tower', perks: [] });
  });

  it('no permite battle -> cleared sin haber empezado', () => {
    const run = startNewRun('sin-atajos');
    expect(markFloorCleared(run)).toEqual(run);
  });

  it('fighting -> cleared exige elegir recompensa antes de subir', () => {
    let run = startNewRun('reward-gate');
    run = markBattleStarted(run);
    run = markFloorCleared(run);
    expect(run.phase).toBe('cleared');
    expect(advanceFloor(run)).toEqual(run);
    const option = rewardOptionsForFloor(run.seed, run.floor)[0];
    run = chooseRunReward(run, option.id);
    expect(run.rewardChosenForFloor).toBe(1);
    run = advanceFloor(run);
    expect(run).toMatchObject({ floor: 2, phase: 'battle' });
    expect(run.perks).toContain(option.id);
  });

  it('no permite cobrar dos recompensas por el mismo piso', () => {
    let run = startNewRun('una-sola');
    run = markBattleStarted(run);
    run = markFloorCleared(run);
    const [a, b] = rewardOptionsForFloor(run.seed, run.floor);
    run = chooseRunReward(run, a.id);
    const again = chooseRunReward(run, b.id);
    expect(again.perks).toEqual([a.id]);
  });

  it('completar piso 10 desbloquea infinito sin exigir una carta post-boss', () => {
    let run = startNewRun('boss');
    // Simulamos llegar al 10 respetando el gate de recompensa.
    for (let floor = 1; floor < ROGUELIKE_TOWER_FLOORS; floor += 1) {
      run = markBattleStarted(run);
      run = markFloorCleared(run);
      const perk = rewardOptionsForFloor(run.seed, run.floor)[0];
      run = chooseRunReward(run, perk.id);
      run = advanceFloor(run);
    }
    expect(run.floor).toBe(10);
    run = markBattleStarted(run);
    run = completeTower(run);
    expect(run.phase).toBe('completed');
    expect(loadTowerCompleted()).toBe(true);
    run = continueIntoEndless(run);
    expect(run).toMatchObject({ mode: 'endless', floor: 11, phase: 'battle' });
  });

  it('endRun conserva la mejor marca y limpia el intento activo', () => {
    let run = startNewRun('best');
    run = { ...run, floor: 6 };
    const reached = endRun(run);
    expect(reached).toBe(6);
    expect(loadBestFloor()).toBe(6);
    expect(loadRun().inRun).toBe(false);
  });

  it('resetRoguelikeRun borra intento, marca y desbloqueo', () => {
    localStorage.setItem('chess-study-roguelike-tower-completed', '1');
    let run = startNewRun('reset');
    run = { ...run, floor: 3 };
    endRun(run);
    resetRoguelikeRun();
    expect(loadBestFloor()).toBe(0);
    expect(loadTowerCompleted()).toBe(false);
    expect(loadRun().inRun).toBe(false);
  });
});

describe('Rey Boss: HP sólo en el jefe', () => {
  it('empieza con 5 HP y vive en el piso 10', () => {
    expect(ROGUELIKE_BOSS_FLOOR).toBe(10);
    expect(ROGUELIKE_BOSS.maxHp).toBe(5);
  });

  it('un jaque humano hace 1 daño', () => {
    const chess = new Chess('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1');
    expect(chess.inCheck()).toBe(true);
    expect(chess.isCheckmate()).toBe(false);
    expect(bossDamageAfterHumanMove(chess, 'w')).toBe(1);
  });

  it('un mate humano hace 2 daño', () => {
    const chess = new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    expect(chess.isCheckmate()).toBe(true);
    expect(bossDamageAfterHumanMove(chess, 'w')).toBe(2);
  });

  it('un boss de campaña puede cambiar el daño de mate sin tocar el boss clásico', () => {
    const chess = new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    expect(bossDamageAfterHumanMove(chess, 'w', { checkDamage: 1, mateDamage: 3 })).toBe(3);
    expect(bossDamageAfterHumanMove(chess, 'w')).toBe(2);
  });

  it('el Rey de Hierro bloquea jaques normales mientras conserva una torre', () => {
    const guarded = new Chess('r3k3/8/8/8/8/8/4R3/4K3 b - - 0 1');
    expect(guarded.inCheck()).toBe(true);
    expect(guarded.isCheckmate()).toBe(false);
    expect(bossDamageAfterHumanMove(guarded, 'w', { checkDamage: 1, mateDamage: 2, rookShield: true })).toBe(0);

    const exposed = new Chess('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1');
    expect(bossDamageAfterHumanMove(exposed, 'w', { checkDamage: 1, mateDamage: 2, rookShield: true })).toBe(1);
  });

  it('el Rey Sombra puede ser frágil a cualquier jaque sin cambiar las reglas del boss clásico', () => {
    const chess = new Chess('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1');
    expect(bossDamageAfterHumanMove(chess, 'w', { checkDamage: 2, mateDamage: 2 })).toBe(2);
    expect(bossDamageAfterHumanMove(chess, 'w')).toBe(1);
  });

  it('un jaque contra el humano NO daña al boss', () => {
    const chess = new Chess('4k3/4r3/8/8/8/8/8/4K3 w - - 0 1');
    expect(chess.inCheck()).toBe(true);
    expect(bossDamageAfterHumanMove(chess, 'w')).toBe(0);
  });

  it('las fases cambian en 5-4 / 3-2 / 1 HP', () => {
    expect(bossPhaseForHp(5, 5)).toBe(1);
    expect(bossPhaseForHp(4, 5)).toBe(1);
    expect(bossPhaseForHp(3, 5)).toBe(2);
    expect(bossPhaseForHp(2, 5)).toBe(2);
    expect(bossPhaseForHp(1, 5)).toBe(3);
  });
});

describe('dificultad de la Torre', () => {
  it('sube de 24 a 60 en los diez pisos', () => {
    expect(difficultyForFloor(1)).toBe(24);
    expect(difficultyForFloor(5)).toBe(40);
    expect(difficultyForFloor(10)).toBe(60);
  });

  it('infinito sigue escalando pero no supera 95', () => {
    expect(difficultyForFloor(11)).toBe(63);
    expect(difficultyForFloor(100)).toBe(95);
  });
});
