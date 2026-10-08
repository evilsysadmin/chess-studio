import { chroniclesMapForState } from './chroniclesMapCatalog.js';
import { chroniclesCurrentInitiativeActor } from './chroniclesInitiative.js';

export const CHRONICLES_ACTIVITY_LOG_LIMIT = 80;

function partyMember(state, memberId) {
  return (state?.party || []).find((member) => member.id === memberId) || null;
}

function enemyById(state, enemyId) {
  return chroniclesMapForState(state)?.enemies?.find((enemy) => enemy.id === enemyId) || null;
}

function roundLabel(state) {
  const round = Number(state?.initiative?.round || state?.round || 0);
  return Number.isInteger(round) && round > 0 ? `R${round}` : '';
}

function event(kind, text, state, label = '') {
  return {
    kind,
    label: label || roundLabel(state),
    text: String(text || '').trim(),
  };
}

function enemyTurnSignature(events) {
  return JSON.stringify((events || []).map((entry) => [
    entry?.type,
    entry?.enemyId,
    entry?.targetId,
    entry?.damage,
    entry?.from?.x,
    entry?.from?.y,
    entry?.to?.x,
    entry?.to?.y,
  ]));
}

function effectiveJournal(state) {
  if (Array.isArray(state?.journal) && state.journal.length) return state.journal;
  const initial = chroniclesMapForState(state)?.initialJournal;
  return initial ? [initial] : [];
}

function newlyAddedJournal(previous, next) {
  const previousIds = new Set(effectiveJournal(previous).map((entry) => entry.id));
  return effectiveJournal(next).filter((entry) => !previousIds.has(entry.id));
}

function sameExplorationPose(previous, next) {
  return previous?.mapId === next?.mapId
    && Number(previous?.x) === Number(next?.x)
    && Number(previous?.y) === Number(next?.y)
    && Number(previous?.direction) === Number(next?.direction);
}

export function chroniclesActivityEvents(previous, next) {
  if (!next) return [];
  if (!previous) {
    const map = chroniclesMapForState(next);
    return [event('system', next.message || `Entras en ${map?.title || 'la expedición'}.`, next, 'INICIO')];
  }

  const events = [];
  const map = chroniclesMapForState(next);
  let combatTransitionLogged = false;

  if (previous.mapId !== next.mapId) {
    events.push(event('location', `Entras en ${map?.title || next.mapId}.`, next, 'ZONA'));
  }

  if (!previous.initiative?.order?.length && next.initiative?.order?.length) {
    const order = next.initiative.order.map((actor) => actor.name || actor.id).join(' → ');
    events.push(event('combat', order ? `Comienza el combate. Iniciativa: ${order}.` : 'Comienza el combate.', next, 'COMBATE'));
    combatTransitionLogged = true;
  } else if (previous.initiative?.order?.length && !next.initiative?.order?.length && next.phase !== 'defeated') {
    events.push(event('combat', 'Combate terminado. La compañía vuelve a explorar.', next, 'COMBATE'));
    combatTransitionLogged = true;
  }

  const previousEnemySignature = enemyTurnSignature(previous.enemyTurnEvents);
  const nextEnemySignature = enemyTurnSignature(next.enemyTurnEvents);
  let emittedCombatDetail = false;
  if (nextEnemySignature !== previousEnemySignature) {
    const enemyEvents = next.enemyTurnEvents || [];
    for (const item of enemyEvents) {
      const enemy = enemyById(next, item.enemyId);
      const enemyName = enemy?.name || item.enemyId || 'Enemigo';
      if (item.type === 'attack') {
        const target = partyMember(next, item.targetId);
        events.push(event(
          'enemy-attack',
          `${enemyName} golpea a ${target?.name || item.targetId || 'la compañía'} · -${Math.max(0, Number(item.damage || 0))} HP.`,
          next,
          'ENEMIGO',
        ));
        emittedCombatDetail = true;
      } else if (item.type === 'move' && next.initiative?.order?.length) {
        events.push(event('enemy-move', `${enemyName} se reposiciona.`, next, 'ENEMIGO'));
        emittedCombatDetail = true;
      }
    }
  }

  const actingPartyMember = chroniclesCurrentInitiativeActor(previous?.initiative);
  for (const enemy of map?.enemies || []) {
    const beforeHp = Number(previous?.[enemy.hpKey] || 0);
    const afterHp = Number(next?.[enemy.hpKey] || 0);
    if (afterHp >= beforeHp) continue;
    const damage = beforeHp - afterHp;
    const attacker = actingPartyMember?.kind === 'party'
      ? (partyMember(previous, actingPartyMember.id)?.name || actingPartyMember.name || actingPartyMember.id)
      : null;
    events.push(event(
      'party-attack',
      attacker
        ? `${attacker} golpea a ${enemy.name || enemy.id} · -${damage} HP${afterHp <= 0 ? ' · cae' : ''}.`
        : `${enemy.name || enemy.id} pierde ${damage} HP${afterHp <= 0 ? ' y cae' : ''}.`,
      next,
      'COMBATE',
    ));
    emittedCombatDetail = true;
  }

  for (const member of next.party || []) {
    const before = partyMember(previous, member.id);
    if (!before) continue;
    const gained = Number(member.hp || 0) - Number(before.hp || 0);
    if (gained > 0) {
      events.push(event('heal', `${member.name} recupera ${gained} HP.`, next, 'RECUPERACIÓN'));
      emittedCombatDetail = true;
    }
  }

  const journalEntries = newlyAddedJournal(previous, next);
  for (const entry of journalEntries) {
    const text = entry?.body ? `${entry.title}: ${entry.body}` : entry?.title;
    if (text) events.push(event('expedition', text, next, 'EXPEDICIÓN'));
  }

  if (
    previous.message !== next.message
    && next.message
    && next.initiative?.order?.length
    && !combatTransitionLogged
    && !emittedCombatDetail
  ) {
    events.push(event('turn', next.message, next, roundLabel(next) || 'TURNO'));
  } else if (
    previous.message !== next.message
    && next.message
    && !combatTransitionLogged
    && journalEntries.length === 0
    && sameExplorationPose(previous, next)
  ) {
    events.push(event('interaction', next.message, next, 'INTERACCIÓN'));
  }

  if (next.phase === 'defeated' && previous.phase !== 'defeated') {
    events.push(event('defeat', 'La compañía ha caído.', next, 'DERROTA'));
  }

  return events.filter((entry) => entry.text);
}

export function chroniclesAppendActivityLog(current, incoming, limit = CHRONICLES_ACTIVITY_LOG_LIMIT) {
  const merged = [...(current || []), ...(incoming || [])];
  return merged.slice(Math.max(0, merged.length - Math.max(1, Number(limit) || CHRONICLES_ACTIVITY_LOG_LIMIT)));
}
