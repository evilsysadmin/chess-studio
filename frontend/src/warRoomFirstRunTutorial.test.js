import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_TUTORIAL_PHASE,
  resolveWarRoomTutorialPhase,
  shouldRebaseWarRoomTutorialReplay,
  warRoomTutorialCopy,
} from './warRoomFirstRunTutorial.js';

describe('War Room first-run tutorial contract', () => {
  it('starts by asking for a piece selection', () => {
    expect(resolveWarRoomTutorialPhase()).toBe(WAR_ROOM_TUTORIAL_PHASE.SELECT);
  });

  it('keeps Matthias coaching when a selected piece has no legal target', () => {
    expect(resolveWarRoomTutorialPhase({ selectedSquare: 'a1', legalTargetCount: 0 }))
      .toBe(WAR_ROOM_TUTORIAL_PHASE.BLOCKED);
  });

  it('advances when Board3D exposes legal destinations', () => {
    expect(resolveWarRoomTutorialPhase({ selectedSquare: 'e2', legalTargetCount: 2 }))
      .toBe(WAR_ROOM_TUTORIAL_PHASE.MOVE);
  });

  it('finishes after the player has produced a new history entry', () => {
    expect(resolveWarRoomTutorialPhase({
      selectedSquare: '',
      legalTargetCount: 0,
      baselineHistoryLength: 1,
      historyLength: 3,
    })).toBe(WAR_ROOM_TUTORIAL_PHASE.COMPLETE);
  });

  it('does not ask to pick a piece again while the CPU answers the first move', () => {
    // The move is out, selection cleared, history not confirmed yet.
    expect(resolveWarRoomTutorialPhase({ selectedSquare: '', turn: 'cpu', historyLength: 0, baselineHistoryLength: 0 }))
      .toBe(WAR_ROOM_TUTORIAL_PHASE.COMPLETE);
    expect(resolveWarRoomTutorialPhase({ selectedSquare: '', turn: 'human' }))
      .toBe(WAR_ROOM_TUTORIAL_PHASE.SELECT);
  });

  it('rebases late server history on Help replay but never hides a move made during that replay', () => {
    const lateHistory = {
      replay: true, interacted: false, selectedSquare: '', turn: 'human',
      historyLength: 2, baselineHistoryLength: 1,
    };
    expect(shouldRebaseWarRoomTutorialReplay(lateHistory)).toBe(true);
    expect(resolveWarRoomTutorialPhase({
      ...lateHistory, baselineHistoryLength: lateHistory.historyLength,
    })).toBe(WAR_ROOM_TUTORIAL_PHASE.SELECT);

    expect(shouldRebaseWarRoomTutorialReplay({ ...lateHistory, replay: false })).toBe(false);
    expect(shouldRebaseWarRoomTutorialReplay({ ...lateHistory, turn: 'cpu' })).toBe(false);
    expect(shouldRebaseWarRoomTutorialReplay({ ...lateHistory, selectedSquare: 'e2' })).toBe(false);
    expect(shouldRebaseWarRoomTutorialReplay({ ...lateHistory, interacted: true })).toBe(false);
    expect(resolveWarRoomTutorialPhase({
      ...lateHistory, baselineHistoryLength: 1,
    })).toBe(WAR_ROOM_TUTORIAL_PHASE.COMPLETE);
  });

  it('keeps the tutorial voice in Matthias instead of generic system copy', () => {
    expect(warRoomTutorialCopy(WAR_ROOM_TUTORIAL_PHASE.SELECT)).toContain('barbaridad');
    expect(warRoomTutorialCopy(WAR_ROOM_TUTORIAL_PHASE.MOVE)).toContain('casillas iluminadas');
    expect(warRoomTutorialCopy(WAR_ROOM_TUTORIAL_PHASE.COMPLETE)).toContain('Ya sabe mover');
  });
});
