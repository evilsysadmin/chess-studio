export const CAMPAIGN_MAP_VIEWBOX = Object.freeze({ width: 1120, height: 420 });
export const CAMPAIGN_MAP_MOBILE_VIEWBOX = Object.freeze({ width: 420, height: 1120 });

export function campaignNodeStatus(node, campaign, availableIds = new Set()) {
  if (!node) return 'locked';
  if (campaign?.selectedNodeId === node.id) return 'selected';
  if (campaign?.currentNodeId === node.id) return 'current';
  if ((campaign?.clearedNodeIds || []).includes(node.id)) return 'cleared';
  if (availableIds.has(node.id)) return 'available';
  return 'locked';
}

function laneY(lane) { return 96 + Math.max(0, Math.min(2, Number(lane) || 0)) * 112; }
function stageX(stage) { return 105 + Math.max(0, Number(stage) || 0) * 130; }
function laneX(lane) { return 96 + Math.max(0, Math.min(2, Number(lane) || 0)) * 112; }
function stageY(stage) { return 66 + Math.max(0, Number(stage) || 0) * 145; }

export function campaignNodePoint(node, orientation = 'desktop') {
  if (!node) return { x: 0, y: 0 };
  if (orientation === 'mobile') return { x: laneX(node.lane), y: stageY(node.stage) };
  return { x: stageX(node.stage), y: laneY(node.lane) };
}

export function campaignMapEdges(map, campaign, availableNodes = []) {
  if (!map) return [];
  const nodesById = new Map((map.nodes || []).map((node) => [node.id, node]));
  const route = campaign?.route || ['start'];
  const traversed = new Set(route.slice(1).map((id, index) => `${route[index]}=>${id}`));
  const availableIds = new Set((availableNodes || []).map((node) => node.id));
  const currentId = campaign?.currentNodeId || 'start';
  const edges = [];

  for (const from of map.nodes || []) {
    for (const targetId of from.connections || []) {
      const to = nodesById.get(targetId);
      if (!to) continue;
      const key = `${from.id}=>${to.id}`;
      let status = 'locked';
      if (traversed.has(key)) status = 'traversed';
      else if (from.id === currentId && availableIds.has(to.id)) status = 'available';
      else if ((campaign?.clearedNodeIds || []).includes(from.id) && (campaign?.clearedNodeIds || []).includes(to.id)) status = 'cleared';
      edges.push({ id: key, fromId: from.id, toId: to.id, from, to, status });
    }
  }
  return edges;
}
