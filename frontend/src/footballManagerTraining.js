// Pre-match coaching has bounded scoring/defensive effects or genuine rest.
// Neither hidden XP nor fabricated match statistics are involved.
import { evaluateFootballLineup, getFootballFatigue } from './footballManagerRoster.js';

export const FOOTBALL_TRAINING_PLANS = Object.freeze([
  Object.freeze({ id: 'standard', label: 'Rutina normal', description: 'Sin bonificaciones ni fatiga extra.', attack: 0, defense: 0, extraFatigue: 0, recovery: 0 }),
  Object.freeze({ id: 'shooting', label: 'Remates', description: 'Mejora el ataque, pero añade 7 de fatiga a los titulares.', attack: .035, defense: 0, extraFatigue: 7, recovery: 0 }),
  Object.freeze({ id: 'shape', label: 'Repliegue', description: 'Refuerza la defensa, pero añade 7 de fatiga a los titulares.', attack: 0, defense: .035, extraFatigue: 7, recovery: 0 }),
  Object.freeze({ id: 'recovery', label: 'Recuperación', description: 'Reduce 12 de fatiga antes del partido, sin bono táctico.', attack: 0, defense: 0, extraFatigue: 0, recovery: 12 }),
]);

export function prepareFootballTraining(roster, lineup, fatigue = {}, planId = 'standard') {
  evaluateFootballLineup(roster, lineup);
  const plan = FOOTBALL_TRAINING_PLANS.find((entry) => entry.id === planId);
  if (!plan) throw new Error('Invalid football manager training plan');
  const starters = new Set(lineup);
  const kickoffFatigue = Object.freeze(Object.fromEntries(roster.map(({ id }) => {
    const rested = Math.max(0, getFootballFatigue(fatigue, id) - plan.recovery);
    return [id, Math.min(100, rested + (starters.has(id) ? plan.extraFatigue : 0))];
  })));
  return Object.freeze({
    id: plan.id,
    attackBonus: plan.attack,
    defenseBonus: plan.defense,
    kickoffFatigue,
  });
}
