import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_HANS_CHORE_EVENTS,
  warRoomHansChoreDialoguePhase,
  warRoomHansChoreDialogueSpec,
  warRoomHansChoreForEvent,
} from './WarRoomHansChoreContract.js';
import {
  HANS_INITIAL_REPLY_MAX_ABS_NDC_X,
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

  it('keeps optional dialogue tied to real chore phases', () => {
    expect(warRoomHansChoreDialoguePhase('dust-board', 500)).toBe('matthias-dust-board');
    expect(warRoomHansChoreDialoguePhase('dust-board', 5000)).toBe('hans-dust-board');
    expect(warRoomHansChoreDialogueSpec('matthias-dust-board')?.speaker).toBe('MATTHIAS');
    expect(warRoomHansChoreDialogueSpec('hans-bring-book')?.speaker).toBe('HANS');
    expect(warRoomHansChoreDialoguePhase('dust-armor', 1000)).toBe('');
  });
});

describe('Hans initial fire reply visibility', () => {
  it('waits until Hans is actually inside the visible room, not grazing the edge', () => {
    expect(hansInitialReplyPointReached({ hansScreen: 'onscreen', ndcX: HANS_INITIAL_REPLY_MAX_ABS_NDC_X - 0.01 })).toBe(true);
    expect(hansInitialReplyPointReached({ hansScreen: 'onscreen', ndcX: HANS_INITIAL_REPLY_MAX_ABS_NDC_X + 0.01 })).toBe(false);
    expect(hansInitialReplyPointReached({ hansScreen: 'offscreen', ndcX: 0 })).toBe(false);
  });
});
