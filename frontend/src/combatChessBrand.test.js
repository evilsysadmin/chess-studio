import { describe, expect, it } from 'vitest';
import {
  COMBAT_CHESS_GENRE,
  COMBAT_CHESS_NAME,
  COMBAT_CHESS_TAGLINE,
  COMBAT_CHESS_FREE_LABEL,
  COMBAT_CHESS_CAMPAIGN_LABEL,
  combatRecordModeLabel,
} from './combatChessBrand.js';

describe('identidad visible de Combat Chess', () => {
  it('mantiene Combat Chess como paraguas y roguelike como descriptor', () => {
    expect(COMBAT_CHESS_NAME).toBe('Combat Chess');
    expect(COMBAT_CHESS_GENRE.toLowerCase()).toContain('roguelike');
    expect(COMBAT_CHESS_TAGLINE).toContain('Rompe las reglas');
    expect(COMBAT_CHESS_FREE_LABEL).toContain('Combat Chess');
    expect(COMBAT_CHESS_CAMPAIGN_LABEL).toContain('Combat Chess');
  });

  it('distingue batalla libre, campaña y torres sin crear marcas distintas', () => {
    expect(combatRecordModeLabel({ log: [], variant: 'roguelike', roguelikeMode: 'campaign' })).toBe('Combat Chess · Campaña');
    expect(combatRecordModeLabel({ log: [], variant: 'roguelike', roguelikeMode: 'tower' })).toBe('Combat Chess · Torre');
    expect(combatRecordModeLabel({ log: [], variant: 'roguelike', roguelikeMode: 'endless' })).toBe('Combat Chess · Torre infinita');
    expect(combatRecordModeLabel({ log: [], variant: 'roguelike' })).toBe('Combat Chess · Torre');
    expect(combatRecordModeLabel({ log: [], variant: 'combat' })).toBe('Combat Chess · Batalla libre');
    expect(combatRecordModeLabel({ moves: [] })).toBeNull();
  });
});
