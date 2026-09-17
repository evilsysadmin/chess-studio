import { CHRONICLES_DIRECTIONS } from './chroniclesOfMatthias.js';

export const CHRONICLES_PARTY_GRID_ORDER = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);

const CHRONICLES_PARTY_DEPLOY_OFFSETS = Object.freeze({
  matthias: Object.freeze({ forward: 0.22, left: 0.27 }),
  rook: Object.freeze({ forward: 0.22, left: -0.27 }),
  bishop: Object.freeze({ forward: -0.22, left: 0.27 }),
  knight: Object.freeze({ forward: -0.22, left: -0.27 }),
});

function formationBasis(directionIndex) {
  const forward = CHRONICLES_DIRECTIONS[directionIndex] || CHRONICLES_DIRECTIONS[1];
  return Object.freeze({
    forward,
    left: Object.freeze({ dx: forward.dy, dy: -forward.dx }),
  });
}

export function chroniclesPartyGridFootprint(state) {
  const origin = {
    x: Number(state?.x),
    y: Number(state?.y),
  };
  if (!Number.isInteger(origin.x) || !Number.isInteger(origin.y)) return Object.freeze({});

  const presentIds = new Set((state?.party || [])
    .filter((member) => Number(member?.hp || 0) > 0)
    .map((member) => member?.id)
    .filter(Boolean));
  const { forward, left } = formationBasis(Number(state?.direction));

  return Object.freeze(Object.fromEntries(CHRONICLES_PARTY_GRID_ORDER.flatMap((memberId) => {
    if (!presentIds.has(memberId)) return [];
    const offset = CHRONICLES_PARTY_DEPLOY_OFFSETS[memberId];
    return [[memberId, Object.freeze({
      x: origin.x + forward.dx * offset.forward + left.dx * offset.left,
      y: origin.y + forward.dy * offset.forward + left.dy * offset.left,
    })]];
  })));
}
