import { describe, expect, it } from 'vitest';
import { chroniclesAssertWorldReturnLinks } from './chroniclesWorldReturnLinks.js';

const exitTo = (id, mapId, requiresReturn = true) => ({
  id,
  requiresReturn,
  action: { effects: [{ type: 'transition-map', mapId }] },
});
const region = (id, exits = []) => ({ id, exits });

describe('Chronicles opt-in overworld return links', () => {
  it('accepts an explorable village / road / dungeon route when every link returns', () => {
    const village = region('village', [exitTo('east-gate', 'road')]);
    const road = region('road', [exitTo('west-gate', 'village'), exitTo('crypt-door', 'crypt')]);
    const crypt = region('crypt', [exitTo('stairs-out', 'road')]);
    expect(chroniclesAssertWorldReturnLinks([village, road, crypt])).toBe(true);
  });

  it('rejects a one-way return, even if the destination has an unrelated exit', () => {
    const village = region('village', [exitTo('east-gate', 'road')]);
    const road = region('road', [exitTo('crypt-door', 'crypt')]);
    expect(() => chroniclesAssertWorldReturnLinks([village, road])).toThrow(/no bidirectional return/);
  });

  it('rejects an absent destination and ambiguous transitions', () => {
    expect(() => chroniclesAssertWorldReturnLinks([
      region('village', [exitTo('gate', 'missing')]),
    ])).toThrow(/missing region/);
    expect(() => chroniclesAssertWorldReturnLinks([
      region('village', [{ id: 'gate', requiresReturn: true, action: { effects: [] } }]),
    ])).toThrow(/exactly one destination/);
  });

  it('preserves legacy one-way dungeon exits unless explicitly opted in', () => {
    expect(chroniclesAssertWorldReturnLinks([
      region('crypt', [exitTo('black-gate', 'gallery', false)]),
      region('gallery'),
    ])).toBe(true);
  });
});
