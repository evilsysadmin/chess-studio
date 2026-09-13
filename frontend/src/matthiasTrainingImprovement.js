import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { personalTrainingDebts } from './trainingDebt.js';

export const MATTHIAS_TRAINING_ACK_KEY = 'chess-study-matthias-training-ack-v1';
export const MATTHIAS_TRAINING_IMPROVEMENT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function debtImprovementCandidates(puzzles) {
  const byId = new Map((Array.isArray(puzzles) ? puzzles : []).map((puzzle) => [puzzle?.id, puzzle]));
  return personalTrainingDebts(puzzles)
    .filter((debt) => debt.paid && debt.recentPuzzleIds?.length === debt.target)
    .map((debt) => {
      const evidence = debt.recentPuzzleIds.map((id) => byId.get(id)).filter(Boolean);
      if (evidence.length !== debt.target) return null;
      const cleanTimes = evidence.map((puzzle) => timestamp(puzzle?.lastCleanAt));
      if (cleanTimes.some((value) => value === null)) return null;
      const atMs = Math.max(...cleanTimes);
      return {
        kind: 'debt-paid',
        fingerprint: `debt-paid:${debt.incidentKey}:${debt.recentPuzzleIds.join(',')}`,
        at: new Date(atMs).toISOString(),
        label: debt.label,
        incidentKey: debt.incidentKey,
        cases: debt.cases,
      };
    })
    .filter(Boolean);
}

function retentionImprovementCandidates(puzzles) {
  return (Array.isArray(puzzles) ? puzzles : [])
    .map((puzzle) => {
      const atMs = timestamp(puzzle?.retentionCompletedAt);
      if (puzzle?.source !== 'autopsy' || atMs === null || !puzzle?.id) return null;
      return {
        kind: 'retention-completed',
        fingerprint: `retention-completed:${puzzle.id}`,
        at: new Date(atMs).toISOString(),
        puzzleId: puzzle.id,
        title: puzzle.title || 'Caso personal',
      };
    })
    .filter(Boolean);
}

export function latestTrainingImprovement(puzzles = [], {
  now = Date.now(),
  maxAgeMs = MATTHIAS_TRAINING_IMPROVEMENT_MAX_AGE_MS,
} = {}) {
  const nowMs = Number(now);
  const candidates = [
    ...debtImprovementCandidates(puzzles),
    ...retentionImprovementCandidates(puzzles),
  ].sort((a, b) => timestamp(b.at) - timestamp(a.at) || a.fingerprint.localeCompare(b.fingerprint));
  const latest = candidates[0] || null;
  if (!latest) return null;
  const atMs = timestamp(latest.at);
  if (atMs === null || atMs > nowMs || nowMs - atMs > Number(maxAgeMs)) return null;
  return latest;
}

export function acknowledgedTrainingImprovementFingerprint() {
  return getStorageItem(STORAGE_LOCAL, MATTHIAS_TRAINING_ACK_KEY) || null;
}

export function unacknowledgedTrainingImprovement(puzzles = [], options = {}) {
  const improvement = latestTrainingImprovement(puzzles, options);
  if (!improvement) return null;
  return acknowledgedTrainingImprovementFingerprint() === improvement.fingerprint ? null : improvement;
}

export function markTrainingImprovementAcknowledged(improvement) {
  const fingerprint = typeof improvement === 'string' ? improvement : improvement?.fingerprint;
  if (!fingerprint) return false;
  setProfileStorageItem(MATTHIAS_TRAINING_ACK_KEY, fingerprint);
  return true;
}
