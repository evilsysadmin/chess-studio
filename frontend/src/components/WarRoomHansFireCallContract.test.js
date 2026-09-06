import { describe, expect, it } from 'vitest';
import {
  fireCallPhase,
  HANS_FIRE_REPLY_LINE,
  MATTHIAS_FIRE_CALL_LINE,
  MATTHIAS_FIRE_CALL_MS,
  projectHansFireReplyAnchor,
} from './WarRoomHansFireCallContract.js';

describe('War Room Hans fire call contract', () => {
  it('usa el intercambio exacto y pone a Matthias primero', () => {
    expect(MATTHIAS_FIRE_CALL_LINE).toBe('HANS! El fuego, bitte.');
    expect(HANS_FIRE_REPLY_LINE).toBe('Sí, señor.');
    expect(fireCallPhase(0, false)).toBe('matthias');
    expect(fireCallPhase(MATTHIAS_FIRE_CALL_MS - 1, true)).toBe('matthias');
    expect(fireCallPhase(MATTHIAS_FIRE_CALL_MS + 1, false)).toBe('await-hans');
    expect(fireCallPhase(MATTHIAS_FIRE_CALL_MS + 1, true)).toBe('hans');
  });

  it('ancla la respuesta de Hans a su posición proyectada y sesga la cola al entrar por un lateral', () => {
    const right = projectHansFireReplyAnchor({ ndcX: 0.82, ndcY: 0.1 });
    const left = projectHansFireReplyAnchor({ ndcX: -0.82, ndcY: 0.1 });
    const center = projectHansFireReplyAnchor({ ndcX: 0, ndcY: 0.1 });

    expect(right.left).toBeGreaterThan(80);
    expect(right.tailPercent).toBe(82);
    expect(left.left).toBeLessThan(20);
    expect(left.tailPercent).toBe(18);
    expect(center.tailPercent).toBe(50);
    expect(projectHansFireReplyAnchor({ ndcX: 'wat', ndcY: 0 })).toBeNull();
  });
});
