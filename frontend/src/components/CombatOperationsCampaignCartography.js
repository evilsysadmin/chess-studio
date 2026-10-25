import * as THREE from 'three';
import { COMBAT_OPERATIONS_MAP_SURFACE } from '../combatOperationsMapProjection.js';

// One draw call for real route segments and one instanced batch for sector pins.
// All meshes live on the imported Combat Operations GLB and are disposed on exit.
const NODE_COLORS = Object.freeze({
  current: 0xffe7aa,
  selected: 0xbcdffc,
  available: 0xe8bf72,
  cleared: 0x93a18a,
  locked: 0x695744,
});
const EDGE_COLORS = Object.freeze({
  traversed: 0xf0cf91,
  available: 0xd7ad70,
  cleared: 0x9aab97,
  locked: 0x615044,
});

function removeDecorativeFakeObjectives(root) {
  const hidden = [];
  root.traverse((node) => {
    // These four authored objective pins and arbitrary road branches are not
    // the seeded campaign. Preserve everything else on the parchment.
    if (!/^COMBAT_MAP_(?:pin_|fort_|route_)/.test(node.name)) return;
    hidden.push([node, node.visible]);
    node.visible = false;
  });
  return () => hidden.forEach(([node, wasVisible]) => { node.visible = wasVisible; });
}

export function installCombatOperationsCampaignCartography(root, projection) {
  const anchor = root?.getObjectByName?.('COMBAT_ANCHOR_campaign_map');
  if (!anchor || !projection?.nodes?.length) return () => {};

  const restoreAuthoredDecor = removeDecorativeFakeObjectives(root);
  const overlay = new THREE.Group();
  overlay.name = 'combat-operations-live-campaign-map';
  overlay.userData.combatOperationsCartography = projection.version;

  const points = new THREE.InstancedMesh(
    // Slightly larger wax seals remain separated even in three-lane stages.
    // No extra meshes, glow pass or geometry per campaign node.
    new THREE.CircleGeometry(0.098, 22),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false }),
    projection.nodes.length,
  );
  points.name = 'combat-operations-real-sector-pins';
  points.castShadow = false;
  points.receiveShadow = false;
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < projection.nodes.length; index += 1) {
    const node = projection.nodes[index];
    const size = node.status === 'current' ? 1.38
      : node.status === 'selected' ? 1.33
        : node.status === 'available' ? 1.16
          : node.type === 'boss' ? 1.30 : 1;
    matrix.makeScale(size, size, 1);
    matrix.setPosition(node.x, node.y, COMBAT_OPERATIONS_MAP_SURFACE.nodeDepth);
    points.setMatrixAt(index, matrix);
    points.setColorAt(index, new THREE.Color(NODE_COLORS[node.status] || NODE_COLORS.locked));
  }
  points.instanceMatrix.needsUpdate = true;
  if (points.instanceColor) points.instanceColor.needsUpdate = true;
  points.userData.nodeIds = projection.nodes.map((node) => node.id);
  overlay.add(points);

  const vertices = [];
  const colors = [];
  for (const edge of projection.edges) {
    const color = new THREE.Color(EDGE_COLORS[edge.status] || EDGE_COLORS.locked);
    vertices.push(edge.from.x, edge.from.y, COMBAT_OPERATIONS_MAP_SURFACE.routeDepth);
    vertices.push(edge.to.x, edge.to.y, COMBAT_OPERATIONS_MAP_SURFACE.routeDepth);
    for (let i = 0; i < 2; i += 1) colors.push(color.r, color.g, color.b);
  }
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  edgeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const routes = new THREE.LineSegments(
    edgeGeometry,
    // Tone mapping previously dimmed the already thin route strokes. Preserve
    // the parchment's authored texture, with ink/metal contrast that survives
    // the distant briefing camera and has the same cost on mobile.
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.96, depthWrite: false, toneMapped: false }),
  );
  routes.name = 'combat-operations-real-sector-routes';
  routes.castShadow = false;
  routes.receiveShadow = false;
  overlay.add(routes);

  // Draw in GLB local coordinates: no CSS overlay, second camera or scroll
  // surface. The Blender authored anchor gates the effect to the correct room.
  root.add(overlay);
  root.userData.combatOperationsLiveMap = projection.version;
  root.userData.combatOperationsLiveMapNodes = projection.nodes.length;
  root.userData.combatOperationsLiveMapEdges = projection.edges.length;

  return () => {
    overlay.removeFromParent();
    points.geometry.dispose();
    points.material.dispose();
    routes.geometry.dispose();
    routes.material.dispose();
    restoreAuthoredDecor();
    delete root.userData.combatOperationsLiveMap;
    delete root.userData.combatOperationsLiveMapNodes;
    delete root.userData.combatOperationsLiveMapEdges;
  };
}
