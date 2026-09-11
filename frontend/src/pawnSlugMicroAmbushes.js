const freezeMember = (sourceId, type, offset) => Object.freeze({ sourceId, type, offset });

export const PAWN_SLUG_MICRO_AMBUSHES = Object.freeze([
  Object.freeze({
    id: 'forest-contact',
    triggerX: 900,
    members: Object.freeze([
      freezeMember('pawn-2', 'pawn', 300),
      freezeMember('knight-3', 'knight', 470),
      freezeMember('pawn-4', 'pawn', 620),
    ]),
  }),
  Object.freeze({
    id: 'ruins-crossfire',
    triggerX: 1660,
    members: Object.freeze([
      freezeMember('pawn-6', 'pawn', 280),
      freezeMember('knight-7', 'knight', 480),
      freezeMember('pawn-8', 'pawn', 650),
    ]),
  }),
  Object.freeze({
    id: 'ridge-pressure',
    triggerX: 2640,
    members: Object.freeze([
      freezeMember('pawn-12', 'pawn', 300),
      freezeMember('knight-13', 'knight', 470),
      freezeMember('pawn-14', 'pawn', 650),
    ]),
  }),
]);

const AMBUSH_MEMBER_BY_SOURCE_ID = new Map(
  PAWN_SLUG_MICRO_AMBUSHES.flatMap((ambush) => ambush.members.map((member) => [
    member.sourceId,
    Object.freeze({ ambushId: ambush.id, triggerX: ambush.triggerX, member }),
  ])),
);

export function pawnSlugSpawnBelongsToMicroAmbush(spawnId) {
  return AMBUSH_MEMBER_BY_SOURCE_ID.has(String(spawnId || ''));
}

export function pawnSlugMicroAmbushPositionForSpawn(spawn) {
  const entry = AMBUSH_MEMBER_BY_SOURCE_ID.get(String(spawn?.id || ''));
  if (!entry) return spawn;
  return Object.freeze({
    ...spawn,
    x: entry.triggerX + entry.member.offset,
    ambushId: entry.ambushId,
  });
}

export function pawnSlugPendingMicroAmbushes({ playerX = 0, triggeredIds = new Set() } = {}) {
  const x = Math.max(0, Number(playerX) || 0);
  return PAWN_SLUG_MICRO_AMBUSHES.filter((ambush) => x >= ambush.triggerX && !triggeredIds.has(ambush.id));
}

export function pawnSlugMicroAmbushSpawns(ambush) {
  if (!ambush?.id || !Array.isArray(ambush.members)) return Object.freeze([]);
  return Object.freeze(ambush.members.map((member, index) => Object.freeze({
    id: member.sourceId,
    type: member.type,
    x: ambush.triggerX + member.offset,
    ambushId: ambush.id,
    ambushIndex: index,
  })));
}

export const PAWN_SLUG_MICRO_AMBUSH_META = Object.freeze({
  finite: true,
  maxMembers: 3,
  minLeadDistance: 280,
  reusesMissionPopulation: true,
  excludesBosses: true,
  excludesMidBosses: true,
  activation: 'existing-camera-spawn-window',
});
