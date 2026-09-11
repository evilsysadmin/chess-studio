export const WAR_ROOM_SCENE_BUDGET_VERSION = 'scene-graph-ratchet-v1';

export const WAR_ROOM_SCENE_BUDGETS = Object.freeze({
  desktop: Object.freeze({
    objects: 700,
    meshes: 500,
    lights: 8,
    materials: 280,
    geometries: 420,
    renderHooks: 48,
  }),
  mobile: Object.freeze({
    objects: 560,
    meshes: 380,
    lights: 12,
    materials: 230,
    geometries: 330,
    renderHooks: 36,
  }),
});

export function censusWarRoomScene(root) {
  const materials = new Set();
  const geometries = new Set();
  const census = {
    objects: 0,
    meshes: 0,
    instancedMeshes: 0,
    instances: 0,
    lights: 0,
    materials: 0,
    geometries: 0,
    renderHooks: 0,
  };

  root?.traverse?.((object) => {
    census.objects += 1;
    if (object?.isMesh) census.meshes += 1;
    if (object?.isInstancedMesh) {
      census.instancedMeshes += 1;
      census.instances += Math.max(0, Number(object.count) || 0);
    }
    if (object?.isLight) census.lights += 1;
    if (typeof object?.onBeforeRender === 'function' && object.onBeforeRender.length >= 0) census.renderHooks += 1;
    if (typeof object?.onAfterRender === 'function' && object.onAfterRender.length >= 0) census.renderHooks += 1;
    if (object?.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object?.material) ? object.material : [object?.material];
    for (const material of list) if (material) materials.add(material);
  });

  census.materials = materials.size;
  census.geometries = geometries.size;
  return census;
}

export function warRoomSceneBudgetIssues(census, profile = 'desktop') {
  const budget = WAR_ROOM_SCENE_BUDGETS[profile] || WAR_ROOM_SCENE_BUDGETS.desktop;
  const issues = [];
  for (const key of ['objects', 'meshes', 'lights', 'materials', 'geometries', 'renderHooks']) {
    const actual = Math.max(0, Number(census?.[key]) || 0);
    if (actual > budget[key]) issues.push(`${key}: ${actual} > ${budget[key]}`);
  }
  return issues;
}
