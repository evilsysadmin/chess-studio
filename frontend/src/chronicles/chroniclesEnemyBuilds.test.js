import { describe, expect, it } from 'vitest';
import {
  chroniclesMapById,
  chroniclesMapIds,
  chroniclesMapInitialEnemyState,
  chroniclesValidateMapDefinition,
} from './chroniclesMapCatalog.js';
import {
  chroniclesEnemyBuildModifiers,
  createDefaultChroniclesEnemyBuild,
  deriveLegacyChroniclesEnemyBuild,
  validateChroniclesEnemyBuild,
} from './chroniclesEnemyBuilds.js';

describe('Chronicles EnemyBuild v1', () => {
  it('derives a reproducible RPG build for legacy enemies while preserving their effective stats', () => {
    const legacy = {
      id: 'legacy-hound',
      visualType: 'bone-hound',
      maxHp: 6,
      retaliation: 2,
      retaliationReach: 1,
      ai: { movement: 'cardinal-roam', engagedMovement: 'cardinal-chase', engageRange: 4 },
    };
    const first = deriveLegacyChroniclesEnemyBuild(legacy);
    const second = deriveLegacyChroniclesEnemyBuild(legacy);
    const modifiers = chroniclesEnemyBuildModifiers(first.build);

    expect(first).toEqual(second);
    expect(first.source).toBe('derived-legacy');
    expect(first.build.level).toBeGreaterThan(1);
    expect(first.build.skills.length).toBeGreaterThan(0);
    expect(first.baseStats.maxHp + modifiers.bonusMaxHp).toBe(legacy.maxHp);
    expect(first.baseStats.retaliation + modifiers.damageBonus).toBe(legacy.retaliation);
    expect(first.baseStats.engageRange + modifiers.engageRangeBonus).toBe(legacy.ai.engageRange);
  });

  it('gives every shipped enemy a versioned build whose base plus modifiers reconstructs its effective stats', () => {
    const enemies = chroniclesMapIds().flatMap((mapId) => chroniclesMapById(mapId).enemies);
    expect(enemies.length).toBeGreaterThan(0);

    enemies.forEach((enemy) => {
      const modifiers = chroniclesEnemyBuildModifiers(enemy.enemyBuild);
      expect(enemy.enemyBuild.version).toBe(1);
      expect(enemy.enemyBuild.level).toBeGreaterThanOrEqual(1);
      expect(['authored', 'derived-legacy']).toContain(enemy.enemyBuildSource);
      expect(enemy.baseStats.maxHp + modifiers.bonusMaxHp).toBe(enemy.maxHp);
      expect(enemy.baseStats.retaliation + modifiers.damageBonus).toBe(enemy.retaliation);
      expect(enemy.baseStats.retaliationReach + modifiers.reachBonus).toBe(enemy.retaliationReach);
      if (Number.isFinite(enemy.baseStats.engageRange)) {
        expect(enemy.baseStats.engageRange + modifiers.engageRangeBonus).toBe(enemy.ai.engageRange);
      }
    });

    const derived = enemies.filter((enemy) => enemy.enemyBuildSource === 'derived-legacy');
    expect(derived.length).toBeGreaterThan(0);
    expect(derived.some((enemy) => enemy.enemyBuild.skills.length > 0)).toBe(true);
    expect(derived.some((enemy) => Object.values(enemy.enemyBuild.attributes).some((value) => value > 0))).toBe(true);
  });

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
