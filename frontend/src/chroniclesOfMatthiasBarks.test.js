import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import { chroniclesPartyBark } from './chroniclesOfMatthiasBarks.js';

describe('chroniclesPartyBark', () => {
  it('permanece en silencio durante acciones ordinarias', () => {
    const previous = createChroniclesState();
    expect(chroniclesPartyBark(previous, { ...previous, turns: 1, x: 2 })).toBeNull();
  });

  it('da voz a Aziz cuando despierta el sello', () => {
    const previous = createChroniclesState();
    const result = chroniclesPartyBark(previous, { ...previous, sigilAwake: true, turns: 1 });
    expect(result).toMatchObject({ speakerId: 'bishop', speaker: 'Aziz', event: 'sigil-awake' });
  });

  it('reacciona a una baja enemiga sin comentar cada golpe', () => {
    const previous = createChroniclesState();
    const result = chroniclesPartyBark(previous, { ...previous, enemyHp: 0, turns: 1 });
    expect(result).toMatchObject({ speakerId: 'rook', event: 'corrupted-pawn-down' });
    expect(chroniclesPartyBark(previous, { ...previous, enemyHp: 5, turns: 1 })).toBeNull();
  });

  it('usa un superviviente cuando cae una pieza', () => {
    const previous = createChroniclesState();
    const party = previous.party.map((member) => member.id === 'matthias' ? { ...member, hp: 0 } : member);
    const result = chroniclesPartyBark(previous, { ...previous, party, turns: 1 });
    expect(result).toMatchObject({ speakerId: 'rook', event: 'down:matthias' });
  });
});
