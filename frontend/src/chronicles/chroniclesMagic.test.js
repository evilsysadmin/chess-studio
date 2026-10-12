import { describe, expect, it } from 'vitest';
import { chroniclesReduce, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';
import {
  chroniclesMemberMaxSp,
  chroniclesMemberSp,
  chroniclesMemberSpells,
} from './chroniclesMagic.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';

const member = (state, id) => state.party.find((entry) => entry.id === id);

function town(gold = 0) {
  const state = createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' });
  return gold ? chroniclesApplyContentEffects(state, [{ type: 'grant-gold', amount: gold }]) : state;
}

describe('Chronicles · MM3 magic', () => {
  it('gives spell points by school and casting stat, half for hybrids, none for the knight', () => {
    const state = town();
    // Canonical company: Aziz cleric (PER 16, +2) full; Hildegard paladin (PER 13, +1) and
    // Faust archer (INT 13, +1) half; Matthias knight casts nothing.
    expect(chroniclesMemberMaxSp(state, member(state, 'bishop'))).toBe(5);
    expect(chroniclesMemberMaxSp(state, member(state, 'rook'))).toBe(2);
    expect(chroniclesMemberMaxSp(state, member(state, 'knight'))).toBe(2);
    expect(chroniclesMemberMaxSp(state, member(state, 'matthias'))).toBe(0);
    expect(chroniclesMemberSpells(state, member(state, 'matthias'))).toEqual([]);
    // Spell points grow with level.
    const veteran = { ...state, rpgModifiers: { bishop: { level: 3 } } };
    expect(chroniclesMemberMaxSp(veteran, member(veteran, 'bishop'))).toBe(15);
    // Starting books: Esoterica knows First Aid, Cosmonium knows Detect Magic.
    expect(chroniclesMemberSpells(state, member(state, 'bishop')).map((spell) => spell.id)).toEqual(['first-aid']);
    expect(chroniclesMemberSpells(state, member(state, 'knight')).map((spell) => spell.id)).toEqual(['detect-magic']);
  });

  it('heals the most wounded ally with First Aid and the inn restores spell points', () => {
    let state = town(20);
    state = { ...state, party: state.party.map((entry) => entry.id === 'rook' ? { ...entry, hp: 2 } : entry) };
    state = chroniclesReduce(state, { type: 'cast', memberId: 'bishop', spellId: 'first-aid' });
    expect(member(state, 'rook').hp).toBe(Math.min(member(state, 'rook').maxHp, 8));
    expect(chroniclesMemberSp(state, member(state, 'bishop'))).toBe(4);
    expect(state.message).toMatch(/Primeros auxilios sobre Hildegard/);
    // Nobody hurt: no spell point is spent.
    const full = { ...state, party: state.party.map((entry) => ({ ...entry, hp: entry.maxHp })) };
    expect(chroniclesMemberSp(chroniclesReduce(full, { type: 'cast', memberId: 'bishop', spellId: 'first-aid' }), member(full, 'bishop'))).toBe(4);
    // A spell the caster does not know is refused.
    const unknown = chroniclesReduce(state, { type: 'cast', memberId: 'bishop', spellId: 'flying-fist' });
    expect(unknown.message).toMatch(/no conoce/);
    // Resting at the tavern refills the book.
    const tavern = chroniclesReduce({ ...state, x: 7, y: 10 }, 'interact');
    expect(chroniclesMemberSp(tavern, member(tavern, 'bishop'))).toBe(5);
    expect(tavern.spellPoints).toBeUndefined();
  });

  it('sells membership and spells at the guild, only to casters of the matching force', () => {
    let state = { ...town(40), x: 15, y: 4 };
    state = chroniclesReduce(state, 'interact');
    expect(state.guild?.id).toBe('first-book-guild');
    // Not a member yet: no spell for sale.
    expect(chroniclesReduce(state, { type: 'guild-learn', memberId: 'bishop', spellId: 'flying-fist' })).toBe(state);
    state = chroniclesReduce(state, { type: 'guild-join' });
    expect(state.guildMemberships).toEqual({ 'first-book-guild': true });
    state = chroniclesReduce(state, { type: 'guild-learn', memberId: 'bishop', spellId: 'flying-fist' });
    expect(chroniclesMemberSpells(state, member(state, 'bishop')).map((spell) => spell.id)).toEqual(['first-aid', 'flying-fist']);
    // Cosmonium for the archer; the cleric cannot learn it, the knight learns nothing.
    state = chroniclesReduce(state, { type: 'guild-learn', memberId: 'knight', spellId: 'elemental-arrow' });
    expect(chroniclesReduce(state, { type: 'guild-learn', memberId: 'bishop', spellId: 'elemental-arrow' })).toBe(state);
    expect(chroniclesReduce(state, { type: 'guild-learn', memberId: 'matthias', spellId: 'first-aid' })).toBe(state);
    // 40 − 10 membership − 12 − 15 = 3 gold left: nothing else is affordable.
    expect(state.inventory['crown-gold'].quantity).toBe(3);
    const broke = chroniclesReduce(state, { type: 'guild-learn', memberId: 'rook', spellId: 'flying-fist' });
    expect(broke.message).toMatch(/no llega/);
    // Walking away closes the counter; the books survive a checkpoint.
    const walked = chroniclesReduce(state, 'turn-left');
    expect(walked.guild).toBeUndefined();
    const spent = { ...walked, spellPoints: { bishop: 1 } };
    const restored = chroniclesApplyRunCheckpoint(
      createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' }),
      chroniclesRunCheckpointPayload(spent, 4),
    );
    expect(chroniclesMemberSpells(restored, member(restored, 'knight')).map((spell) => spell.id))
      .toEqual(['detect-magic', 'elemental-arrow']);
    expect(chroniclesMemberSp(restored, member(restored, 'bishop'))).toBe(1);
    expect(restored.guildMemberships).toEqual({ 'first-book-guild': true });
  });

  it('casts offensive spells that never miss, at their own reach, spending spell points', () => {
    const base = createChroniclesState('banner-road-first-book', null, { rules: 'mm3' });
    // Two cells south of the deserter, facing north.
    let state = { ...base, x: 11, y: 7, direction: 0, spellbook: { bishop: ['first-aid', 'flying-fist'] } };
    const hpBefore = state.bannerRoadDeserterHp;
    state = chroniclesReduce(state, { type: 'cast', memberId: 'bishop', spellId: 'flying-fist' });
    expect(state.bannerRoadDeserterHp).toBe(Math.max(0, hpBefore - 6));
    expect(chroniclesMemberSp(state, member(state, 'bishop'))).toBe(3);
    expect(state.message).toMatch(/Puño volador/);
    // Out of spell points: refused without a turn.
    const drained = { ...state, spellPoints: { bishop: 1 } };
    const refused = chroniclesReduce(drained, { type: 'cast', memberId: 'bishop', spellId: 'flying-fist' });
    expect(refused.turns).toBe(drained.turns);
    expect(refused.message).toMatch(/puntos de hechizo/);
  });

  it('detects unopened treasure in the area', () => {
    const state = createChroniclesState('ash-vault', null, { rules: 'mm3' });
    const cast = chroniclesReduce(state, { type: 'cast', memberId: 'knight', spellId: 'detect-magic' });
    expect(cast.message).toMatch(/Queda un tesoro sin abrir/);
    expect(chroniclesMemberSp(cast, member(cast, 'knight'))).toBe(1);
  });
});
