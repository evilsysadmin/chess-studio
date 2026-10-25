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

export function censusClassicWarRoomShell(roots = [], { ownerLabels = [] } = {}) {
  const visited = new Set();
  const geometries = new Set();
  const families = new Map();
  const owners = new Map();
  const ownerGeometryCosts = new Map();
  let meshNodes = 0;
  let meshInstances = 0;
  let potentialTriangles = 0;
  let uniqueTriangles = 0;

  let rootIndex = 0;
  for (const root of roots || []) {
    // V1 provides semantic labels; arbitrary roots fall back to name or index.
    const ownerName = String(ownerLabels[rootIndex]
      || root?.userData?.warRoomGeometryOwner || root?.name
      || `root-${rootIndex + 1}`);
    rootIndex++;
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
      let owner = owners.get(ownerName);
      if (!owner) {
        owner = { owner: ownerName, meshNodes: 0, meshInstances: 0,
          uniqueGeometries: 0, potentialTriangles: 0, uniqueTriangles: 0 };
        owners.set(ownerName, owner);
      }
      owner.meshNodes++;
      owner.meshInstances += instanceCount;
      owner.potentialTriangles += triangles * instanceCount;
      let family = families.get(geometryType);
      if (!family) {
        family = { geometryType, meshNodes: 0, meshInstances: 0,
          uniqueGeometries: 0, potentialTriangles: 0, uniqueTriangles: 0 };
        families.set(geometryType, family);
      }
      family.meshNodes++;
      family.meshInstances += instanceCount;
      family.potentialTriangles += triangles * instanceCount;
      // Cross owner x primitive family without another traversal. This
      // distinguishes, e.g., decorative cylinders from structural cylinders.
      const ownerGeometryKey = JSON.stringify([ownerName, geometryType]);
      let ownerGeometry = ownerGeometryCosts.get(ownerGeometryKey);
      if (!ownerGeometry) {
        ownerGeometry = { owner: ownerName, geometryType, meshNodes: 0,
          meshInstances: 0, uniqueGeometries: 0, potentialTriangles: 0,
          uniqueTriangles: 0 };
        ownerGeometryCosts.set(ownerGeometryKey, ownerGeometry);
      }
      ownerGeometry.meshNodes++;
      ownerGeometry.meshInstances += instanceCount;
      ownerGeometry.potentialTriangles += triangles * instanceCount;
      meshNodes++;
      meshInstances += instanceCount;
      potentialTriangles += triangles * instanceCount;
      if (geometry && !geometries.has(geometry)) {
        geometries.add(geometry);
        uniqueTriangles += triangles;
        family.uniqueGeometries++;
        family.uniqueTriangles += triangles;
        // First-encounter assignment preserves additivity across owners.
        owner.uniqueGeometries++;
        owner.uniqueTriangles += triangles;
        ownerGeometry.uniqueGeometries++;
        ownerGeometry.uniqueTriangles += triangles;
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
    // Each mesh belongs to its first traversed root. Shared geometries
    // are charged once for unique metrics, but all instance triangles count.
    ownerFamilies: [...owners.values()].sort(
      (left, right) => right.potentialTriangles - left.potentialTriangles
        || left.owner.localeCompare(right.owner),
    ),
    // Fine-grained hotspots: which *geometry type* dominates each V1 owner.
    // Credits unique shared geometry to the first visited owner, matching
    // ownerFamilies so all aggregate counts remain additive.
    ownerGeometryFamilies: [...ownerGeometryCosts.values()].sort(
      (left, right) => right.potentialTriangles - left.potentialTriangles
        || left.owner.localeCompare(right.owner)
        || left.geometryType.localeCompare(right.geometryType),
    ),
  };
}
