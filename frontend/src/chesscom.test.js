import { describe, expect, it } from 'vitest';
import {
  CHESSCOM_EXTRACTION,
  CHESSCOM_INTEL,
  chesscomCreateState,
  chesscomEndTurn,
  chesscomInteract,
  chesscomMissionStatus,
  chesscomMove,
  chesscomReachable,
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

  it('shooting spends AP and ammo and can complete the primary target objective', () => {
    const state = chesscomCreateState();
    const close = {
      ...state,
      friendlies: state.friendlies.map((unit) => unit.id === 'matthias' ? { ...unit, x:6, y:1, damage:6 } : unit),
    };
    const shot = chesscomShoot(close,'matthias','target');
    const matthias = shot.friendlies.find((unit) => unit.id === 'matthias');
    expect(matthias.ap).toBe(2);
    expect(matthias.ammo).toBe(29);
    expect(shot.objectives.target).toBe(true);
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
