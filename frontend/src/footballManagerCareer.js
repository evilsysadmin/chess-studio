// One bounded, versioned career event journal. League tables, player growth,
// completed-season honors and fatigue are derived from recorded choices only.
import { FOOTBALL_MANAGER_CLUBS } from './footballManagerClubs.js';
import { advanceFootballSeason, createFootballSeason, FOOTBALL_MANAGER_TACTICS, footballStandings } from './footballManagerSeason.js';
import { evaluateFootballLineup, getDefaultFootballLineup, getFootballClubRoster } from './footballManagerRoster.js';
import { FOOTBALL_TRAINING_PLANS } from './footballManagerTraining.js';
import { footballClubObjectiveReport } from './footballManagerObjectives.js';
import { STORAGE_LOCAL, getStorageItem, storageHealthSnapshot } from './safeStorage.js';
import { profileStorageIdentityMatchesCurrentUser, setProfileStorageItem } from './profileKeys.js';

export const FOOTBALL_CAREER_KEY = 'chess-study-football-manager-career-v1';
export const FOOTBALL_CAREER_VERSION = 4;
export const FOOTBALL_CAREER_MAX_SEASONS = 4;
const MAX_SAVE_BYTES = 16000;
const freeze = Object.freeze;

const findClub = (id) => FOOTBALL_MANAGER_CLUBS.find((club) => club.id === id) || null;
const validSeed = (seed) => Number.isSafeInteger(seed) && seed >= 0;
const followingSeed = (seed) => seed === Number.MAX_SAFE_INTEGER ? 0 : seed + 1;

function requireTraining(training) {
  if (!FOOTBALL_TRAINING_PLANS.some((plan) => plan.id === training)) throw new Error('Invalid football career training plan');
  return training;
}
function requireTactic(tactic) {
  if (!FOOTBALL_MANAGER_TACTICS.some((plan) => plan.id === tactic)) throw new Error('Invalid football career tactic');
  return tactic;
}
function requireLineup(roster, lineup) {
  evaluateFootballLineup(roster, lineup);
  return freeze([...lineup]);
}
function normalizeRounds(rounds, version, roster, requiredLength = null) {
  if (!Array.isArray(rounds) || rounds.length > 10 || (requiredLength !== null && rounds.length !== requiredLength)) {
    throw new Error('Invalid football career round count');
  }
  return freeze(rounds.map((decision) => {
    if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
      throw new Error('Invalid football career round');
    }
    return freeze({
      tactic: requireTactic(decision.tactic),
      training: requireTraining(version === 1 ? 'standard' : decision.training),
      lineup: requireLineup(roster, decision.lineup),
    });
  }));
}
function requireBoundary(boundary, count) {
  if (!Number.isInteger(boundary) || boundary < 0 || boundary > count) {
    throw new Error('Invalid football career development boundary');
  }
  return boundary;
}
function replaySeason(seed, rounds, legacyRounds, clubId, inheritedDevelopment) {
  let season = createFootballSeason({ seed, inheritedDevelopment });
  for (const [index, decision] of rounds.entries()) {
    season = advanceFootballSeason(season, {
      managerClubId: clubId,
      tactic: decision.tactic,
      training: decision.training,
      lineup: decision.lineup,
      development: index >= legacyRounds,
    });
  }
  return season;
}

export function createFootballCareer(clubId, seed = 2026) {
  const club = findClub(clubId);
  if (!club || !validSeed(seed)) throw new Error('Invalid football career club or seed');
  return freeze({
    version: FOOTBALL_CAREER_VERSION,
    clubId,
    initialSeed: seed,
    seed,
    completedSeasons: freeze([]),
    rounds: freeze([]),
    legacyRounds: 0,
    nextTactic: 'balanced',
    nextTraining: 'standard',
    nextLineup: getDefaultFootballLineup(getFootballClubRoster(club)),
  });
}

// This is the only validation/replay boundary. Historic v1/v2 seasons retain
// their exact scores. v3 decisions retain their real earned player development.
// v4 adds previous season journals, never a copy of scores or player ratings.
export function replayFootballCareer(journal) {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)
    || ![1, 2, 3, FOOTBALL_CAREER_VERSION].includes(journal.version)
    || !findClub(journal.clubId) || !validSeed(journal.seed)) {
    throw new Error('Invalid football career snapshot');
  }
  const roster = getFootballClubRoster(findClub(journal.clubId));
  const version = journal.version;
  const initialSeed = version === FOOTBALL_CAREER_VERSION ? journal.initialSeed : journal.seed;
  if (!validSeed(initialSeed)) throw new Error('Invalid football career initial seed');
  const completedRaw = version === FOOTBALL_CAREER_VERSION ? journal.completedSeasons : [];
  if (!Array.isArray(completedRaw) || completedRaw.length >= FOOTBALL_CAREER_MAX_SEASONS) {
    throw new Error('Invalid football career completed seasons');
  }
  let expectedSeed = initialSeed;
  let development;
  const history = [];
  const completedSeasons = completedRaw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Invalid football career completed season');
    }
    const rounds = normalizeRounds(entry.rounds, version, roster, 10);
    const legacyRounds = requireBoundary(entry.legacyRounds, 10);
    const result = replaySeason(expectedSeed, rounds, legacyRounds, journal.clubId, development);
    const row = footballStandings(result).find((item) => item.id === journal.clubId);
    const objective = footballClubObjectiveReport(result, journal.clubId);
    history.push(freeze({
      number: index + 1,
      position: objective.position,
      points: row.points,
      objectiveMet: objective.status === 'met',
    }));
    development = result.managerDevelopment;
    expectedSeed = followingSeed(expectedSeed);
    return freeze({ rounds, legacyRounds });
  });
  if (journal.seed !== expectedSeed) throw new Error('Invalid football career seed chain');
  const rounds = normalizeRounds(journal.rounds, version, roster);
  const legacyRounds = requireBoundary(version < 3 ? rounds.length : journal.legacyRounds, rounds.length);
  const nextTactic = requireTactic(journal.nextTactic);
  const nextTraining = requireTraining(version === 1 ? 'standard' : journal.nextTraining);
  const nextLineup = requireLineup(roster, journal.nextLineup);
  const season = replaySeason(expectedSeed, rounds, legacyRounds, journal.clubId, development);
  return freeze({
    journal: freeze({
      version: FOOTBALL_CAREER_VERSION,
      clubId: journal.clubId,
      initialSeed,
      seed: expectedSeed,
      completedSeasons: freeze(completedSeasons),
      rounds,
      legacyRounds,
      nextTactic,
      nextTraining,
      nextLineup,
    }),
    season,
    history: freeze(history),
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
export function startNextFootballSeason(journal) {
  const { journal: current, season } = replayFootballCareer(journal);
  if (current.rounds.length !== 10 || season.currentRound !== 10) {
    throw new Error('Football season must be complete before renewal');
  }
  if (current.completedSeasons.length + 1 >= FOOTBALL_CAREER_MAX_SEASONS) {
    throw new Error('Football career season limit reached');
  }
  return replayFootballCareer({
    ...current,
    seed: followingSeed(current.seed),
    completedSeasons: [...current.completedSeasons, freeze({
      rounds: current.rounds, legacyRounds: current.legacyRounds,
    })],
    rounds: [],
    legacyRounds: 0,
    nextTraining: 'standard',
  });
}

export function readFootballCareer() {
  if (!profileStorageIdentityMatchesCurrentUser()) return freeze({ status: 'unavailable' });
  const raw = getStorageItem(STORAGE_LOCAL, FOOTBALL_CAREER_KEY);
  if (raw === null) return freeze({ status: 'empty' });
  if (raw.length > MAX_SAVE_BYTES) return freeze({ status: 'invalid' });
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return freeze({ status: 'invalid' }); }
  if (Number.isInteger(parsed?.version) && parsed.version > FOOTBALL_CAREER_VERSION) {
    return freeze({ status: 'future' });
  }
  try { return freeze({ status: 'available', ...replayFootballCareer(parsed) }); }
  catch { return freeze({ status: 'invalid' }); }
}
export function writeFootballCareer(journal) {
  if (!profileStorageIdentityMatchesCurrentUser()) return freeze({ status: 'unavailable' });
  const existing = readFootballCareer();
  if (existing.status === 'future') return freeze({ status: 'future' });
  const normalized = replayFootballCareer(journal);
  const json = JSON.stringify(normalized.journal);
  if (json.length > MAX_SAVE_BYTES) throw new Error('Football career exceeded save limit');
  if (!setProfileStorageItem(FOOTBALL_CAREER_KEY, json)) return freeze({ status: 'unavailable' });
  return freeze({ status: storageHealthSnapshot().local.memoryFallbackActive ? 'memory' : 'saved' });
}
