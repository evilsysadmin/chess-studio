/**
 * Offline-ish, one-shot metadata census after the procedural V1 scene builds.
 * Intentionally does not estimate draw calls, frame-time, or the GPU's actual
 * triangles after clipping, LOD, instancing, shadows or visibility decisions.
 */
function trianglesPerMesh(geometry) {
  if (!geometry) return 0;
  const count = geometry.index?.count ?? geometry.attributes?.position?.count ?? 0;
  return Number.isFinite(count) && count >= 0 ? Math.floor(count / 3) : 0;
}

export function censusClassicWarRoomShell(roots = []) {
  const visited = new Set();
  const geometries = new Set();
  const families = new Map();
  let meshNodes = 0;
  let meshInstances = 0;
  let potentialTriangles = 0;
  let uniqueTriangles = 0;

  for (const root of roots || []) {
    if (typeof root?.traverse !== 'function') continue;
    root.traverse((object) => {
      if (!object?.isMesh || visited.has(object)) return;
      visited.add(object);
      const geometry = object.geometry;
      const instanceCount = object.isInstancedMesh
        ? Math.max(0, Math.floor(Number(object.count) || 0))
        : 1;
      const triangles = trianglesPerMesh(geometry);
      const geometryType = String(geometry?.type || 'UnknownGeometry');
      let family = families.get(geometryType);
      if (!family) {
        family = { geometryType, meshNodes: 0, meshInstances: 0,
          uniqueGeometries: 0, potentialTriangles: 0, uniqueTriangles: 0 };
        families.set(geometryType, family);
      }
      family.meshNodes++;
      family.meshInstances += instanceCount;
      family.potentialTriangles += triangles * instanceCount;
      meshNodes++;
      meshInstances += instanceCount;
      potentialTriangles += triangles * instanceCount;
      if (geometry && !geometries.has(geometry)) {
        geometries.add(geometry);
        uniqueTriangles += triangles;
        family.uniqueGeometries++;
        family.uniqueTriangles += triangles;
      }
    });
  }
  return {
    meshNodes,
    meshInstances,
    uniqueGeometries: geometries.size,
    potentialTriangles,
    uniqueTriangles,
    // Stable, one-shot V1 provenance by geometry family. Potential triangles
    // are not an FPS/draw/shadow metric. Does not traverse every frame.
    geometryFamilies: [...families.values()].sort(
      (left, right) => right.potentialTriangles - left.potentialTriangles
        || left.geometryType.localeCompare(right.geometryType),
    ),
  };
}
