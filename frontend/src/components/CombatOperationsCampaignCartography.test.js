import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installCombatOperationsCampaignCartography } from './CombatOperationsCampaignCartography.js';
import { projectCombatOperationsCampaignMap } from '../combatOperationsMapProjection.js';
import { campaignMap } from '../combatCampaign.js';

function makeRoom() {
  const root = new THREE.Group();
  const anchor = new THREE.Object3D();
  anchor.name = 'COMBAT_ANCHOR_campaign_map';
  root.add(anchor);
  for (const name of ['COMBAT_MAP_pin_0', 'COMBAT_MAP_route_0', 'COMBAT_MAP_region_0']) {
    const mesh = new THREE.Group(); mesh.name = name; root.add(mesh);
  }
  return root;
}

describe('Combat Operations · authored-wall live topology', () => {
  it('installs real nodes and edges with bounded GPU draw submissions and cleanup', () => {
    const map = campaignMap('cartography-runtime-seed');
    const campaign = { active: true, seed: map.seed, route: ['start'], currentNodeId: 'start', selectedNodeId: null };
    const projection = projectCombatOperationsCampaignMap(map, campaign, map.stages[0]);
    const room = makeRoom();
    const dispose = installCombatOperationsCampaignCartography(room, projection);
    const pins = room.getObjectByName('combat-operations-real-sector-pins');
    const routes = room.getObjectByName('combat-operations-real-sector-routes');

    expect(pins.isInstancedMesh).toBe(true);
    expect(pins.count).toBe(map.nodes.length);
    expect(pins.geometry.parameters.radius).toBeCloseTo(0.098);
    expect(pins.material.toneMapped).toBe(false);
    const currentIndex = projection.nodes.findIndex((node) => node.status === 'current');
    const availableIndex = projection.nodes.findIndex((node) => node.status === 'available');
    const currentPose = new THREE.Matrix4();
    const availablePose = new THREE.Matrix4();
    pins.getMatrixAt(currentIndex, currentPose);
    pins.getMatrixAt(availableIndex, availablePose);
    expect(new THREE.Vector3().setFromMatrixScale(currentPose).x).toBeCloseTo(1.38);
    expect(new THREE.Vector3().setFromMatrixScale(availablePose).x).toBeCloseTo(1.16);
    expect(pins.userData.nodeIds).toEqual(map.nodes.map((node) => node.id));
    expect(routes.geometry.getAttribute('position').count).toBe(projection.edges.length * 2);
    expect(routes.material.toneMapped).toBe(false);
    expect(routes.material.opacity).toBeCloseTo(0.96);
    // Remain exactly two draw batches irrespective of the number of branches.
    expect(room.getObjectByName('combat-operations-live-campaign-map').children).toHaveLength(2);
    expect(room.userData.combatOperationsLiveMapNodes).toBe(map.nodes.length);
    expect(room.getObjectByName('COMBAT_MAP_pin_0').visible).toBe(false);
    expect(room.getObjectByName('COMBAT_MAP_route_0').visible).toBe(false);
    expect(room.getObjectByName('COMBAT_MAP_region_0').visible).toBe(true);
    expect(pins.castShadow).toBe(false);
    expect(routes.castShadow).toBe(false);

    dispose();
    expect(room.getObjectByName('combat-operations-live-campaign-map')).toBeUndefined();
    expect(room.getObjectByName('COMBAT_MAP_pin_0').visible).toBe(true);
    expect(room.getObjectByName('COMBAT_MAP_route_0').visible).toBe(true);
    expect(room.userData.combatOperationsLiveMap).toBeUndefined();
    expect(room.children).toHaveLength(4);
  });

  it('does not touch any other War Room or fallback without Combat anchor', () => {
    const room = new THREE.Group();
    const dispose = installCombatOperationsCampaignCartography(room, { nodes: [{ id: 'start' }] });
    expect(room.children).toHaveLength(0);
    expect(room.userData.combatOperationsLiveMap).toBeUndefined();
    dispose();
  });
});
