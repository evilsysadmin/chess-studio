import { describe, expect, it } from 'vitest';
import {
  buildSchoolTeachingLayers,
  schoolTeachingHintMove,
  schoolTeachingSquareClass,
} from './SchoolTeachingLayers.js';

describe('School teaching visual layers', () => {
  it('turns a guided move into focus + move cue', () => {
    const layers = buildSchoolTeachingLayers({ guideMove: { from: 'e2', to: 'e4' } });
    expect(layers.focusSquares).toEqual(['e2']);
    expect(layers.moveCue).toEqual({ from: 'e2', to: 'e4' });
    expect(schoolTeachingHintMove(layers)).toEqual({ from: 'e2', to: 'e4' });
    expect(schoolTeachingSquareClass(layers, 'e2')).toContain('classroom-focus');
  });

  it('supports danger without leaking invalid squares or duplicates', () => {
    const layers = buildSchoolTeachingLayers({ dangerSquares: ['f3', 'F3', 'x9', null] });
    expect(layers.dangerSquares).toEqual(['f3']);
    expect(schoolTeachingSquareClass(layers, 'f3')).toBe('classroom-danger');
  });

  it('keeps an origin-only cue when Matthias has not revealed the destination', () => {
    const layers = buildSchoolTeachingLayers({ guideMove: { from: 'g1' } });
    expect(layers.moveCue).toBeNull();
    expect(schoolTeachingHintMove(layers)).toEqual({ from: 'g1' });
  });
});
