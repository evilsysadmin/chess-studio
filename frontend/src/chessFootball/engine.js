const CLUB_BLUEPRINTS = [
  ['FC Matthias', '♟', 74, 72, 73],
  ['Real Enroque', '♜', 71, 76, 72],
  ['Borussia Gambito', '♞', 77, 68, 74],
  ['Sporting Zugzwang', '♝', 70, 74, 75],
  ['Athletic Peón', '♙', 69, 71, 77],
  ['Inter de Alfiles', '♗', 75, 70, 71],
];

const FIRST_NAMES = ['Hans','Otto','Günther','Klaus','Dieter','Erwin','Fritz','Rüdiger','Bruno','Konrad','Lukas','Felix','Max','Anton','Emil','Jonas','Nico','Karl','Theo','Willi'];
const LAST_NAMES = ['Weiss','Krüger','Vogel','Brandt','Keller','Wolf','Hartmann','Koch','Richter','Beck','Neumann','Schwarz','Jäger','Braun','Kaiser','Fuchs'];
const ARCHETYPES = ['pawn','knight','bishop','rook','queen'];

function hashSeed(value) {
  let h = 2166136261;
  for (const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFrom(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function int(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createSquad(clubId, baseRating, seed) {
  const rng = rngFrom(String(seed) + ':' + clubId + ':squad');
  return Array.from({ length: 18 }, (_, index) => {
    const archetype = ARCHETYPES[index % ARCHETYPES.length];
    const age = int(rng, 17, 33);
    const rating = clamp(baseRating + int(rng, -8, 8), 45, 92);
    const potential = clamp(rating + int(rng, 0, Math.max(2, 9 - Math.floor((age - 17) / 2))), rating, 95);
    return {
      id: clubId + '-p' + (index + 1),
      name: FIRST_NAMES[int(rng, 0, FIRST_NAMES.length - 1)] + ' ' + LAST_NAMES[int(rng, 0, LAST_NAMES.length - 1)],
      archetype,
      age,
      rating,
      potential,
      form: int(rng, 55, 85),
      morale: int(rng, 55, 90),
      fatigue: int(rng, 0, 18),
    };
  });
}

function buildClubs(seed) {
  return CLUB_BLUEPRINTS.map(([name, glyph, attack, defense, control], index) => {
    const id = 'club-' + (index + 1);
    const baseRating = Math.round((attack + defense + control) / 3);
    return { id, name, glyph, attack, defense, control, squad: createSquad(id, baseRating, seed) };
  });
}

function rotateRoundRobin(ids) {
  const fixed = ids[0];
  const rotating = ids.slice(1);
  const rounds = [];
  for (let round = 0; round < ids.length - 1; round += 1) {
    const row = [fixed, ...rotating];
    const matches = [];
    for (let i = 0; i < row.length / 2; i += 1) {
      const a = row[i];
      const b = row[row.length - 1 - i];
      const homeFirst = (round + i) % 2 === 0;
      matches.push({ homeId: homeFirst ? a : b, awayId: homeFirst ? b : a });
    }
    rounds.push(matches);
    rotating.unshift(rotating.pop());
  }
  return rounds;
}

export function createSchedule(clubIds) {
  if (clubIds.length < 2 || clubIds.length % 2 !== 0) throw new Error('Chess Football requires an even number of clubs.');
  const firstLeg = rotateRoundRobin(clubIds);
  const secondLeg = firstLeg.map((matches) => matches.map(({ homeId, awayId }) => ({ homeId: awayId, awayId: homeId })));
  return [...firstLeg, ...secondLeg].map((matches, index) => ({ number: index + 1, matches }));
}

function expectedGoals(attackingClub, defendingClub, home) {
  const squadStrength = attackingClub.squad.reduce((sum, player) => sum + player.rating, 0) / attackingClub.squad.length;
  const shape = (attackingClub.attack * 0.48 + attackingClub.control * 0.22 + squadStrength * 0.30) - defendingClub.defense;
  return clamp(1.15 + shape / 18 + (home ? 0.18 : 0), 0.25, 3.25);
}

function poisson(lambda, rng) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= rng();
  } while (product > limit && count < 12);
  return count - 1;
}

export function simulateMatch(home, away, seed) {
  const rng = rngFrom(seed);
  const homeGoals = poisson(expectedGoals(home, away, true), rng);
  const awayGoals = poisson(expectedGoals(away, home, false), rng);
  const events = [];
  const totalGoals = homeGoals + awayGoals;
  for (let i = 0; i < totalGoals; i += 1) {
    const minute = int(rng, 4, 89);
    const homeGoal = i < homeGoals;
    const club = homeGoal ? home : away;
    const scorer = club.squad[int(rng, 0, club.squad.length - 1)];
    events.push({ minute, type: 'goal', clubId: club.id, playerId: scorer.id, text: '⚽ ' + scorer.name });
  }
  events.sort((a, b) => a.minute - b.minute);
  return { homeId: home.id, awayId: away.id, homeGoals, awayGoals, events };
}

export function createSeason(seed = 'chess-football') {
  const clubs = buildClubs(seed);
  return {
    seed: String(seed),
    season: 1,
    roundIndex: 0,
    clubs,
    schedule: createSchedule(clubs.map((club) => club.id)),
    results: [],
  };
}

export function playNextRound(state) {
  if (state.roundIndex >= state.schedule.length) return state;
  const round = state.schedule[state.roundIndex];
  const byId = Object.fromEntries(state.clubs.map((club) => [club.id, club]));
  const roundResults = round.matches.map((match, index) => simulateMatch(
    byId[match.homeId],
    byId[match.awayId],
    state.seed + ':s' + state.season + ':r' + round.number + ':m' + (index + 1),
  ));
  return { ...state, roundIndex: state.roundIndex + 1, results: [...state.results, { number: round.number, matches: roundResults }] };
}

export function tableFor(state) {
  const rows = Object.fromEntries(state.clubs.map((club) => [club.id, {
    id: club.id, name: club.name, glyph: club.glyph, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
  }]));

  for (const round of state.results) {
    for (const match of round.matches) {
      const home = rows[match.homeId];
      const away = rows[match.awayId];
      home.played += 1; away.played += 1;
      home.gf += match.homeGoals; home.ga += match.awayGoals;
      away.gf += match.awayGoals; away.ga += match.homeGoals;
      if (match.homeGoals > match.awayGoals) {
        home.won += 1; away.lost += 1; home.points += 3;
      } else if (match.homeGoals < match.awayGoals) {
        away.won += 1; home.lost += 1; away.points += 3;
      } else {
        home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1;
      }
    }
  }

  return Object.values(rows).sort((a, b) =>
    b.points - a.points ||
    (b.gf - b.ga) - (a.gf - a.ga) ||
    b.gf - a.gf ||
    a.name.localeCompare(b.name)
  );
}

export function seasonComplete(state) {
  return state.roundIndex >= state.schedule.length;
}
