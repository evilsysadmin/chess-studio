// Club development comes exclusively from actual selected starters and their
// recorded training decisions. No invented player goals, minutes, XP or RNG.
// Derived from the versioned career journal; never persisted as a second truth.
import { evaluateFootballLineup } from './footballManagerRoster.js';

const freeze = Object.freeze;
export const FOOTBALL_MAX_GROWTH_PER_ATTRIBUTE = 4;

export function advanceFootballDevelopment(roster, lineup, training, development = {}) {
  evaluateFootballLineup(roster, lineup);
  if (!['standard', 'shooting', 'shape', 'recovery'].includes(training)) {
    throw new Error('Invalid football player development training');
  }
  const starting = new Set(lineup);
  return freeze(Object.fromEntries(roster.map(({ id }) => {
    const previous = development[id] || { starts: 0, shooting: 0, shape: 0 };
    if (!starting.has(id)) return [id, freeze({ ...previous })];
    return [id, freeze({
      starts: previous.starts + 1,
      shooting: previous.shooting + (training === 'shooting' ? 1 : 0),
      shape: previous.shape + (training === 'shape' ? 1 : 0),
    })];
  })));
}

export function getDevelopedFootballRoster(roster, development = {}) {
  return freeze(roster.map((player) => {
    const { starts = 0, shooting = 0, shape = 0 } = development?.[player.id] || {};
    // Four genuine starts yield a small improvement to each base skill.
    // Focused training yields an additional step for every two attended
    // sessions. Recovery grants no development. Both stats are capped.
    const attackGrowth = Math.min(
      FOOTBALL_MAX_GROWTH_PER_ATTRIBUTE,
      Math.floor(starts / 4) + Math.floor(shooting / 2),
    );
    const defenseGrowth = Math.min(
      FOOTBALL_MAX_GROWTH_PER_ATTRIBUTE,
      Math.floor(starts / 4) + Math.floor(shape / 2),
    );
    return freeze({
      ...player,
      attack: Math.min(99, player.attack + attackGrowth),
      defense: Math.min(99, player.defense + defenseGrowth),
      attackGrowth: Math.min(99 - player.attack, attackGrowth),
      defenseGrowth: Math.min(99 - player.defense, defenseGrowth),
      starts,
    });
  }));
}
