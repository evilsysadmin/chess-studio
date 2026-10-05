import { chroniclesActiveEnemies } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsLegalMoves, chroniclesTacticsMove } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesResolveEnemyActor } from '../chroniclesOfMatthiasTurns.js';
import {
  chroniclesAdvanceCombatInitiative,
  chroniclesCurrentInitiativeActor,
} from './chroniclesInitiative.js';
import { chroniclesTacticsCombatActive } from '../chroniclesTacticsTurnMode.js';

function partyHp(state) {
  return (state?.party || []).reduce((total, member) => total + Math.max(0, Number(member.hp || 0)), 0);
}

function fightIsOver(state) {
  return state?.phase === 'defeated' || state?.phase === 'escaped';
}

function level({ startsCombat, partyWouldFall, attacks, damage }) {
  if (partyWouldFall) return 'fall';
  if (attacks.some((attack) => attack.lethal)) return 'lethal';
  if (damage > 0) return 'hit';
  return startsCombat ? 'combat' : 'calm';
}

function previewNextEnemyActor(state, next) {
  if (!state?.initiative?.order?.length) return null;
  const advanced = chroniclesAdvanceCombatInitiative(next, chroniclesActiveEnemies(next));
  const actor = chroniclesCurrentInitiativeActor(advanced?.initiative);
  if (actor?.kind !== 'enemy') return null;
  return chroniclesResolveEnemyActor(advanced, actor.id);
}

export function chroniclesForecastMove(state, move) {
  if (!state || !move) return null;
  const next = chroniclesTacticsMove(state, move);
  if (next === state) return null;

  const trapDamage = Math.max(0, partyHp(state) - partyHp(next));
  const startsCombat = !state.initiative?.order?.length
    && !fightIsOver(next)
    && (chroniclesTacticsCombatActive(state) || chroniclesTacticsCombatActive(next));
  const preview = fightIsOver(next) ? null : previewNextEnemyActor(state, next);
  const attacks = (preview?.enemyTurnEvents || [])
    .filter((event) => event.type === 'attack')
    .map((event) => ({
      enemyId: event.enemyId,
      targetId: event.targetId,
      hpLost: event.fromHp - event.toHp,
      lethal: event.toHp === 0,
    }));
  const advances = (preview?.enemyTurnEvents || [])
    .filter((event) => event.type === 'move')
    .map((event) => ({ enemyId: event.enemyId, to: event.to }));
  const damage = trapDamage + attacks.reduce((total, attack) => total + attack.hpLost, 0);
  const partyWouldFall = next.phase === 'defeated' || preview?.phase === 'defeated';

  return Object.freeze({
    key: move.key,
    startsCombat,
    responds: Boolean(preview),
    level: level({ startsCombat, partyWouldFall, attacks, damage }),
    damage,
    trapDamage,
    attacks: Object.freeze(attacks),
    advances: Object.freeze(advances),
    partyWouldFall,
  });
}

export function chroniclesForecastMoves(state) {
  if (!state || fightIsOver(state)) return {};
  const actor = chroniclesCurrentInitiativeActor(state.initiative);
  if (actor?.kind === 'enemy') return {};
  return Object.fromEntries(chroniclesTacticsLegalMoves(state)
    .map((move) => [move.key, chroniclesForecastMove(state, move)])
    .filter(([, item]) => item));
}

function capitalize(text) {
  const value = String(text || '');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function chroniclesForecastBadge(forecast) {
  if (!forecast || forecast.level === 'calm') return '';
  if (forecast.level === 'combat') return '⚔';
  if (forecast.level === 'fall') return '†';
  return forecast.level === 'lethal' ? `−${forecast.damage} †` : `−${forecast.damage}`;
}

export function chroniclesForecastDescription(state, forecast) {
  if (!forecast || forecast.level === 'calm') return '';
  if (forecast.level === 'fall') return 'Aviso: este movimiento acabaría con la compañía.';
  const enemies = new Map(chroniclesActiveEnemies(state).map((enemy) => [enemy.id, enemy.name]));
  const members = new Map((state?.party || []).map((member) => [member.id, member.name]));
  const parts = forecast.attacks.map((attack) => {
    const who = capitalize(enemies.get(attack.enemyId) || 'Una criatura');
    const target = members.get(attack.targetId) || 'la compañía';
    return `${who} actuaría después y golpearía a ${target} (−${attack.hpLost})${attack.lethal ? ` y ${target} caería` : ''}`;
  });
  if (forecast.trapDamage > 0) parts.unshift(`Una trampa costaría ${forecast.trapDamage} de vida`);
  if (forecast.startsCombat) parts.push('Se inicia combate y la iniciativa se decide con AGI + 1d8');
  return parts.length ? `Aviso: ${parts.join('; ')}.` : '';
}
