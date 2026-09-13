import { CHRONICLES_ENEMIES } from './chroniclesOfMatthias.js';

export function chroniclesRetaliationCue(previousState, nextState) {
  if (!previousState || !nextState) return null;
  const previousParty = Array.isArray(previousState.party) ? previousState.party : [];
  const nextParty = Array.isArray(nextState.party) ? nextState.party : [];

  const damagedMember = nextParty.find((member) => {
    const previous = previousParty.find((candidate) => candidate.id === member.id);
    return previous && Number(member.hp || 0) < Number(previous.hp || 0);
  });
  if (!damagedMember) return null;

  const previousMember = previousParty.find((member) => member.id === damagedMember.id);
  const enemy = CHRONICLES_ENEMIES.find((candidate) => {
    const previousHp = Number(previousState[candidate.hpKey] || 0);
    const nextHp = Number(nextState[candidate.hpKey] || 0);
    return nextHp > 0 && nextHp < previousHp;
  });
  if (!enemy) return null;

  return {
    enemyId: enemy.id,
    targetId: damagedMember.id,
    targetName: damagedMember.name,
    damage: Math.max(0, Number(previousMember?.hp || 0) - Number(damagedMember.hp || 0)),
  };
}
