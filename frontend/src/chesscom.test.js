import { describe, expect, it } from 'vitest';
import {
  CHESSCOM_EXTRACTION,
  CHESSCOM_FIRE_MODES,
  CHESSCOM_INTEL,
  chesscomCanShoot,
  chesscomCreateState,
  chesscomEndTurn,
  chesscomEngageEnemy,
  chesscomFireModesFor,
  chesscomInteract,
  chesscomMissionStatus,
  chesscomMove,
  chesscomReachable,
  chesscomSetFireMode,
  chesscomSetOverwatch,
  chesscomShoot,
} from './chesscom.js';

describe('Chesscom tactical POC', () => {
  it('starts as a deniable three-operator mission with real deployment cost', () => {
    const state = chesscomCreateState();
    expect(state.friendlies.map((unit) => unit.id)).toEqual(['matthias','dieter','sven']);
    expect(state.deploymentCost).toBeGreaterThan(0);
    expect(state.credits).toBeGreaterThan(state.deploymentCost);
    expect(chesscomMissionStatus(state)).toBe('active');
  });

  it('declares fire modes per weapon instead of exposing imaginary selectors', () => {
    const state = chesscomCreateState();
    const matthias = state.friendlies.find((unit) => unit.id === 'matthias');
    const sven = state.friendlies.find((unit) => unit.id === 'sven');
    expect(chesscomFireModesFor(matthias).map((mode) => mode.id)).toEqual(['sa','burst','auto']);
    expect(chesscomFireModesFor(sven).map((mode) => mode.id)).toEqual(['sa','auto']);
    expect(CHESSCOM_FIRE_MODES.da.label).toBe('DA');
    expect(chesscomSetFireMode(state,'sven','burst')).toBe(state);
    expect(chesscomSetFireMode(state,'sven','auto').friendlies.find((unit) => unit.id === 'sven').fireMode).toBe('auto');
  });

  it('spends AP on movement and never exposes blocked squares as reachable', () => {
    const state = chesscomCreateState();
    const matthias = state.friendlies[0];
    const reachable = chesscomReachable(state, matthias);
    expect(reachable.length).toBeGreaterThan(0);
    const target = reachable.find((tile) => tile.cost === 1);
    const moved = chesscomMove(state, matthias.id, target.x, target.y);
    expect(moved.friendlies[0].ap).toBe(matthias.ap - 1);
    expect([moved.friendlies[0].x,moved.friendlies[0].y]).toEqual([target.x,target.y]);
  });

  it('shooting SA spends two AP and one round and can complete the primary target objective', () => {
    const state = chesscomCreateState();
    const close = {
      ...state,
      friendlies: state.friendlies.map((unit) => unit.id === 'matthias' ? { ...unit, x:6, y:1, damage:6 } : unit),
    };
    expect(chesscomCanShoot(close,'matthias','target')).toBe(true);
    const shot = chesscomShoot(close,'matthias','target');
    const matthias = shot.friendlies.find((unit) => unit.id === 'matthias');
    expect(matthias.ap).toBe(2);
    expect(matthias.ammo).toBe(29);
    expect(shot.objectives.target).toBe(true);
  });

  it('uses the selected burst profile for AP, ammunition and damage', () => {
    const state = chesscomCreateState();
    const close = {
      ...state,
      friendlies: state.friendlies.map((unit) => unit.id === 'matthias' ? { ...unit, x:6, y:1 } : unit),
    };
    const armed = chesscomSetFireMode(close,'matthias','burst');
    const shot = chesscomShoot(armed,'matthias','target');
    const matthias = shot.friendlies.find((unit) => unit.id === 'matthias');
    const target = shot.enemies.find((unit) => unit.id === 'target');
    expect(matthias.ap).toBe(1);
    expect(matthias.ammo).toBe(27);
    expect(target.hp).toBeLessThan(close.enemies.find((unit) => unit.id === 'target').hp);
    expect(shot.log[0]).toContain('Ráfaga');
    expect(shot.log[0]).toContain('3 cartuchos');
  });

  it('first enemy click arms Shoot without spending ammo and second click fires', () => {
    const state = chesscomCreateState();
    const close = {
      ...state,
      friendlies: state.friendlies.map((unit) => unit.id === 'matthias' ? { ...unit, x:6, y:1 } : unit),
    };
    const armed = chesscomEngageEnemy(close,'matthias','target');
    expect(armed.action).toBe('shoot');
    expect(armed.targetId).toBe('target');
    expect(armed.friendlies.find((unit) => unit.id === 'matthias').ammo).toBe(30);
    expect(armed.enemies.find((unit) => unit.id === 'target').hp).toBe(6);
    const fired = chesscomEngageEnemy(armed,'matthias','target');
    expect(fired.friendlies.find((unit) => unit.id === 'matthias').ammo).toBe(29);
    expect(fired.enemies.find((unit) => unit.id === 'target').hp).toBeLessThan(6);
  });

  it('retrieves intel only when an operator is adjacent and has AP', () => {
    const state = chesscomCreateState();
    const adjacent = {
      ...state,
      friendlies:state.friendlies.map((unit) => unit.id === 'matthias' ? { ...unit, x:CHESSCOM_INTEL.x-1, y:CHESSCOM_INTEL.y } : unit),
    };
    const result = chesscomInteract(adjacent,'matthias');
    expect(result.objectives.intel).toBe(true);
    expect(result.friendlies.find((unit) => unit.id === 'matthias').ap).toBe(3);
  });

  it('overwatch costs AP and enemy turn restores player AP afterwards', () => {
    const state = chesscomCreateState();
    const watch = chesscomSetOverwatch(state,'matthias');
    expect(watch.friendlies[0].overwatch).toBe(true);
    expect(watch.friendlies[0].ap).toBe(2);
    const next = chesscomEndTurn(watch);
    expect(next.turn).toBe(2);
    expect(next.friendlies[0].ap).toBe(next.friendlies[0].maxAp);
    expect(next.friendlies[0].overwatch).toBe(false);
  });

  it('completes only after target, intel and extraction are all true', () => {
    const state = chesscomCreateState();
    expect(chesscomMissionStatus({ ...state, objectives:{ target:true, intel:true, extraction:false } })).toBe('active');
    expect(chesscomMissionStatus({ ...state, objectives:{ target:true, intel:true, extraction:true } })).toBe('complete');
    expect(CHESSCOM_EXTRACTION).toEqual({ x:1, y:7 });
  });
});
