import { describe, expect, it } from 'vitest';
import { campaignMap } from './combatCampaign.js';
import { projectCombatOperationsCampaignMap, COMBAT_OPERATIONS_MAP_SURFACE } from './combatOperationsMapProjection.js';

describe('Combat Operations · physical campaign cartography projection', () => {
  const map = campaignMap('operations-map-canonical-seed');
  const base = {
    active: true, seed: map.seed, currentNodeId: 'start',
    selectedNodeId: null, clearedNodeIds: [], route: ['start'],
  };

  it('projects exactly the authored seven stages plus BASE, with real branches and boss', () => {
    const projection = projectCombatOperationsCampaignMap(map, base, map.stages[0]);
    expect(projection.nodes).toHaveLength(map.nodes.length);
    expect(new Set(projection.nodes.map(({ stage }) => stage))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(projection.nodes.find(({ stage }) => stage === 7)).toMatchObject({
      id: map.stages[6][0].id, type: 'boss', status: 'locked',
    });
    expect(projection.edges).toHaveLength(map.nodes.reduce((sum, node) => sum + node.connections.length, 0));
    expect(projection.edges.filter(({ fromId, status }) => fromId === 'start' && status === 'available'))
      .toHaveLength(map.stages[0].length);
    expect(projection.nodes.every(({ x, y }) =>
      x >= COMBAT_OPERATIONS_MAP_SURFACE.left && x <= COMBAT_OPERATIONS_MAP_SURFACE.right
      && y >= COMBAT_OPERATIONS_MAP_SURFACE.bottom && y <= COMBAT_OPERATIONS_MAP_SURFACE.top)).toBe(true);
  });

  it('derives progress from real route and selection, never a guessed sector counter', () => {
    const chosen = map.stages[0][0];
    const next = map.stages[1].find((node) => chosen.connections.includes(node.id));
    const campaign = {
      ...base,
      route: ['start', chosen.id],
      currentNodeId: chosen.id,
      selectedNodeId: next.id,
      clearedNodeIds: [chosen.id],
    };
    const projection = projectCombatOperationsCampaignMap(map, campaign, [next]);
    expect(projection.nodes.find(({ id }) => id === 'start').status).toBe('cleared');
    expect(projection.nodes.find(({ id }) => id === chosen.id).status).toBe('current');
    expect(projection.nodes.find(({ id }) => id === next.id).status).toBe('selected');
    expect(projection.edges.find(({ fromId, toId }) => fromId === 'start' && toId === chosen.id).status).toBe('traversed');
    expect(projection.edges.find(({ fromId, toId }) => fromId === chosen.id && toId === next.id).status).toBe('available');
    expect(campaign.route).toEqual(['start', chosen.id]);
    expect(map.stages[1]).toContain(next);
  });

  it('returns no physical campaign when no campaign exists and ignores invalid geometry', () => {
    expect(projectCombatOperationsCampaignMap(null, base)).toBeNull();
    expect(projectCombatOperationsCampaignMap(map, { ...base, active: false })).toBeNull();
    const broken = { nodes: [...map.nodes, { id: 'invalid', stage: 99, lane: 3, connections: [] }] };
    const result = projectCombatOperationsCampaignMap(broken, base);
    expect(result.nodes).toHaveLength(map.nodes.length);
  });
});
