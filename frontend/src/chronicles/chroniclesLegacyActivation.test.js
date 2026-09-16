import { describe, expect, it } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { createChroniclesState, chroniclesEnemyIsActive } from '../chroniclesOfMatthias.js';

describe('Chronicles authored activation requirements', () => {
  it('uses activationWhen without semantic activation aliases', () => {
    const crypt = chroniclesMapById('crypt-eight-squares');
    const pawn = crypt.enemies.find((enemy) => enemy.id === 'corrupted-pawn');
    const jailer = crypt.enemies.find((enemy) => enemy.id === 'gate-jailer');
    const bishop = crypt.enemies.find((enemy) => enemy.id === 'spectral-bishop');
    const scavenger = crypt.enemies.find((enemy) => enemy.id === 'scavenger-knight');

    expect(pawn.activation).toBe('always');
    expect(jailer.activation).toBeUndefined();
    expect(bishop.activation).toBeUndefined();
    expect(scavenger.activation).toBeUndefined();

    const initial = createChroniclesState();
    expect(chroniclesEnemyIsActive(initial, jailer)).toBe(false);
    expect(chroniclesEnemyIsActive(initial, bishop)).toBe(false);
    expect(chroniclesEnemyIsActive(initial, scavenger)).toBe(false);

    const awakened = { ...initial, sigilAwake: true };
    expect(chroniclesEnemyIsActive(awakened, jailer)).toBe(true);
    expect(chroniclesEnemyIsActive(awakened, bishop)).toBe(true);
    expect(chroniclesEnemyIsActive(awakened, scavenger)).toBe(false);

    const jailerDown = { ...awakened, jailerHp: 0 };
    expect(chroniclesEnemyIsActive(jailerDown, scavenger)).toBe(true);
  });
});
