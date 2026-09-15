import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_TUTORIAL_PHASE,
  resolveWarRoomTutorialPhase,
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

  it('keeps the tutorial voice in Matthias instead of generic system copy', () => {
    expect(warRoomTutorialCopy(WAR_ROOM_TUTORIAL_PHASE.SELECT)).toContain('barbaridad');
    expect(warRoomTutorialCopy(WAR_ROOM_TUTORIAL_PHASE.MOVE)).toContain('casillas iluminadas');
    expect(warRoomTutorialCopy(WAR_ROOM_TUTORIAL_PHASE.COMPLETE)).toContain('Ya sabe mover');
  });
});
