// Single, compact manager career journal. Derived standings, scores and
// fatigue and player growth replay from decisions, never trusted from Web Storage.
import { FOOTBALL_MANAGER_CLUBS } from './footballManagerClubs.js';
import { advanceFootballSeason, createFootballSeason, FOOTBALL_MANAGER_TACTICS } from './footballManagerSeason.js';
import { evaluateFootballLineup, getDefaultFootballLineup, getFootballClubRoster } from './footballManagerRoster.js';
import { FOOTBALL_TRAINING_PLANS } from './footballManagerTraining.js';
import { STORAGE_LOCAL, getStorageItem, storageHealthSnapshot } from './safeStorage.js';
import { profileStorageIdentityMatchesCurrentUser, setProfileStorageItem } from './profileKeys.js';

export const FOOTBALL_CAREER_KEY = 'chess-study-football-manager-career-v1';
export const FOOTBALL_CAREER_VERSION = 3;
const MAX_SAVE_BYTES = 16000;
const freeze = Object.freeze;

function findClub(id) {
  return FOOTBALL_MANAGER_CLUBS.find((club) => club.id === id) || null;
}

function requireTraining(training) {
  if (!FOOTBALL_TRAINING_PLANS.some((plan) => plan.id === training)) {
    throw new Error('Invalid football career training plan');
  }
  return training;
}

function requireTactic(tactic) {
  if (!FOOTBALL_MANAGER_TACTICS.some((plan) => plan.id === tactic)) {
    throw new Error('Invalid football career tactic');
  }
  return tactic;
}

function requireLineup(roster, lineup) {
  evaluateFootballLineup(roster, lineup);
  return freeze([...lineup]);
}

export function createFootballCareer(clubId, seed = 2026) {
  const club = findClub(clubId);
  if (!club || !Number.isSafeInteger(seed) || seed < 0) {
    throw new Error('Invalid football career club or seed');
  }
  return freeze({
    version: FOOTBALL_CAREER_VERSION,
    clubId,
    seed,
    rounds: freeze([]),
    // Existing v1/v2 histories stay frozen statistically after migration.
    legacyRounds: 0,
    nextTactic: 'balanced',
    nextTraining: 'standard',
    nextLineup: getDefaultFootballLineup(getFootballClubRoster(club)),
  });
}

// Replay is also our validation boundary: no free-standing mutable scores,
// no foreign players, invalid tactics, impossible rounds or invented fatigue.
export function replayFootballCareer(journal) {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)
    || ![1, 2, FOOTBALL_CAREER_VERSION].includes(journal.version)
    || !findClub(journal.clubId)
    || !Number.isSafeInteger(journal.seed) || journal.seed < 0
    || !Array.isArray(journal.rounds) || journal.rounds.length > 10) {
    throw new Error('Invalid football career snapshot');
  }
  const roster = getFootballClubRoster(findClub(journal.clubId));
  const rounds = journal.rounds.map((decision) => {
    if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
      throw new Error('Invalid football career round');
    }
    return freeze({
      tactic: requireTactic(decision.tactic),
      training: requireTraining(journal.version === 1 ? 'standard' : decision.training),
      lineup: requireLineup(roster, decision.lineup),
    });
  });
  // Upgrading an in-progress old career must NOT simulate growth into
  // already-played games, otherwise saved scores could change on reload.
  // The migration boundary is a bounded event-journal marker, not another
  // store of player ratings or invented past performance.
  const legacyRounds = journal.version < FOOTBALL_CAREER_VERSION
    ? rounds.length : journal.legacyRounds;
  if (!Number.isInteger(legacyRounds) || legacyRounds < 0 || legacyRounds > rounds.length) {
    throw new Error('Invalid football career development boundary');
  }
  const nextTactic = requireTactic(journal.nextTactic);
  const nextTraining = requireTraining(journal.version === 1 ? 'standard' : journal.nextTraining);
  const nextLineup = requireLineup(roster, journal.nextLineup);
  let season = createFootballSeason({ seed: journal.seed });
  for (const [index, decision] of rounds.entries()) {
    season = advanceFootballSeason(season, {
      managerClubId: journal.clubId,
      tactic: decision.tactic,
      training: decision.training,
      lineup: decision.lineup,
      development: index >= legacyRounds,
    });
  }
  return freeze({
    journal: freeze({
      version: FOOTBALL_CAREER_VERSION,
      clubId: journal.clubId,
      seed: journal.seed,
      rounds: freeze(rounds),
      legacyRounds,
      nextTactic,
      nextTraining,
      nextLineup,
    }),
    season,
  });
}

export function editFootballCareer(journal, { tactic, lineup, training } = {}) {
  const { journal: current } = replayFootballCareer(journal);
  if (current.rounds.length === 10) throw new Error('Football career already complete');
  return replayFootballCareer({
    ...current,
    nextTactic: tactic === undefined ? current.nextTactic : tactic,
    nextTraining: training === undefined ? current.nextTraining : training,
    nextLineup: lineup === undefined ? current.nextLineup : lineup,
  });
}

export function playFootballCareerRound(journal) {
  const { journal: current } = replayFootballCareer(journal);
  if (current.rounds.length >= 10) throw new Error('Football career already complete');
  return replayFootballCareer({
    ...current,
    rounds: [...current.rounds, { tactic: current.nextTactic, training: current.nextTraining, lineup: current.nextLineup }],
  });
}

export function readFootballCareer() {
  if (!profileStorageIdentityMatchesCurrentUser()) return freeze({ status: 'unavailable' });
  const raw = getStorageItem(STORAGE_LOCAL, FOOTBALL_CAREER_KEY);
  if (raw === null) return freeze({ status: 'empty' });
  if (raw.length > MAX_SAVE_BYTES) return freeze({ status: 'invalid' });
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return freeze({ status: 'invalid' }); }
  // Never downgrade a newer client's save or silently replace it.
  if (Number.isInteger(parsed?.version) && parsed.version > FOOTBALL_CAREER_VERSION) {
    return freeze({ status: 'future' });
  }
  try {
    return freeze({ status: 'available', ...replayFootballCareer(parsed) });
  } catch {
    return freeze({ status: 'invalid' });
  }
}

export function writeFootballCareer(journal) {
  if (!profileStorageIdentityMatchesCurrentUser()) return freeze({ status: 'unavailable' });
  const existing = readFootballCareer();
  if (existing.status === 'future') return freeze({ status: 'future' });
  const normalized = replayFootballCareer(journal);
  const json = JSON.stringify(normalized.journal);
  if (json.length > MAX_SAVE_BYTES) throw new Error('Football career exceeded save limit');
  if (!setProfileStorageItem(FOOTBALL_CAREER_KEY, json)) {
    return freeze({ status: 'unavailable' });
  }
  // profileKeys marks sync dirty; safeStorage may preserve a write only in
  // this tab. Do not promise durable save when a native write failed.
  return freeze({ status: storageHealthSnapshot().local.memoryFallbackActive ? 'memory' : 'saved' });
}
