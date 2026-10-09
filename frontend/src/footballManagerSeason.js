// Pure, reproducible first league slice: no browser storage, clock, backend,
// Godot coupling or random global state. This is not yet a saved career.
import { FOOTBALL_MANAGER_CLUBS } from './footballManagerClubs.js';

const freeze = (value) => Object.freeze(value);
const CHANCES_PER_TEAM = 7;

function requireClubs(clubs) {
  if (!Array.isArray(clubs) || clubs.length !== 6) {
    throw new Error('Chess Football season requires exactly six clubs');
  }
  const ids = new Set();
  return freeze(clubs.map((club) => {
    if (!club || typeof club.id !== 'string' || !club.id.trim()
      || typeof club.name !== 'string' || !club.name.trim()
      || !Number.isInteger(club.level) || club.level < 1 || club.level > 5
      || ids.has(club.id)) {
      throw new Error('Invalid or repeated Chess Football club');
    }
    ids.add(club.id);
    return freeze({ id: club.id, name: club.name, level: club.level });
  }));
}

// Hash each chance independently: results do not depend on which match was
// simulated first, execution speed, locale or Math.random state.
function randomChance(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function buildRounds(ids) {
  const wheel = [...ids];
  const firstLeg = [];
  for (let round = 0; round < ids.length - 1; round += 1) {
    const games = [];
    for (let slot = 0; slot < ids.length / 2; slot += 1) {
      const left = wheel[slot];
      const right = wheel[ids.length - 1 - slot];
      const swapHome = (round + slot) % 2 === 1;
      games.push(freeze({
        homeId: swapHome ? right : left,
        awayId: swapHome ? left : right,
      }));
    }
    firstLeg.push(games);
    wheel.splice(1, 0, wheel.pop());
  }
  return freeze([...firstLeg, ...firstLeg.map((games) => games.map((game) => freeze({
    homeId: game.awayId,
    awayId: game.homeId,
  })))].map((games, roundIndex) => freeze(games.map((game, index) => freeze({
    id: `round-${roundIndex + 1}-match-${index + 1}`,
    round: roundIndex + 1,
    ...game,
  })))));
}

export function createFootballSeason({ clubs = FOOTBALL_MANAGER_CLUBS, seed = 1 } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error('Chess Football season seed must be a non-negative safe integer');
  }
  const participants = requireClubs(clubs);
  return freeze({
    version: 1,
    seed,
    clubs: participants,
    rounds: buildRounds(participants.map((club) => club.id)),
    currentRound: 0,
    results: freeze([]),
  });
}

function simulateFixture(season, fixture) {
  const home = season.clubs.find((club) => club.id === fixture.homeId);
  const away = season.clubs.find((club) => club.id === fixture.awayId);
  // Better squads and playing at home influence the chances. Each decision
  // remains explicitly statistical: no claim of real Godot match events.
  const gap = home.level - away.level;
  const homeProbability = Math.max(.07, Math.min(.38, .20 + gap * .035));
  const awayProbability = Math.max(.07, Math.min(.38, .17 - gap * .035));
  let homeGoals = 0;
  let awayGoals = 0;
  for (let attempt = 0; attempt < CHANCES_PER_TEAM; attempt += 1) {
    const stamp = `${season.seed}:${fixture.id}:${fixture.homeId}:${fixture.awayId}`;
    if (randomChance(`${stamp}:home:${attempt}`) < homeProbability) homeGoals += 1;
    if (randomChance(`${stamp}:away:${attempt}`) < awayProbability) awayGoals += 1;
  }
  return freeze({
    fixtureId: fixture.id,
    round: fixture.round,
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    homeGoals,
    awayGoals,
    source: 'statistical-simulation',
  });
}

export function advanceFootballSeason(season) {
  if (!season || season.version !== 1 || !Array.isArray(season.rounds) || !Array.isArray(season.results)) {
    throw new Error('Invalid Chess Football season');
  }
  if (season.currentRound >= season.rounds.length) return season;
  const roundResults = season.rounds[season.currentRound].map((fixture) => simulateFixture(season, fixture));
  return freeze({
    ...season,
    currentRound: season.currentRound + 1,
    results: freeze([...season.results, ...roundResults]),
  });
}

export function footballStandings(season) {
  const rows = new Map(season.clubs.map((club) => [club.id, {
    id: club.id, name: club.name, played: 0, won: 0, drawn: 0, lost: 0,
    scored: 0, conceded: 0, difference: 0, points: 0,
  }]));
  for (const result of season.results) {
    const home = rows.get(result.homeId);
    const away = rows.get(result.awayId);
    if (!home || !away) throw new Error('Season result references unknown club');
    home.played += 1;
    away.played += 1;
    home.scored += result.homeGoals;
    home.conceded += result.awayGoals;
    away.scored += result.awayGoals;
    away.conceded += result.homeGoals;
    if (result.homeGoals > result.awayGoals) {
      home.won += 1; home.points += 3; away.lost += 1;
    } else if (result.homeGoals < result.awayGoals) {
      away.won += 1; away.points += 3; home.lost += 1;
    } else {
      home.drawn += 1; away.drawn += 1;
      home.points += 1; away.points += 1;
    }
  }
  const ranked = [...rows.values()].map((row) => freeze({
    ...row,
    difference: row.scored - row.conceded,
  }));
  ranked.sort((a, b) => b.points - a.points
    || b.difference - a.difference
    || b.scored - a.scored
    || a.name.localeCompare(b.name, 'es'));
  return freeze(ranked);
}
