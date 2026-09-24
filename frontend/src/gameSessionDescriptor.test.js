import { describe, expect, it } from 'vitest';
import { buildGameSessionDescriptor, GAME_SESSION_KIND } from './gameSessionDescriptor.js';

describe('GameSessionDescriptor', () => {
  it('conserva las políticas de casual y práctica', () => {
    expect(buildGameSessionDescriptor()).toMatchObject({ kind: GAME_SESSION_KIND.STANDARD, hintMode: 'off', ratingPreviewEnabled: true, shareMode: 'casual', crimeMode: 'casual' });
    expect(buildGameSessionDescriptor({ learningMode: true })).toMatchObject({ hintMode: 'free', ratingPreviewEnabled: false, shareMode: 'practice', crimeMode: 'practice' });
  });

  it('mantiene modos especiales fuera del rating competitivo', () => {
    expect(buildGameSessionDescriptor({ gameContext: { rescue: true } })).toMatchObject({ crimeMode: 'rescue', ratingPreviewEnabled: false });
    expect(buildGameSessionDescriptor({ gameContext: { lab: true } })).toMatchObject({ crimeMode: 'lab', ratingPreviewEnabled: false });
    expect(buildGameSessionDescriptor({ gameContext: { suddenDeath: true } })).toMatchObject({ crimeMode: 'casual', ratingPreviewEnabled: false });
  });

  it('encapsula torneo sin arrastrar contexto estándar', () => {
    expect(buildGameSessionDescriptor({ kind: GAME_SESSION_KIND.TOURNAMENT, tournamentLevel: 4, points: 85, gameContext: { lab: true }, timeControl: { initial: 60 }, seriesState: { id: 'x' } })).toEqual(expect.objectContaining({
      hintMode: 'paid', ratingPreviewEnabled: true, shareMode: 'tournament', crimeMode: 'tournament',
      timeControl: null, seriesState: null, memoryContext: {}, tournamentLevel: 4, points: 85,
    }));
  });
});
