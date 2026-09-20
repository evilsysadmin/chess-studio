import { chroniclesActiveEnemies } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsLegalMoves, chroniclesTacticsMove } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesPreviewEnemyTurn } from '../chroniclesOfMatthiasTurns.js';
import { chroniclesTacticsCombatActive } from '../chroniclesTacticsTurnMode.js';

function partyHp(state) {
  return (state?.party || []).reduce((total, member) => total + Math.max(0, Number(member.hp || 0)), 0);
}

function fightIsOver(state) {
  return state?.phase === 'defeated' || state?.phase === 'escaped';
}

function level({ partyWouldFall, attacks, damage }) {
  if (partyWouldFall) return 'fall';
  if (attacks.some((attack) => attack.lethal)) return 'lethal';
  return damage > 0 ? 'hit' : 'calm';
}

export function chroniclesForecastMove(state, move) {
  if (!state || !move) return null;
  const next = chroniclesTacticsMove(state, move);
  if (next === state) return null;

  const trapDamage = Math.max(0, partyHp(state) - partyHp(next));
  const responds = !fightIsOver(next)
    && (chroniclesTacticsCombatActive(state) || chroniclesTacticsCombatActive(next));
  const preview = responds ? chroniclesPreviewEnemyTurn(next) : null;
  const attacks = (preview?.intents || [])
    .filter((intent) => intent.kind === 'attack')
    .map(({ enemyId, targetId, hpLost, lethal }) => ({ enemyId, targetId, hpLost, lethal }));
  const advances = (preview?.intents || [])
    .filter((intent) => intent.kind === 'move')
    .map(({ enemyId, to }) => ({ enemyId, to }));
  const damage = trapDamage + attacks.reduce((total, attack) => total + attack.hpLost, 0);
  const partyWouldFall = next.phase === 'defeated' || Boolean(preview?.partyWouldFall);

  return Object.freeze({
    key: move.key,
    responds,
    level: level({ partyWouldFall, attacks, damage }),
    damage,
    trapDamage,
    attacks: Object.freeze(attacks),
    advances: Object.freeze(advances),
    partyWouldFall,
  });
}

export function chroniclesForecastMoves(state) {
  if (!state || state.turnPhase === 'enemy' || fightIsOver(state)) return {};
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
    return `${who} golpearía a ${target} (−${attack.hpLost})${attack.lethal ? ` y ${target} caería` : ''}`;
  });
  if (forecast.trapDamage > 0) parts.unshift(`Una trampa costaría ${forecast.trapDamage} de vida`);
  return `Aviso: ${parts.join('; ')}.`;
}
