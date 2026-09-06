import { describe, expect, it } from 'vitest';
import {
  HANS_GREETING_HANS_MS,
  HANS_GREETING_LINE,
  HANS_GREETING_TOTAL_MS,
  MATTHIAS_HANS_REPLY_LINE,
  hansGreetingPhase,
  projectHansGreetingAnchor,
} from './WarRoomHansGreetingContract.js';

describe('War Room Hans greeting contract', () => {
  it('mantiene el intercambio exacto y breve', () => {
    expect(HANS_GREETING_LINE).toBe('Buenas tardes, señor.');
    expect(MATTHIAS_HANS_REPLY_LINE).toBe('Buenas tardes, Hans.');
    expect(hansGreetingPhase(0)).toBe('hans');
    expect(hansGreetingPhase(HANS_GREETING_HANS_MS - 1)).toBe('hans');
    expect(hansGreetingPhase(HANS_GREETING_HANS_MS)).toBe('matthias');
    expect(hansGreetingPhase(HANS_GREETING_TOTAL_MS - 1)).toBe('matthias');
    expect(hansGreetingPhase(HANS_GREETING_TOTAL_MS)).toBe('');
    expect(HANS_GREETING_TOTAL_MS).toBeLessThan(4000);
  });

  it('proyecta el bocadillo desde la posición real de Hans y lo mantiene dentro de pantalla', () => {
    const centered = projectHansGreetingAnchor({ ndcX: 0, ndcY: 0.2, coarsePointer: false });
    expect(centered.left).toBeCloseTo(50, 6);
    expect(centered.top).toBeCloseTo(33.2, 6);
    expect(centered.bubbleShiftPercent).toBe(-50);
    expect(centered.tailPercent).toBe(50);

    const rightDoor = projectHansGreetingAnchor({ ndcX: 0.8, ndcY: -0.4 });
    expect(rightDoor.bubbleShiftPercent).toBe(-82);
    expect(rightDoor.tailPercent).toBe(82);

    const leftDoor = projectHansGreetingAnchor({ ndcX: -0.8, ndcY: -0.4 });
    expect(leftDoor.bubbleShiftPercent).toBe(-18);
    expect(leftDoor.tailPercent).toBe(18);

    const clamped = projectHansGreetingAnchor({ ndcX: 9, ndcY: -9, coarsePointer: true });
    expect(clamped.left).toBe(97);
    expect(clamped.top).toBe(92);
    expect(projectHansGreetingAnchor({ ndcX: 'wat', ndcY: 0 })).toBeNull();
  });
});
