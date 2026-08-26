import { describe, expect, it } from 'vitest';
import { campaignMapEdges, campaignNodePoint, campaignNodeStatus } from './campaignMapVisual.js';

describe('campaign map visual model', () => {
  const start = { id:'start', stage:0, lane:1, connections:['a','b'] };
  const a = { id:'a', stage:1, lane:0, connections:['c'] };
  const b = { id:'b', stage:1, lane:2, connections:['c'] };
  const c = { id:'c', stage:2, lane:1, connections:[] };
  const map = { nodes:[start,a,b,c] };

  it('distingue ruta recorrida de bifurcaciones disponibles', () => {
    const campaign = { currentNodeId:'a', clearedNodeIds:['a'], route:['start','a'] };
    const edges = campaignMapEdges(map, campaign, [c]);
    expect(edges.find((edge)=>edge.id==='start=>a')?.status).toBe('traversed');
    expect(edges.find((edge)=>edge.id==='a=>c')?.status).toBe('available');
    expect(edges.find((edge)=>edge.id==='start=>b')?.status).toBe('locked');
  });

  it('mantiene la posición actual aunque el nodo ya esté superado', () => {
    expect(campaignNodeStatus(a, { currentNodeId:'a', clearedNodeIds:['a'] }, new Set())).toBe('current');
  });

  it('cambia la orientación geométrica en móvil', () => {
    const node = { stage:7, lane:1 };
    expect(campaignNodePoint(node, 'desktop').x).toBeGreaterThan(campaignNodePoint(node, 'desktop').y);
    expect(campaignNodePoint(node, 'mobile').y).toBeGreaterThan(campaignNodePoint(node, 'mobile').x);
  });
});
