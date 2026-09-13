import { describe, expect, it } from 'vitest';
import {
  CLEAN_GAME_POSITIVE_EVIDENCE_VERSION,
  cleanGameEvidence,
} from './cleanGames.js';

function row({ playedFrom, playedTo, suggestedFrom, suggestedTo, playedPromotion = null, suggestedPromotion = null }) {
  return {
    loss: 0,
    severity: 'ok',
    played: `${playedFrom}${playedTo}${playedPromotion || ''}`,
    suggested: `${suggestedFrom}${suggestedTo}${suggestedPromotion || ''}`,
    playedFrom,
    playedTo,
    playedPromotion,
    suggestedFrom,
    suggestedTo,
    suggestedPromotion,
    context: {},
  };
}

describe('clean game positive evidence', () => {
  it('persists only exact first-choice matches from comparable analyzed moves', () => {
    const rows = [
      row({ playedFrom: 'e2', playedTo: 'e4', suggestedFrom: 'e2', suggestedTo: 'e4' }),
      row({ playedFrom: 'g1', playedTo: 'f3', suggestedFrom: 'g1', suggestedTo: 'f3' }),
      row({ playedFrom: 'f1', playedTo: 'c4', suggestedFrom: 'f1', suggestedTo: 'b5' }),
      row({ playedFrom: 'd2', playedTo: 'd3', suggestedFrom: 'd2', suggestedTo: 'd4' }),
      row({ playedFrom: 'b1', playedTo: 'c3', suggestedFrom: 'b1', suggestedTo: 'c3' }),
      row({ playedFrom: 'c2', playedTo: 'c3', suggestedFrom: 'c2', suggestedTo: 'c4' }),
      row({ playedFrom: 'a2', playedTo: 'a3', suggestedFrom: 'a2', suggestedTo: 'a4' }),
      row({ playedFrom: 'h2', playedTo: 'h3', suggestedFrom: 'h2', suggestedTo: 'h4' }),
    ];

    const evidence = cleanGameEvidence({ analyzedCount: rows.length, averageLoss: 0, moveReports: rows });

    expect(evidence).toMatchObject({
      sufficientSample: true,
      positiveEvidenceVersion: CLEAN_GAME_POSITIVE_EVIDENCE_VERSION,
      positiveComparedMoves: 8,
      enginePreferredMoves: 3,
    });
    expect(evidence).not.toHaveProperty('improved');
    expect(evidence).not.toHaveProperty('skill');
  });

  it('does not treat a different promotion as the same decision', () => {
    const promotion = row({
      playedFrom: 'a7',
      playedTo: 'a8',
      playedPromotion: 'n',
      suggestedFrom: 'a7',
      suggestedTo: 'a8',
      suggestedPromotion: 'q',
    });
    const rows = Array.from({ length: 8 }, (_, index) => (index === 0
      ? promotion
      : row({ playedFrom: 'e2', playedTo: 'e4', suggestedFrom: 'e2', suggestedTo: 'e4' })));

    const evidence = cleanGameEvidence({ analyzedCount: rows.length, averageLoss: 0, moveReports: rows });

    expect(evidence.positiveComparedMoves).toBe(8);
    expect(evidence.enginePreferredMoves).toBe(7);
  });
});
