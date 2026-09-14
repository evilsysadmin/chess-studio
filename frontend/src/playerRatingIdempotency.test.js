import { beforeEach, describe, expect, it } from 'vitest';
import { saveActiveGameSession } from './activeGameSession.js';
import {
  loadRating,
  loadRatingHistory,
  ratingChangeDetails,
  recordRatingHistory,
  saveRating,
} from './playerRating.js';

beforeEach(() => localStorage.clear());

describe('rating idempotency by game', () => {
  it('no aplica dos veces el ELO aunque el retry llegue con un estado React viejo', () => {
    saveActiveGameSession({ route: 'game', game: { id: 'rating-g1' } });
    const staleReactState = { rating: 800, games: 5 };

    const first = ratingChangeDetails(staleReactState, 60, 1);
    expect(first.duplicate).toBe(false);
    saveRating(first.next);
    recordRatingHistory(first.next.rating);

    const afterFirst = loadRating();
    expect(afterFirst.games).toBe(6);
    expect(afterFirst.processedGameIds).toContain('rating-g1');

    const retry = ratingChangeDetails(staleReactState, 60, 1);
    expect(retry.duplicate).toBe(true);
    expect(retry.next.rating).toBe(afterFirst.rating);
    expect(retry.next.games).toBe(afterFirst.games);

    saveRating(retry.next);
    recordRatingHistory(retry.next.rating);

    expect(loadRating()).toEqual(afterFirst);
    expect(loadRatingHistory()).toHaveLength(1);
    expect(loadRatingHistory()[0]).toMatchObject({ gameId: 'rating-g1', rating: afterFirst.rating });
  });

  it('sin sesión activa conserva el cálculo histórico y permite puntos manuales de historial', () => {
    const base = { rating: 800, games: 5 };
    const details = ratingChangeDetails(base, 60, 1);
    expect(details.duplicate).toBe(false);
    expect(details.next.games).toBe(6);
    expect(details.next.rating).toBeGreaterThan(base.rating);

    recordRatingHistory(810);
    recordRatingHistory(820);
    expect(loadRatingHistory().map((point) => point.rating)).toEqual([810, 820]);
  });
});
