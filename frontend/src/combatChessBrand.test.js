import { describe, expect, it } from 'vitest';
import {
  COMBAT_CHESS_GENRE,
  COMBAT_CHESS_NAME,
  COMBAT_CHESS_TAGLINE,
  combatRecordModeLabel,
} from './combatChessBrand.js';

describe('identidad visible de Combat Chess', () => {
  it('mantiene Combat Chess como nombre y roguelike como descriptor', () => {
    expect(COMBAT_CHESS_NAME).toBe('Combat Chess');
    expect(COMBAT_CHESS_GENRE.toLowerCase()).toContain('roguelike');
    expect(COMBAT_CHESS_TAGLINE).toContain('Rompe las reglas');
  });

  it('distingue La Torre del combate libre en el historial', () => {
    expect(combatRecordModeLabel({ log: [], variant: 'roguelike' })).toBe('Combat Chess');
    expect(combatRecordModeLabel({ log: [], variant: 'combat' })).toBe('Combate');
    expect(combatRecordModeLabel({ moves: [] })).toBeNull();
  });
});
