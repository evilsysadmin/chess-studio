import { describe, expect, it } from 'vitest';
import { matthiasTimeScene } from './matthiasTime.js';

describe('Matthias · escenas por hora local', () => {
  it.each([
    [0, 'night-coffee'],
    [1, 'late-sleep'],
    [5, 'late-sleep'],
    [6, 'morning-coffee'],
    [10, 'morning-coffee'],
    [11, 'lunch-bocata'],
    [14, 'lunch-bocata'],
    [15, 'afternoon-ops'],
    [19, 'afternoon-ops'],
    [20, 'night-coffee'],
    [23, 'night-coffee'],
  ])('a las %i usa %s', (hour, key) => {
    expect(matthiasTimeScene(hour).key).toBe(key);
  });

  it('normaliza horas fuera de rango sin inventar otra identidad', () => {
    expect(matthiasTimeScene(24).key).toBe('night-coffee');
    expect(matthiasTimeScene(-1).key).toBe('night-coffee');
    expect(matthiasTimeScene('basura').key).toBe('lunch-bocata');
  });
});
