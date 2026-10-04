import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_CHARACTER_BUILD_VERSION,
  CHRONICLES_CREATOR_ATTRIBUTE_BUDGET,
  chroniclesCreatorMechanicalSummary,
  createCanonicalChroniclesCharacterBuild,
  createSeededChroniclesCharacterBuild,
  normalizeChroniclesCharacterBuild,
  resolveChroniclesCharacterParty,
  validateChroniclesCharacterBuild,
} from './chroniclesCharacterBuilds.js';

const PARTY = [
  { id: 'matthias', name: 'Matthias', maxHp: 7 },
  { id: 'rook', name: 'Hildegard', maxHp: 10 },
  { id: 'bishop', name: 'Aziz', maxHp: 6 },
  { id: 'knight', name: 'Faust', maxHp: 8 },
];

function customBuild(overrides = {}) {
  return {
    version: CHRONICLES_CHARACTER_BUILD_VERSION,
    mode: 'custom',
    characters: PARTY.map((member) => ({
      slotId: member.id,
      classId: member.id,
      name: member.name,
      attributes: {},
      startingSkillId: null,
      ...(overrides[member.id] || {}),
    })),
  };
}

describe('Chronicles character builds', () => {
  it('keeps the shipped party as the exact zero-cost canonical default', () => {
    const build = createCanonicalChroniclesCharacterBuild(PARTY);

    expect(build.mode).toBe('canonical');
    expect(build.characters.map((character) => character.name)).toEqual([
      'Matthias',
      'Hildegard',
      'Aziz',
      'Faust',
    ]);
    expect(build.characters.every((character) => (
      Object.values(character.attributes).every((value) => value === 0)
      && character.startingSkillId === null
    ))).toBe(true);

    const party = resolveChroniclesCharacterParty(PARTY, build);
    expect(party.map(({ id, name, maxHp }) => ({ id, name, maxHp }))).toEqual(PARTY);
  });

  it('resolves custom names, creator attributes and a real starting skill contract', () => {
    const build = customBuild({
      matthias: {
        name: 'Greta',
        attributes: { vigor: 1, power: 2 },
        startingSkillId: 'matthias-keen-point',
      },
      bishop: {
        name: 'Nadir',
        attributes: { precision: 2, will: 1 },
        startingSkillId: 'bishop-lumen-initiate',
      },
    });

    expect(validateChroniclesCharacterBuild(build)).toEqual({ valid: true, errors: [] });

    const party = resolveChroniclesCharacterParty(PARTY, build);
    const greta = party.find((member) => member.id === 'matthias');
    const nadir = party.find((member) => member.id === 'bishop');

    expect(greta.name).toBe('Greta');
    expect(greta.characterBuild.attributes).toEqual({
      vigor: 1,
      power: 2,
      precision: 0,
      will: 0,
    });
    expect(greta.characterBuild.startingSkillModifiers).toEqual({ attackDamageBonus: 1 });
    expect(nadir.name).toBe('Nadir');
    expect(nadir.characterBuild.startingSkillModifiers).toEqual({ abilityPotencyBonus: 1 });
  });

  it('summarizes only real mechanical creator effects without inventing weaknesses', () => {
    const build = customBuild({
      matthias: {
        attributes: { vigor: 1, power: 2 },
        startingSkillId: 'matthias-keen-point',
      },
      knight: {
        attributes: { precision: 2, will: 1 },
        startingSkillId: 'knight-reserve-quiver',
      },
    });

    expect(chroniclesCreatorMechanicalSummary(build.characters[0]).map((row) => row.label)).toEqual([
      '+1 HP',
      '+2 daño básico',
      '+1 potencia de habilidad',
    ]);
    expect(chroniclesCreatorMechanicalSummary(build.characters[3]).map((row) => row.label)).toEqual([
      '+1 alcance',
      '+1 carga de habilidad',
    ]);
    expect(chroniclesCreatorMechanicalSummary(build.characters[1])).toEqual([
      { key: 'base', value: 0, label: 'Sin bonificaciones iniciales' },
    ]);
  });

  it('normalizes corrupted custom data deterministically without creating impossible stats', () => {
    const normalized = normalizeChroniclesCharacterBuild(customBuild({
      matthias: {
        name: '  Greta    von   Campo  ',
        attributes: { vigor: 99, power: 99, precision: 99, will: 99 },
        startingSkillId: 'this-does-not-exist',
      },
    }), PARTY);

    const matthias = normalized.characters.find((character) => character.slotId === 'matthias');
    expect(matthias.name).toBe('Greta von Campo');
    expect(matthias.attributes).toEqual({
      vigor: 2,
      power: 1,
      precision: 0,
      will: 0,
    });
    expect(matthias.startingSkillId).toBeNull();
  });

  it('fails closed to the canonical party for a future schema version', () => {
    const normalized = normalizeChroniclesCharacterBuild({
      ...customBuild({ matthias: { name: 'Future Matthias' } }),
      version: CHRONICLES_CHARACTER_BUILD_VERSION + 10,
    }, PARTY);

    expect(normalized.mode).toBe('canonical');
    expect(normalized.characters[0].name).toBe('Matthias');
  });

  it('creates reproducible seeded builds within the creator budget', () => {
    const first = createSeededChroniclesCharacterBuild('vault-7', PARTY);
    const repeated = createSeededChroniclesCharacterBuild('vault-7', PARTY);
    const other = createSeededChroniclesCharacterBuild('vault-8', PARTY);

    expect(repeated).toEqual(first);
    expect(other).not.toEqual(first);
    expect(first.mode).toBe('custom');
    expect(first.seed).toBe('vault-7');
    expect(validateChroniclesCharacterBuild(first)).toEqual({ valid: true, errors: [] });
    expect(first.characters.every((character) => (
      Object.values(character.attributes).reduce((sum, value) => sum + value, 0)
        === CHRONICLES_CREATOR_ATTRIBUTE_BUDGET
      && character.startingSkillId
    ))).toBe(true);
  });

  it('rejects duplicate names, foreign class ids, excess attributes and unknown skills', () => {
    const build = customBuild({
      matthias: {
        name: 'Duplicado',
        classId: 'bishop',
        attributes: { vigor: 2, power: 2 },
        startingSkillId: 'fake-skill',
      },
      rook: {
        name: 'Duplicado',
      },
    });

    const validation = validateChroniclesCharacterBuild(build);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      'Clase inválida para matthias',
      'Presupuesto de atributos excedido para matthias',
      'Skill inicial desconocida para matthias',
      'Nombre duplicado: Duplicado',
    ]));
  });
});
