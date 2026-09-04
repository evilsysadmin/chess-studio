import { describe, expect, it } from 'vitest';
import { trailSpriteScale } from './pawnTrailblazerSpriteLayout.js';

describe('Pawn Trailblazer sprite layout', () => {
  it('preserva un sprite vertical usando toda la altura disponible', () => {
    expect(trailSpriteScale({ imageWidth: 600, imageHeight: 1000, targetHeight: 2, maxWidth: 1.5 }))
      .toEqual({ width: 1.2, height: 2 });
  });

  it('preserva un sprite ancho limitándolo por la anchura máxima', () => {
    const fitted = trailSpriteScale({ imageWidth: 1600, imageHeight: 900, targetHeight: 1.65, maxWidth: 1.25 });
    expect(fitted.width).toBeCloseTo(1.25, 6);
    expect(fitted.height).toBeCloseTo(0.703125, 6);
  });

  it('degrada a la caja objetivo si las dimensiones de imagen aún no son válidas', () => {
    expect(trailSpriteScale({ imageWidth: 0, imageHeight: 0, targetHeight: 1.65, maxWidth: 1.25 }))
      .toEqual({ width: 1.25, height: 1.65 });
  });
});
