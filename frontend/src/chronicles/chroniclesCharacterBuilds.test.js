import { describe, expect, it } from 'vitest';
import { CHRONICLES_PARTY } from '../chroniclesOfMatthias.js';
import {
  CHRONICLES_CANONICAL_CHARACTERS,
  CHRONICLES_CHARACTER_BUILD_VERSION,
  chroniclesRollCharacterStats,
  createCanonicalChroniclesCharacterBuild,
  createSeededChroniclesCharacterBuild,
  normalizeChroniclesCharacterBuild,
  resolveChroniclesCharacterParty,
  validateChroniclesCharacterBuild,
} from './chroniclesCharacterBuilds.js';
import { chroniclesMM3ClassAllowed } from './chroniclesMM3Rules.js';

const STATS = { might: 15, intellect: 10, personality: 11, endurance: 13, speed: 12, accuracy: 13, luck: 10 };

function customBuild(patch = {}) {
  const canonical = createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY);
  return {
    ...canonical,
    mode: 'custom',
    characters: canonical.characters.map((character) => ({ ...character, ...(patch[character.slotId] || {}) })),
  };
}

describe('Chronicles character builds · MM3 company', () => {
  it('ships a canonical Caballero, Paladín, Clérigo and Arquero that meet their minimums', () => {
    const canonical = createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY);
    expect(canonical.version).toBe(CHRONICLES_CHARACTER_BUILD_VERSION);
    expect(canonical.characters.map((character) => character.classId)).toEqual(['knight', 'paladin', 'cleric', 'archer']);
    for (const [slotId, { classId, stats }] of Object.entries(CHRONICLES_CANONICAL_CHARACTERS)) {
      expect(chroniclesMM3ClassAllowed(classId, stats), slotId).toBe(true);
    }
    expect(validateChroniclesCharacterBuild(canonical).valid).toBe(true);
  });

  it('rolls reproducible 3-18 stats that always qualify for the chosen class', () => {
    const a = createSeededChroniclesCharacterBuild('vault-7', CHRONICLES_PARTY);
    const b = createSeededChroniclesCharacterBuild('vault-7', CHRONICLES_PARTY);
    expect(a).toEqual(b);
    a.characters.forEach((character) => {
      Object.values(character.stats).forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(3);
        expect(value).toBeLessThanOrEqual(18);
      });
      expect(chroniclesMM3ClassAllowed(character.classId, character.stats)).toBe(true);
    });
    expect(validateChroniclesCharacterBuild(a).valid).toBe(true);

    // A reroll keeps the preferred class when the new dice still allow it.
    const always18 = () => 0.999;
    expect(chroniclesRollCharacterStats(always18, 'druid').classId).toBe('druid');
  });

  it('refuses classes the dice do not allow, unknown classes, bad stats and duplicate names', () => {
    expect(validateChroniclesCharacterBuild(customBuild({
      matthias: { classId: 'knight', stats: { ...STATS, might: 14 } },
    })).errors.join(' ')).toMatch(/requisitos/);
    expect(validateChroniclesCharacterBuild(customBuild({
      matthias: { classId: 'necromancer', stats: STATS },
    })).valid).toBe(false);
    expect(validateChroniclesCharacterBuild(customBuild({
      matthias: { stats: { ...STATS, might: 25 } },
    })).valid).toBe(false);
    expect(validateChroniclesCharacterBuild(customBuild({
      rook: { name: 'matthias' },
    })).errors.join(' ')).toMatch(/duplicado/);
  });

  it('drops v1 point-buy builds and corrupt data to the canonical company', () => {
    const v1 = {
      version: 1,
      mode: 'custom',
      characters: [{ slotId: 'matthias', classId: 'matthias', name: 'Greta', attributes: { power: 2 } }],
    };
    expect(normalizeChroniclesCharacterBuild(v1, CHRONICLES_PARTY).mode).toBe('canonical');
    const corrupt = normalizeChroniclesCharacterBuild(customBuild({
      matthias: { name: 'Greta', stats: { might: 'x' } },
      rook: { classId: 'knight' },
    }), CHRONICLES_PARTY);
    // Bad stats fall back to the canonical sheet, keeping the chosen name;
    // an impossible class falls to the first class the stats allow.
    expect(corrupt.characters[0]).toMatchObject({ name: 'Greta', classId: 'knight' });
    expect(corrupt.characters[1].classId).toBe('paladin');
  });

  it('applies the MM3 sheet only when the first-person rules ask for it', () => {
    const build = customBuild({ bishop: { classId: 'sorcerer', stats: { ...STATS, intellect: 16, endurance: 9 } } });
    const tactics = resolveChroniclesCharacterParty(CHRONICLES_PARTY, build);
    const firstPerson = resolveChroniclesCharacterParty(CHRONICLES_PARTY, build, { rules: 'mm3' });
    const tacticsAziz = tactics.find((member) => member.id === 'bishop');
    const aziz = firstPerson.find((member) => member.id === 'bishop');
    expect(tacticsAziz.maxHp).toBe(6);
    expect(tacticsAziz.mm3).toBeUndefined();
    expect(aziz.maxHp).toBe(3);
    expect(aziz.mm3).toMatchObject({ classId: 'sorcerer', classLabel: 'Hechicero' });
    expect(aziz.characterBuild.creatorModifiers.attackDamageBonus).toBe(0);
  });
});
