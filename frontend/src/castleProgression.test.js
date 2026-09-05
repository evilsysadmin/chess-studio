import { beforeEach, describe, expect, it } from 'vitest';
import { clearProfileProgress, PROFILE_PROGRESS_KEYS } from './profileKeys.js';
import {
  CASTLE_UNLOCKS_KEY,
  castleHonourObjects,
  castleUnlockSummary,
  emptyCastleUnlockLedger,
  loadCastleUnlockLedger,
  persistCastleUnlockLedger,
  reconcileCastleUnlocks,
} from './castleProgression.js';

function ledgerRecord(id, overrides = {}) {
  return {
    id,
    version: 2,
    source: 'game-analysis',
    legacy: false,
    recordedAt: '2026-09-05T12:00:00.000Z',
    provenance: {
      gameId: 'game-42',
      mode: 'quick',
      difficulty: 80,
      occurredAt: '2026-09-05T11:59:00.000Z',
      secret: 'never-copy-this',
      ...overrides.provenance,
    },
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('castle progression ledger', () => {
  it('registers the castle ledger as profile progress so Empezar de cero clears it', () => {
    expect(PROFILE_PROGRESS_KEYS).toContain(CASTLE_UNLOCKS_KEY);
  });

  it('materializes only catalogued achievements with factual provenance', () => {
    const next = reconcileCastleUnlocks(
      emptyCastleUnlockLedger(),
      new Set(['rivalry_hard_75', 'first_game', 'invented-achievement']),
      { records: { rivalry_hard_75: ledgerRecord('rivalry_hard_75') } },
    );

    expect(Object.keys(next.records)).toEqual(['giantslayer-helm']);
    expect(next.records['giantslayer-helm']).toMatchObject({
      objectId: 'giantslayer-helm',
      earnedAt: '2026-09-05T12:00:00.000Z',
      sourceType: 'achievement',
      sourceId: 'rivalry_hard_75',
      evidence: {
        legacy: false,
        source: 'game-analysis',
        gameId: 'game-42',
        mode: 'quick',
        difficulty: 80,
        occurredAt: '2026-09-05T11:59:00.000Z',
      },
    });
    expect(JSON.stringify(next)).not.toContain('never-copy-this');
  });

  it('does not invent dates or match evidence for legacy achievements', () => {
    const next = reconcileCastleUnlocks(
      emptyCastleUnlockLedger(),
      ['rating_master'],
      { records: { rating_master: { id: 'rating_master', legacy: true, source: 'legacy', recordedAt: null, provenance: {} } } },
    );

    expect(next.records['master-crown']).toMatchObject({
      earnedAt: null,
      sourceType: 'achievement-legacy',
      sourceId: 'rating_master',
      evidence: { legacy: true, source: 'legacy' },
    });
  });

  it('is idempotent and never rewrites the first unlock evidence', () => {
    const first = reconcileCastleUnlocks(
      emptyCastleUnlockLedger(),
      ['feat_mate'],
      { records: { feat_mate: ledgerRecord('feat_mate') } },
    );
    const second = reconcileCastleUnlocks(
      first,
      ['feat_mate'],
      { records: { feat_mate: ledgerRecord('feat_mate', { recordedAt: '2030-01-01T00:00:00.000Z', provenance: { gameId: 'fake-new-game' } }) } },
    );

    expect(second).toEqual(first);
    expect(second.records['fallen-king'].evidence.gameId).toBe('game-42');
  });

  it('keeps all earned objects in history but displays only the strongest object per family', () => {
    const next = reconcileCastleUnlocks(
      emptyCastleUnlockLedger(),
      ['rating_intermediate', 'rating_advanced', 'rating_master', 'feat_mate'],
      { records: {
        rating_intermediate: ledgerRecord('rating_intermediate'),
        rating_advanced: ledgerRecord('rating_advanced'),
        rating_master: ledgerRecord('rating_master'),
        feat_mate: ledgerRecord('feat_mate'),
      } },
    );
    const displayed = castleHonourObjects(next, {
      rating_master: 'Rating Maestro acreditado.',
      feat_mate: 'Jaque mate acreditado.',
    });

    expect(castleUnlockSummary(next)).toEqual({ total: 4, recorded: 4, legacy: 0 });
    expect(displayed.map((entry) => entry.id)).toEqual(['master-crown', 'fallen-king']);
    expect(displayed[0]).toMatchObject({ rarity: 'legendary', form: 'crown', detail: 'Rating Maestro acreditado.' });
  });

  it('persists across a fresh read and is cleared with the existing profile-progress reset', () => {
    const next = reconcileCastleUnlocks(
      emptyCastleUnlockLedger(),
      ['feat_pawn_queen'],
      { records: { feat_pawn_queen: ledgerRecord('feat_pawn_queen') } },
    );

    expect(persistCastleUnlockLedger(next)).toBe(true);
    expect(loadCastleUnlockLedger().records['golden-pawn'].sourceId).toBe('feat_pawn_queen');

    clearProfileProgress();
    expect(loadCastleUnlockLedger()).toEqual(emptyCastleUnlockLedger());
  });
});
