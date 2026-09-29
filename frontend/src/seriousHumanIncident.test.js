import { describe, expect, it } from 'vitest';
import { isSeriousHumanIncident } from './seriousHumanIncident.js';

describe('isSeriousHumanIncident', () => {
  it('reconoce los incidentes graves y descarta el resto', () => {
    expect(isSeriousHumanIncident({ event: { type: 'ALLOWED_MATE' } })).toBe(true);
    expect(isSeriousHumanIncident({ event: { type: 'KNIGHT_FORK' } })).toBe(false);
    expect(isSeriousHumanIncident(null)).toBe(false);
  });
});
