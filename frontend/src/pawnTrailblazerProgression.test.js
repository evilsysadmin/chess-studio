import { describe, expect, it } from 'vitest';
import {
  TRAIL_PROMOTION_BONUS,
  TRAIL_PROMOTION_DISTANCE,
  trailPromotionCrossed,
  trailSectorForDistance,
} from './pawnTrailblazer.js';

describe('Pawn Trailblazer progression', () => {
  it('expone sectores coherentes con los enemigos que se desbloquean por distancia', () => {
    expect(trailSectorForDistance(0)).toMatchObject({ key: 'infantry', code: 'I', name: 'INFANTERÍA' });
    expect(trailSectorForDistance(69.99).key).toBe('infantry');
    expect(trailSectorForDistance(70)).toMatchObject({ key: 'cavalry', code: 'II', name: 'CABALLERÍA' });
    expect(trailSectorForDistance(169.99).key).toBe('cavalry');
    expect(trailSectorForDistance(170)).toMatchObject({ key: 'crossfire', code: 'III', name: 'FUEGO CRUZADO' });
    expect(trailSectorForDistance(299.99).key).toBe('crossfire');
    expect(trailSectorForDistance(300)).toMatchObject({ key: 'hell', code: 'IV', name: 'HÖLLE' });
  });

  it('dispara la oferta de promoción una sola vez al cruzar 250 m', () => {
    expect(TRAIL_PROMOTION_DISTANCE).toBe(250);
    expect(TRAIL_PROMOTION_BONUS).toBe(750);
    expect(trailPromotionCrossed(249.9, 250, false)).toBe(true);
    expect(trailPromotionCrossed(200, 249.99, false)).toBe(false);
    expect(trailPromotionCrossed(250, 251, false)).toBe(false);
    expect(trailPromotionCrossed(249, 251, true)).toBe(false);
  });

  it('normaliza distancias inválidas sin saltar de sector ni regalar la promoción', () => {
    expect(trailSectorForDistance(-99).key).toBe('infantry');
    expect(trailSectorForDistance(Number.NaN).key).toBe('infantry');
    expect(trailPromotionCrossed(-1, 249, false)).toBe(false);
  });
});
