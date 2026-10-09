import { chroniclesMapById } from './chroniclesMapCatalog.js';

// This *virtual* door is scoped to the active expedition, never appended to
// crypt-eight-squares.json. Existing runs retain their contentVersion/revision.
export const CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID = 'swordhaven-return-door';

export function chroniclesSwordhavenReturnAvailable(state) {
  if (state?.mapId !== 'crypt-eight-squares'
      || state.swordhavenArrived !== true
      || state.campaignRouteV1 === true
      || state.phase !== 'explore'
      || state.initiative) return false;
  const start = chroniclesMapById('crypt-eight-squares').partyStart;
  return state.x === start.x && state.y === start.y;
}

export function chroniclesSwordhavenReturnVisual(state) {
  if (state?.mapId !== 'crypt-eight-squares' || state.swordhavenArrived !== true || state.campaignRouteV1 === true) return [];
  const start = chroniclesMapById('crypt-eight-squares').partyStart;
  return [Object.freeze({
    id: CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID,
    kind: 'exit',
    group: 'exit',
    visualType: 'exit',
    // The entry tile also borders a south wall; use the western doorway.
    wallSide: 'west',
    visible: true,
    position: Object.freeze({ x: start.x, y: start.y }),
  })];
}
