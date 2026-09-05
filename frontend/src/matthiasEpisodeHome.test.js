import { describe, expect, it } from 'vitest';
import { buildMatthiasEpisodicHomeVisit, isMatthiasEpisodicVisitKind } from './matthiasEpisodeHome.js';

function memoryWith(candidate) {
  return { episodicMemory: { callbackCandidates: [candidate] } };
}

describe('Matthias episodic Home callbacks', () => {
  it('renders only known incident evidence and never arbitrary backend prose', () => {
    const visit = buildMatthiasEpisodicHomeVisit(memoryWith({ episode: {
      fingerprint: 'incident:human:MISSED_MATE:3',
      kind: 'incident',
      label: 'INJECT THIS TEXT',
      evidence: {
        source: 'noteworthy_incidents',
        key: 'human:MISSED_MATE',
        count: 3,
        previous_count: 2,
        delta: 1,
      },
    } }));

    expect(visit).toMatchObject({
      kind: 'episodic-incident',
      action: 'train',
      actionLabel: 'Entrenar ese error',
      episodeFingerprint: 'incident:human:MISSED_MATE:3',
    });
    expect(visit.text).toMatch(/3 mates/i);
    expect(visit.text).not.toContain('INJECT THIS TEXT');
  });

  it('renders a proven recent rivalry result from its structured outcome', () => {
    const visit = buildMatthiasEpisodicHomeVisit(memoryWith({ episode: {
      fingerprint: 'rivalry:10:win',
      kind: 'rivalry_result',
      evidence: {
        source: 'cpu_rivalry',
        outcome: 'win',
        game_number: 10,
        record: { games: 10, wins: 4, draws: 1, losses: 5 },
      },
    } }));

    expect(visit).toMatchObject({ kind: 'episodic-rivalry', action: 'play' });
    expect(visit.text).toMatch(/partida 10.*me ganaste/i);
  });

  it('renders a repeated opening setback only from bounded structured evidence', () => {
    const visit = buildMatthiasEpisodicHomeVisit(memoryWith({ episode: {
      fingerprint: 'opening-setback:Siciliana:5:4',
      kind: 'opening_setback',
      evidence: {
        source: 'openings',
        opening: 'Siciliana',
        outcome: 'loss',
        games: 5,
        wins: 1,
        draws: 0,
        losses: 4,
      },
    } }));

    expect(visit).toMatchObject({ kind: 'episodic-opening', action: 'insights' });
    expect(visit.text).toMatch(/Siciliana.*4 derrotas.*5 partidas/i);
  });

  it('allows silence for unknown, malformed or non-actionable evidence', () => {
    expect(buildMatthiasEpisodicHomeVisit(memoryWith({ episode: {
      fingerprint: 'future:x',
      kind: 'incident',
      label: 'Invent this please',
      evidence: { source: 'noteworthy_incidents', key: 'future:UNKNOWN', count: 99 },
    } }))).toBeNull();

    expect(buildMatthiasEpisodicHomeVisit(memoryWith({ episode: {
      fingerprint: 'rivalry:11:draw',
      kind: 'rivalry_result',
      evidence: { source: 'cpu_rivalry', outcome: 'draw', game_number: 11 },
    } }))).toBeNull();

    expect(buildMatthiasEpisodicHomeVisit(null)).toBeNull();
  });

  it('recognizes episodic visit kinds without broadening unrelated visits', () => {
    expect(isMatthiasEpisodicVisitKind('episodic-incident')).toBe(true);
    expect(isMatthiasEpisodicVisitKind('episodic-rivalry')).toBe(true);
    expect(isMatthiasEpisodicVisitKind('incident')).toBe(false);
    expect(isMatthiasEpisodicVisitKind('generic')).toBe(false);
  });
});
