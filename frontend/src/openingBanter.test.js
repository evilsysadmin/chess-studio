import { describe, expect, it, vi } from 'vitest';
import {
  buildOpeningBanterFacts,
  hasOpeningBanterMessage,
  isFreshOpeningConversation,
  localOpeningBanter,
  normalizeOpeningBanter,
  requestOpeningBanter,
} from './openingBanter.js';

function rivalry(overrides = {}) {
  return {
    record: {
      games: 8,
      wins: 3,
      draws: 1,
      losses: 4,
      currentStreak: -2,
      recentGames: [
        { outcome: 'loss', difficulty: 50, opening: 'Defensa Siciliana', moves: 42 },
        { outcome: 'win', difficulty: 50, opening: 'Defensa Siciliana', moves: 38 },
        { outcome: 'loss', difficulty: 50, opening: 'Apertura Italiana', moves: 51 },
      ],
      incidents: {
        'human:MISSED_MATE': 3,
        'cpu:KNIGHT_FORK': 2,
        'human:QUEEN_EN_PRISE_TO_PAWN': 1,
      },
      byOpening: {
        'Defensa Siciliana': { games: 5, wins: 1, draws: 1, losses: 3 },
        'Apertura Italiana': { games: 2, wins: 1, draws: 0, losses: 1 },
      },
      ...overrides,
    },
  };
}

describe('openingBanter', () => {
  it('builds a compact dossier only from grounded chess facts', () => {
    const facts = buildOpeningBanterFacts(rivalry(), {
      difficulty: 50,
      humanColor: 'w',
      rematch: true,
      token: 'DO_NOT_LEAK',
      arbitrarySecret: 'NOPE',
    });

    expect(facts.game).toEqual({ difficulty: 50, human_color: 'white', mode: 'standard', rematch: true });
    expect(facts.rivalry).toEqual({ games: 8, wins: 3, draws: 1, losses: 4, current_streak: -2 });
    expect(facts.last_game).toEqual({ outcome: 'loss', difficulty: 50, opening: 'Defensa Siciliana', half_moves: 42 });
    expect(facts.repeated_incidents).toEqual([
      { key: 'human:MISSED_MATE', count: 3 },
      { key: 'cpu:KNIGHT_FORK', count: 2 },
    ]);
    expect(facts.opening_history).toEqual([
      { name: 'Defensa Siciliana', games: 5, wins: 1, draws: 1, losses: 3 },
    ]);
    expect(facts.current_difficulty_recent).toEqual({ level: 50, games: 3, wins: 1, draws: 0, losses: 2 });
    expect(JSON.stringify(facts)).not.toContain('DO_NOT_LEAK');
    expect(JSON.stringify(facts)).not.toContain('NOPE');
  });

  it('treats a restored game as the same conversation', () => {
    expect(isFreshOpeningConversation({ resumed: 'g-1' })).toBe(false);
    expect(isFreshOpeningConversation({ resumed: true })).toBe(false);
    expect(isFreshOpeningConversation({ resumed: 'g-1', series: { currentGameId: 'g-2' } })).toBe(true);
    expect(localOpeningBanter(rivalry(), { resumed: 'g-1', difficulty: 50, humanColor: 'w' })).toBeNull();
  });

  it('keeps a factual local fallback when remote AI is unavailable', async () => {
    const request = vi.fn(async () => null);
    const text = await requestOpeningBanter({
      gameId: 'fallback-game',
      rivalry: rivalry(),
      context: { difficulty: 50, humanColor: 'w' },
      token: 'token',
      request,
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(text).toContain('2 derrotas');
  });

  it('coalesces concurrent requests for the same game', async () => {
    let resolveRemote;
    const request = vi.fn(() => new Promise((resolve) => { resolveRemote = resolve; }));
    const args = {
      gameId: 'coalesced-game',
      rivalry: rivalry(),
      context: { difficulty: 50, humanColor: 'b' },
      token: 'token',
      request,
    };

    const first = requestOpeningBanter(args);
    const second = requestOpeningBanter(args);
    expect(first).toBe(second);
    expect(request).toHaveBeenCalledTimes(0);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    resolveRemote('Achtung. Dos derrotas seguidas y vuelves al nivel 50; constancia no te falta.');
    await expect(first).resolves.toContain('Dos derrotas seguidas');
    await expect(second).resolves.toContain('Dos derrotas seguidas');
  });

  it('normalizes remote verbosity to at most two compact sentences', () => {
    expect(normalizeOpeningBanter('  Primera.   Segunda. Tercera que sobra.  ')).toBe('Primera. Segunda.');
    expect(normalizeOpeningBanter('x'.repeat(400)).length).toBeLessThanOrEqual(260);
  });

  it('recognizes an already persisted opening quip', () => {
    expect(hasOpeningBanterMessage([{ event: 'GAME_OPENING_BANTER', text: 'Hola' }])).toBe(true);
    expect(hasOpeningBanterMessage([{ event: 'KNIGHT_FORK', text: 'No' }])).toBe(false);
  });
});
