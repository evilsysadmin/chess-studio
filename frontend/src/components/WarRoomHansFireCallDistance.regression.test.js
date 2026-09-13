import { describe, expect, it } from 'vitest';
import { shouldStartHansLeavingGrumble } from './WarRoomHansFireCallContract.js';

describe('Hans leaving grumble distance', () => {
  it('waits until Hans reaches the door leg instead of muttering beside Matthias', () => {
    expect(shouldStartHansLeavingGrumble({ phase: 'await-exit', route: 'leave-side' })).toBe(false);
    expect(shouldStartHansLeavingGrumble({ phase: 'await-exit', route: 'leave-bypass' })).toBe(false);
    expect(shouldStartHansLeavingGrumble({ phase: 'await-exit', route: 'leave-door' })).toBe(true);
  });

  it('does not replay the grumble after it has already fired', () => {
    expect(shouldStartHansLeavingGrumble({
      phase: 'await-exit',
      route: 'leave-door',
      alreadyPlayed: true,
    })).toBe(false);
  });
});
