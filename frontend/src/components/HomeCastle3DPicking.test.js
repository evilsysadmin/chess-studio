import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HOME_CASTLE_PICKABLE_DESTINATIONS,
  homeCastleDestinationFromIntersections,
  homeCastlePickableGroups,
} from './HomeCastle3DPicking.js';

function destinationGroup(destination) {
  const group = new THREE.Group();
  group.userData.destination = destination;
  const nested = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  nested.add(mesh);
  group.add(nested);
  return { group, mesh };
}

describe('HomeCastle3DPicking', () => {
  it('limits direct mesh picking to the primary object-led destinations', () => {
    const tournament = destinationGroup('tournament').group;
    const combat = destinationGroup('combat').group;
    const play = destinationGroup('play').group;
    const train = destinationGroup('train').group;

    expect(HOME_CASTLE_PICKABLE_DESTINATIONS).toEqual(['tournament', 'combat', 'play']);
    expect(homeCastlePickableGroups({ tournament, combat, play, train })).toEqual([
      tournament,
      combat,
      play,
    ]);
  });

  it('resolves a nested GLB mesh back to its diegetic destination group', () => {
    const tournament = destinationGroup('tournament');
    expect(homeCastleDestinationFromIntersections([
      { object: tournament.mesh, distance: 0.2 },
    ])).toBe('tournament');
  });

  it('uses the nearest supported intersection and ignores unrelated scene meshes', () => {
    const unrelated = destinationGroup('train');
    const combat = destinationGroup('combat');

    expect(homeCastleDestinationFromIntersections([
      { object: unrelated.mesh, distance: 0.1 },
      { object: combat.mesh, distance: 0.2 },
    ])).toBe('combat');
    expect(homeCastleDestinationFromIntersections([{ object: unrelated.mesh }])).toBeNull();
    expect(homeCastleDestinationFromIntersections([])).toBeNull();
  });
});
