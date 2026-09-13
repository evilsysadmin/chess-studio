import { describe, expect, it } from 'vitest';
import {
  FACTUAL_LANGUAGE_FORBIDDEN_ABSOLUTES,
  REPLAY_OK_VERDICT,
  containsFactualLanguageAbsolute,
} from './factualLanguage.js';
import { buildPostGameIncidentEvidence } from './postGameIncidentEvidence.js';
import {
  buildPlayerModel,
  PATTERN_IMPROVEMENT_STATES,
} from './playerModel.js';
import { patternProgressCopy } from './components/InsightsRecurringErrors.jsx';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const INCIDENT = 'human:MISSED_MATE';

function factualMoveReport(overrides = {}) {
  return {
    played: 'e4',
    playedFrom: 'e2',
    playedTo: 'e4',
    suggested: 'd4',
    suggestedFrom: 'd2',
    suggestedTo: 'd4',
    loss: 120,
    factualEvalAfterSuggested: 42,
    factualEvalAfterPlayed: -78,
    analysisDepth: 3,
    candidateCount: 20,
    secondBest: { san: 'c4', from: 'c2', to: 'c4' },
    evalAfterSecondBest: -78,
    bestToSecondGap: 120,
    context: { fenBefore: START_FEN },
    ...overrides,
  };
}

function trainedPositions() {
  return [
    {
      id: 'trained-1',
      source: 'autopsy',
      sourceGameId: 'source-1',
      incidentKeys: [INCIDENT],
      factualEvidence: { version: 2, classification: 'missed-mate' },
      createdAt: '2026-09-01T10:00:00Z',
      cleanSolves: 1,
      lastCleanAt: '2026-09-10T10:00:00Z',
    },
    {
      id: 'trained-2',
      source: 'autopsy',
      sourceGameId: 'source-2',
      incidentKeys: [INCIDENT],
      factualEvidence: { version: 2, classification: 'missed-mate' },
      createdAt: '2026-09-02T10:00:00Z',
      cleanSolves: 1,
      lastCleanAt: '2026-09-11T10:00:00Z',
    },
  ];
}

function coveredObservation(index, incidentKeys = []) {
  return {
    version: 1,
    gameId: `observation-${index}`,
    date: `2026-09-${String(11 + index).padStart(2, '0')}T12:00:00Z`,
    sufficientSample: true,
    clean: incidentKeys.length === 0,
    incidentCoverageVersion: 1,
    incidentCoverageSufficient: true,
    incidentKeys,
  };
}

function progressWith(observations) {
  const model = buildPlayerModel({
    personalPuzzles: trainedPositions(),
    cleanGameRecords: Object.fromEntries(observations.map((row, index) => [`g${index + 1}`, row])),
  });
  const pattern = model.recurringErrors[0];
  return { state: pattern.improvementState, copy: patternProgressCopy(pattern) };
}

describe('factual language contract', () => {
  it('keeps an ok replay verdict scoped to the actual analysis instead of claiming uniqueness', () => {
    expect(REPLAY_OK_VERDICT).toContain('este análisis');
    expect(containsFactualLanguageAbsolute(REPLAY_OK_VERDICT)).toBe(false);
    expect(FACTUAL_LANGUAGE_FORBIDDEN_ABSOLUTES).toContain('no había nada mejor');
  });

  it('never conflates clear-best evidence with the only legal move', () => {
    const clearBest = buildPostGameIncidentEvidence(factualMoveReport());
    const onlyLegal = buildPostGameIncidentEvidence(factualMoveReport({
      candidateCount: 1,
      secondBest: null,
      evalAfterSecondBest: null,
      bestToSecondGap: null,
      analysisDepth: 1,
    }));

    expect(clearBest.factualAnalysis.bestMoveConstraint).toEqual({
      kind: 'clear-best',
      candidateCount: 20,
      gapCp: 120,
    });
    expect(onlyLegal.factualAnalysis.bestMoveConstraint).toEqual({
      kind: 'only-legal',
      candidateCount: 1,
      gapCp: null,
    });
    expect(clearBest.factualAnalysis.bestMoveConstraint.kind).not.toBe('only-legal');
  });

  it('does not call one clean observation an improvement', () => {
    const result = progressWith([coveredObservation(1)]);
    expect(result.state).toBe(PATTERN_IMPROVEMENT_STATES.NO_SAMPLE);
    expect(result.copy).not.toMatch(/mejora|corregido/i);
    expect(containsFactualLanguageAbsolute(result.copy)).toBe(false);
  });

  it('labels two clean observations as probable, never demonstrated or corrected', () => {
    const result = progressWith([coveredObservation(1), coveredObservation(2)]);
    expect(result.state).toBe(PATTERN_IMPROVEMENT_STATES.PROBABLE_IMPROVEMENT);
    expect(result.copy).toContain('Mejora probable');
    expect(result.copy).not.toMatch(/demostrada|corregido/i);
    expect(containsFactualLanguageAbsolute(result.copy)).toBe(false);
  });

  it('uses corrected wording only after the sufficient-sample threshold', () => {
    const observations = Array.from({ length: 5 }, (_, index) => coveredObservation(index + 1));
    const result = progressWith(observations);
    expect(result.state).toBe(PATTERN_IMPROVEMENT_STATES.CORRECTED_WITH_SUFFICIENT_SAMPLE);
    expect(result.copy).toContain('Corregido con muestra suficiente');
    expect(containsFactualLanguageAbsolute(result.copy)).toBe(false);
  });

  it('reverts to recurrence language when the trained pattern comes back', () => {
    const result = progressWith([
      coveredObservation(1),
      coveredObservation(2),
      coveredObservation(3, [INCIDENT]),
    ]);
    expect(result.state).toBe(PATTERN_IMPROVEMENT_STATES.STILL_OCCURRING);
    expect(result.copy).toContain('Sigue ocurriendo');
    expect(result.copy).not.toMatch(/mejora|corregido/i);
  });
});
