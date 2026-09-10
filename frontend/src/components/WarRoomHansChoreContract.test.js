import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_HANS_CHORE_EVENTS,
  warRoomHansChoreDialoguePhase,
  warRoomHansChoreDialogueSpec,
  warRoomHansChoreForEvent,
} from './WarRoomHansChoreContract.js';
import {
  HANS_INITIAL_REPLY_ENTRY_MAX_LOGICAL_X,
  hansInitialReplyPointReached,
} from './WarRoomHansFireCallContract.js';


describe('Hans ambient chore contract', () => {
  it('defines all ambient chore events with real action time and targets', () => {
    expect(WAR_ROOM_HANS_CHORE_EVENTS).toHaveLength(7);
    for (const eventName of WAR_ROOM_HANS_CHORE_EVENTS) {
      const chore = warRoomHansChoreForEvent(eventName);
      expect(chore).toBeTruthy();
      expect(chore.actionMs).toBeGreaterThan(7000);
      expect(chore.targetNames.length).toBeGreaterThan(0);
    }
  });

  it('keeps the historical armor event id but makes it a real cloth polish', () => {
    const chore = warRoomHansChoreForEvent('dust-armor');
    expect(chore?.targetNames).toEqual([
      'war-room-teutonic-armor-right',
      'war-room-teutonic-armor-left',
    ]);
    expect(chore?.prop).toBe('cloth');
    expect(chore?.pose).toBe('polish-armor');
  });

  it('keeps optional dialogue tied to real chore phases', () => {
    expect(warRoomHansChoreDialoguePhase('dust-board', 500)).toBe('matthias-dust-board');
    expect(warRoomHansChoreDialoguePhase('dust-board', 5000)).toBe('hans-dust-board');
    expect(warRoomHansChoreDialogueSpec('matthias-dust-board')?.speaker).toBe('MATTHIAS');
    expect(warRoomHansChoreDialogueSpec('hans-bring-book')?.speaker).toBe('HANS');
    expect(warRoomHansChoreDialoguePhase('dust-armor', 1000)).toBe('');
  });
});

describe('Hans initial fire reply visibility', () => {
  it('waits until Hans is physically inside the entry route and visible', () => {
    expect(hansInitialReplyPointReached({
      hansScreen: 'onscreen',
      route: 'entry',
      logicalX: HANS_INITIAL_REPLY_ENTRY_MAX_LOGICAL_X - 0.01,
    })).toBe(true);
    expect(hansInitialReplyPointReached({
      hansScreen: 'onscreen',
      route: 'entry',
      logicalX: HANS_INITIAL_REPLY_ENTRY_MAX_LOGICAL_X + 0.01,
    })).toBe(false);
    expect(hansInitialReplyPointReached({
      hansScreen: 'offscreen',
      route: 'entry',
      logicalX: HANS_INITIAL_REPLY_ENTRY_MAX_LOGICAL_X - 0.2,
    })).toBe(false);
    expect(hansInitialReplyPointReached({
      hansScreen: 'onscreen',
      route: 'leave-side',
      logicalX: 0.5,
    })).toBe(false);
  });
});