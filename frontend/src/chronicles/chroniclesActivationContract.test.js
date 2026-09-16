import { describe, expect, it } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';

describe('Chronicles enemy activation contract', () => {
  it('normalizes authored activation requirements as immutable map data', () => {
    const crypt = chroniclesMapById('crypt-eight-squares');
    const jailer = crypt.enemies.find((enemy) => enemy.id === 'gate-jailer');
    const scavenger = crypt.enemies.find((enemy) => enemy.id === 'scavenger-knight');

    expect(jailer.activationWhen).toEqual([
      { key: 'sigilAwake', equals: true },
    ]);
    expect(scavenger.activationWhen).toEqual([
      { key: 'sigilAwake', equals: true },
      { key: 'jailerHp', lte: 0 },
    ]);

    expect(Object.isFrozen(jailer.activationWhen)).toBe(true);
    expect(Object.isFrozen(jailer.activationWhen[0])).toBe(true);
    expect(Object.isFrozen(scavenger.activationWhen)).toBe(true);
    expect(scavenger.activationWhen.every(Object.isFrozen)).toBe(true);
  });

  it('preserves the legacy always fallback when no authored requirement exists', () => {
    const gallery = chroniclesMapById('gallery-of-forks');
    expect(gallery.enemies.every((enemy) => enemy.activationWhen === undefined)).toBe(true);
  });
});
