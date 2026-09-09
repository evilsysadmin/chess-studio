import { describe, expect, it } from 'vitest';
import { warRoomHansChoreDialogueSpec } from './WarRoomHansChoreContract.js';
import { warRoomHansServiceDialogueSpec } from './WarRoomHansServiceContract.js';

describe('Hans generic service dialogue coverage', () => {
  it('keeps service and chore dialogue phases available to the shared renderer', () => {
    expect(warRoomHansServiceDialogueSpec('hans-espresso')?.speaker).toBe('HANS');
    expect(warRoomHansServiceDialogueSpec('matthias-espresso')?.speaker).toBe('MATTHIAS');
    expect(warRoomHansChoreDialogueSpec('matthias-dust-board')?.speaker).toBe('MATTHIAS');
    expect(warRoomHansChoreDialogueSpec('hans-dust-board')?.speaker).toBe('HANS');
    expect(warRoomHansChoreDialogueSpec('hans-bring-book')?.speaker).toBe('HANS');
    expect(warRoomHansChoreDialogueSpec('hans-mail')?.speaker).toBe('HANS');
  });
});
