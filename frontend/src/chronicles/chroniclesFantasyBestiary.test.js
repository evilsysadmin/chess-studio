import { describe, expect, it } from 'vitest';
import {
  chroniclesMapById,
  chroniclesMapIds,
  chroniclesMapInitialEnemyState,
  chroniclesMapRenderPlan,
} from './chroniclesMapCatalog.js';

describe('Chronicles fantasy bestiary contract', () => {
  it('catalogs a room whose creatures are not chess pieces', () => {
    expect(chroniclesMapIds()).toContain('menagerie-of-ash');
    const map = chroniclesMapById('menagerie-of-ash');

    expect(map.enemies.map((enemy) => enemy.id)).toEqual([
      'ash-goblin',
      'crypt-spider',
      'ember-wisp',
      'bone-hound',
    ]);
    expect(map.enemies.map((enemy) => enemy.visualType)).toEqual([
      'ash-goblin',
      'crypt-spider',
      'ember-wisp',
      'bone-hound',
    ]);
    expect(map.enemies.map((enemy) => enemy.name)).toEqual([
      'trasgo de ceniza',
      'araña de cripta',
      'fuego fatuo',
      'sabueso de osario',
    ]);
  });

  it('mixes pursuit, authored patrol, roaming and ranged hold in one encounter', () => {
    const map = chroniclesMapById('menagerie-of-ash');
    const byId = Object.fromEntries(map.enemies.map((enemy) => [enemy.id, enemy]));

    expect(byId['ash-goblin'].ai.movement).toBe('cardinal-chase');
    expect(byId['crypt-spider'].ai.movement).toBe('patrol-route');
    expect(byId['crypt-spider'].ai.patrolRoute).toHaveLength(8);
    expect(byId['ember-wisp'].ai).toMatchObject({ movement: 'hold', attackReach: 2, requiresLineOfSight: true });
    expect(byId['bone-hound'].ai.movement).toBe('cardinal-roam');
  });

  it('derives independent health state and render roles from map data', () => {
    const map = chroniclesMapById('menagerie-of-ash');
    expect(chroniclesMapInitialEnemyState('menagerie-of-ash')).toEqual({
      ashGoblinHp: 5,
      cryptSpiderHp: 4,
      emberWispHp: 4,
      boneHoundHp: 6,
    });
    expect(chroniclesMapRenderPlan(map).enemies).toEqual([
      { id: 'ash-goblin', visualType: 'ash-goblin' },
      { id: 'crypt-spider', visualType: 'crypt-spider' },
      { id: 'ember-wisp', visualType: 'ember-wisp' },
      { id: 'bone-hound', visualType: 'bone-hound' },
    ]);
  });
});
