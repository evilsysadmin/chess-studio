import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesMapById,
  chroniclesMapIds,
  chroniclesMapInitialEnemyState,
  chroniclesMapTileAt,
} from './chroniclesMapCatalog.js';

describe('Chronicles declarative map catalog', () => {
  it('loads the current crypt as a standalone data file', () => {
    const map = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);

    expect(chroniclesMapIds()).toContain('crypt-eight-squares');
    expect(map.title).toBe('Cripta de las Ocho Casillas');
    expect(map.grid).toEqual([
      '#######',
      '#..X..#',
      '#.###.#',
      '#...#.#',
      '#.#S#.#',
      '#P.E..#',
      '#######',
    ]);
    expect(chroniclesMapTileAt(map, 3, 1)).toBe('X');
    expect(chroniclesMapTileAt(map, -1, 0)).toBe('#');
  });

  it('owns enemy spawns, AI policies, interactables, treasure and trap slots', () => {
    const map = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);
    const knight = map.enemies.find((enemy) => enemy.id === 'scavenger-knight');
    const pawn = map.enemies.find((enemy) => enemy.id === 'corrupted-pawn');

    expect(pawn.ai.movement).toBe('cardinal-chase');
    expect(knight.ai.movement).toBe('knight-chase');
    expect(map.interactables.map((entry) => entry.id)).toEqual(['rune-cache-lever', 'rune-core']);
    expect(map.treasures).toEqual([
      expect.objectContaining({ id: 'rune-core', requires: 'runeCacheOpened' }),
    ]);
    expect(map.traps).toEqual([]);
  });

  it('derives initial enemy health and keyed positions from data instead of engine constants', () => {
    expect(chroniclesMapInitialEnemyState()).toEqual({
      enemyHp: 6,
      jailerHp: 8,
      spectralBishopHp: 5,
      scavengerHp: 6,
      scavengerPosition: 'gate',
    });
  });
});
