import { describe, expect, it } from 'vitest';
import {
  HANS_MOP_MAX_FATIGUE_MS,
  HANS_MOP_MIN_FATIGUE_MS,
  HANS_MOP_REPLY_LINE,
  MATTHIAS_MOP_LINE,
  MATTHIAS_MOP_SIGH_LINE,
  hansMopDialoguePhase,
  hansMopFatigueMs,
  hansMopPatchMs,
  hansMopStartDelayMs,
  shouldHansMopDialogue,
  shouldStartHansMopRoutine,
} from './WarRoomHansMopContract.js';

describe('Hans mop ambient routine contract', () => {
  it('keeps fatigue between one and two minutes', () => {
    expect(hansMopFatigueMs(0)).toBe(HANS_MOP_MIN_FATIGUE_MS);
    expect(hansMopFatigueMs(0.999999)).toBeLessThanOrEqual(HANS_MOP_MAX_FATIGUE_MS);
    expect(hansMopFatigueMs(0.5)).toBeGreaterThan(HANS_MOP_MIN_FATIGUE_MS);
    expect(hansMopFatigueMs(0.5)).toBeLessThan(HANS_MOP_MAX_FATIGUE_MS);
  });

  it('uses bounded random start, patch and dialogue decisions', () => {
    expect(shouldStartHansMopRoutine(0)).toBe(true);
    expect(shouldStartHansMopRoutine(0.99)).toBe(false);
    expect(shouldHansMopDialogue(0)).toBe(true);
    expect(shouldHansMopDialogue(0.99)).toBe(false);
    expect(hansMopStartDelayMs(0)).toBeGreaterThanOrEqual(8000);
    expect(hansMopStartDelayMs(0.999999)).toBeLessThanOrEqual(18000);
    expect(hansMopPatchMs(0)).toBeGreaterThanOrEqual(6000);
    expect(hansMopPatchMs(0.999999)).toBeLessThanOrEqual(10000);
  });

  it('keeps the optional exchange ordered and readable', () => {
    expect(MATTHIAS_MOP_LINE).toBe('¿En serio, Hans? ¿Ahora?');
    expect(HANS_MOP_REPLY_LINE).toBe('Sí, señor. Se pasa el día aquí, señor. Hay que fregar.');
    expect(MATTHIAS_MOP_SIGH_LINE).toBe('(suspiro)');
    expect(hansMopDialoguePhase(0)).toBe('matthias');
    expect(hansMopDialoguePhase(4500)).toBe('hans');
    expect(hansMopDialoguePhase(10500)).toBe('sigh');
    expect(hansMopDialoguePhase(14000)).toBe('');
  });
});