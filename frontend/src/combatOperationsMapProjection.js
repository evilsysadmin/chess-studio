import { campaignMapEdges, campaignNodeStatus } from './campaignMapVisual.js';

// Coordinates are local to the authored Combat Operations GLB (Z-up -> glTF Y-up).
// The physical map is on the rear wall; its existing parchment stays in Blender.
// Read-only projection: campaignMap(seed) and the saved campaign remain authoritative.
export const COMBAT_OPERATIONS_MAP_SURFACE = Object.freeze({
  left: -2.04,
  right: 2.04,
  top: 4.24,
  bottom: 3.32,
  nodeDepth: -6.075,
  routeDepth: -6.11,
});

export function projectCombatOperationsCampaignMap(map, campaign, availableNodes = []) {
  if (!map?.nodes?.length || !campaign?.active) return null;

  const availableIds = new Set((availableNodes || []).map(({ id }) => id));
  const nodes = map.nodes
    .filter((node) => Number.isInteger(node.stage) && node.stage >= 0 && node.stage <= 7
      && Number.isInteger(node.lane) && node.lane >= 0 && node.lane <= 2)
    .map((node) => ({
      id: node.id,
      stage: node.stage,
      lane: node.lane,
      type: node.type,
      label: node.label,
      typeLabel: node.typeLabel,
      status: node.id === 'start'
        ? (campaign.currentNodeId === 'start' ? 'current' : (campaign.route || []).includes('start') ? 'cleared' : 'locked')
        : campaignNodeStatus(node, campaign, availableIds),
      x: COMBAT_OPERATIONS_MAP_SURFACE.left
        + (COMBAT_OPERATIONS_MAP_SURFACE.right - COMBAT_OPERATIONS_MAP_SURFACE.left) * node.stage / 7,
      y: COMBAT_OPERATIONS_MAP_SURFACE.top
        - (COMBAT_OPERATIONS_MAP_SURFACE.top - COMBAT_OPERATIONS_MAP_SURFACE.bottom) * node.lane / 2,
    }));

  const positions = new Map(nodes.map((node) => [node.id, node]));
  const edges = campaignMapEdges(map, campaign, availableNodes)
    .filter(({ fromId, toId }) => positions.has(fromId) && positions.has(toId))
    .map(({ id, fromId, toId, status }) => ({
      id, fromId, toId, status,
      from: { x: positions.get(fromId).x, y: positions.get(fromId).y },
      to: { x: positions.get(toId).x, y: positions.get(toId).y },
    }));

  return { version: 'combat-operations-map-projection-v1', nodes, edges };
}
