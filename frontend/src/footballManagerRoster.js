// Small, fictional and immutable football-five rosters. No transfers, wages,
// fictional match events or Web Storage until the career model is validated.
const freeze = Object.freeze;
const ROLES = ['POR', 'DEF', 'MED', 'MED', 'DEL', 'POR', 'DEF', 'MED', 'DEL'];
const PROFILES = [
  [20, 79], [43, 74], [62, 62], [55, 70], [80, 39],
  [19, 88], [58, 61], [76, 50], [66, 55],
];
const FIRST_NAMES = ['Mateo', 'Bruno', 'Iker', 'Gael', 'Leo', 'Hugo', 'Marcos', 'Álex', 'Dani', 'Óscar', 'Nico', 'Iván', 'Álvaro', 'Sergio', 'Julián', 'Eric', 'Adrián', 'Lucas'];
const LAST_NAMES = ['Roca', 'Salas', 'Vidal', 'Aguirre', 'Soler', 'Costa', 'Luna', 'Paredes', 'Rey', 'Campos', 'Ríos', 'Ferrer', 'Prieto', 'Molina', 'León', 'Cano', 'Gil', 'Serrano'];

export const FOOTBALL_FIVE_POSITIONS = freeze({
  POR: 'Portería', DEF: 'Defensa', MED: 'Medio', DEL: 'Delantera',
});

export function getFootballClubRoster(club) {
  if (!club || typeof club.id !== 'string' || !club.id.trim()
    || !Number.isInteger(club.level) || club.level < 1 || club.level > 5) {
    throw new Error('Invalid football manager club roster');
  }
  let clubHash = 0;
  for (const char of club.id) clubHash = (Math.imul(clubHash, 31) + char.charCodeAt(0)) >>> 0;
  return freeze(ROLES.map((role, index) => {
    const ordinal = ROLES.slice(0, index + 1).filter((r) => r === role).length;
    const [baseAttack, baseDefense] = PROFILES[index];
    return freeze({
      id: `${club.id}-${role.toLowerCase()}-${ordinal}`,
      name: `${FIRST_NAMES[(clubHash + index * 2) % FIRST_NAMES.length]} ${LAST_NAMES[(clubHash + index * 3) % LAST_NAMES.length]}`,
      role,
      attack: Math.min(95, baseAttack + (club.level - 3) * 3),
      defense: Math.min(95, baseDefense + (club.level - 3) * 3),
    });
  }));
}

export function getDefaultFootballLineup(roster) {
  if (!Array.isArray(roster) || roster.length !== 9) throw new Error('Invalid football manager roster');
  return freeze(roster.slice(0, 5).map((player) => player.id));
}

function strength(players) {
  const attackWeights = { POR: .1, DEF: .5, MED: 1, DEL: 1.5 };
  const defenseWeights = { POR: 1.4, DEF: 1.3, MED: .9, DEL: .45 };
  return {
    attack: players.reduce((sum, player) => sum + player.attack * attackWeights[player.role], 0),
    defense: players.reduce((sum, player) => sum + player.defense * defenseWeights[player.role], 0),
  };
}

export function evaluateFootballLineup(roster, lineupIds) {
  if (!Array.isArray(roster) || roster.length !== 9 || !Array.isArray(lineupIds)
    || lineupIds.length !== 5 || new Set(lineupIds).size !== 5) {
    throw new Error('Invalid football manager lineup');
  }
  const players = lineupIds.map((id) => roster.find((player) => player.id === id));
  if (players.some((player) => !player)) throw new Error('Invalid football manager lineup');
  const roles = Object.fromEntries(Object.keys(FOOTBALL_FIVE_POSITIONS).map((role) => [
    role, players.filter((player) => player.role === role).length,
  ]));
  if (roles.POR !== 1 || roles.DEF !== 1 || roles.MED !== 2 || roles.DEL !== 1) {
    throw new Error('Invalid football manager lineup formation');
  }
  const original = strength(roster.slice(0, 5));
  const selected = strength(players);
  // Deliberately bounded: a substitute matters without overpowering club
  // quality, home advantage, or the head coach's tactical plan.
  const bounded = (x) => Math.max(-.055, Math.min(.055, x / 400));
  return freeze({
    attackDelta: bounded(selected.attack - original.attack),
    defenseDelta: bounded(selected.defense - original.defense),
    lineupIds: freeze([...lineupIds]),
  });
}


// Fatigue derives exclusively from a simulated match with a real manager
// lineup. No random injuries, invented minutes played, or second clock.
export function getFootballFatigue(fatigue, playerId) {
  const value = fatigue?.[playerId] ?? 0;
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error('Invalid football fatigue');
  }
  return value;
}

export function evaluateFootballFatigue(roster, lineupIds, fatigue = {}) {
  evaluateFootballLineup(roster, lineupIds);
  const average = lineupIds.reduce((sum, id) => sum + getFootballFatigue(fatigue, id), 0) / 5;
  return freeze({
    average,
    // At 100% exhaustion the chance penalty stays bounded. It applies to
    // the manager's fixture, not to any other result or club.
    attackPenalty: Math.min(.065, average * .00065),
    defensePenalty: Math.min(.05, average * .0005),
  });
}

export function advanceFootballFatigue(roster, lineupIds, fatigue = {}) {
  evaluateFootballLineup(roster, lineupIds);
  const starters = new Set(lineupIds);
  return freeze(Object.fromEntries(roster.map(({ id }) => [
    id, starters.has(id)
      ? Math.min(100, getFootballFatigue(fatigue, id) + 17)
      : Math.max(0, getFootballFatigue(fatigue, id) - 22),
  ])));
}
