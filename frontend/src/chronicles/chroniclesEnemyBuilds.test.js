import { describe, expect, it } from 'vitest';
import { chroniclesMapById, chroniclesMapInitialEnemyState, chroniclesValidateMapDefinition } from './chroniclesMapCatalog.js';
import {
  chroniclesEnemyBuildModifiers,
  createDefaultChroniclesEnemyBuild,
  validateChroniclesEnemyBuild,
} from './chroniclesEnemyBuilds.js';

describe('Chronicles EnemyBuild v1', () => {
  it('keeps an implicit build mechanically neutral', () => {
    const build = createDefaultChroniclesEnemyBuild('fixture');
    expect(build).toEqual(expect.objectContaining({
      version: 1,
      archetype: 'fixture',
      level: 1,
      skills: [],
    }));
    expect(chroniclesEnemyBuildModifiers(build)).toEqual({
      bonusMaxHp: 0,
      damageBonus: 0,
      reachBonus: 0,
      engageRangeBonus: 0,
    });
  });

  it('turns attributes and skills into bounded mechanical modifiers', () => {
    const modifiers = chroniclesEnemyBuildModifiers({
      version: 1,
      archetype: 'warden',
      level: 3,
      attributes: { vigor: 2, power: 2, precision: 2, will: 2 },
      skills: ['brutal-strike', 'hunter-instinct'],
    });
    expect(modifiers).toEqual({
      bonusMaxHp: 2,
      damageBonus: 2,
      reachBonus: 1,
      engageRangeBonus: 2,
    });
  });

  it('rejects unknown skills and stats beyond the contract caps', () => {
    const result = validateChroniclesEnemyBuild({
      version: 1,
      level: 99,
      attributes: { vigor: 8, luck: 2 },
      skills: ['summon-the-moon'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Nivel enemigo fuera de rango',
      'Atributo enemigo fuera de rango: vigor',
      'Atributo enemigo desconocido: luck',
      'Skill enemiga desconocida: summon-the-moon',
    ]));
  });

  it('re-expresses the first authored encounter as EnemyBuilds without changing its effective balance', () => {
    const crypt = chroniclesMapById('crypt-eight-squares');
    const byId = Object.fromEntries(crypt.enemies.map((enemy) => [enemy.id, enemy]));

    expect(byId['corrupted-pawn']).toEqual(expect.objectContaining({
      maxHp: 6,
      retaliation: 1,
      baseStats: expect.objectContaining({ maxHp: 5, retaliation: 0 }),
    }));
    expect(byId['corrupted-pawn'].enemyBuild.skills).toContain('brutal-strike');

    expect(byId['gate-jailer'].maxHp).toBe(8);
    expect(byId['gate-jailer'].retaliation).toBe(2);
    expect(byId['gate-jailer'].ai.engageRange).toBe(2);

    expect(byId['spectral-bishop'].maxHp).toBe(5);
    expect(byId['spectral-bishop'].ai.attackReach).toBe(2);
    expect(byId['spectral-bishop'].enemyBuild.skills).toContain('spectral-geometry');

    expect(byId['scavenger-knight'].maxHp).toBe(6);
    expect(byId['scavenger-knight'].retaliation).toBe(1);
    expect(byId['scavenger-knight'].ai.engageRange).toBe(4);

    expect(chroniclesMapInitialEnemyState('crypt-eight-squares')).toEqual(expect.objectContaining({
      enemyHp: 6,
      jailerHp: 8,
      spectralBishopHp: 5,
      scavengerHp: 6,
    }));
  });

  it('fails map validation closed when an authored EnemyBuild is invalid', () => {
    const crypt = chroniclesMapById('crypt-eight-squares');
    const source = {
      ...crypt,
      enemies: crypt.enemies.map((enemy, index) => index === 0
        ? { ...enemy, enemyBuild: { ...enemy.enemyBuild, skills: ['not-real'] } }
        : enemy),
    };
    expect(() => chroniclesValidateMapDefinition(source)).toThrow(/EnemyBuild/i);
  });
});
