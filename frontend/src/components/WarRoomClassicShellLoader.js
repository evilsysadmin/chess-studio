import { censusClassicWarRoomShell } from './WarRoomClassicGeometryCensus.js';

export function createLazyClassicWarRoomShellController(
  buildOptions = {},
  {
    eager = false,
    loadModule = () => import('./WarRoomClassicShell.js'),
    onBuilt,
    isActive = () => true,
  } = {},
) {
  let objects = [];
  let built = false;
  let pending = null;
  let disposed = false;

  const ensure = () => {
    if (built || disposed) return objects;
    if (!pending) {
      pending = Promise.resolve()
        .then(() => loadModule())
        .then((module) => {
          if (disposed || !isActive()) {
            disposed = true;
            return objects;
          }
          const result = module.buildClassicWarRoomShell(buildOptions);
          objects = Array.isArray(result) ? result : result?.classicShellObjects || [];
          built = true;
          onBuilt?.(objects);
          return objects;
        })
        .catch((error) => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };

  if (eager) void Promise.resolve(ensure()).catch(() => {});

  return {
    ensure,
    current: () => objects,
    isBuilt: () => built,
    isLoading: () => Boolean(pending && !built && !disposed),
    isDisposed: () => disposed,
    dispose: () => { disposed = true; },
  };
}

export function classicShellModuleKind({ classroom = false } = {}) {
  return classroom ? 'school-room-dedicated-v1' : 'war-room-classic-v1';
}

export function createClassicWarRoomShellController(
  { canvas = null, ...buildOptions } = {},
  eager = false,
  { loadModule } = {},
) {
  if (canvas?.dataset) {
    canvas.dataset.schoolRoomScene = 'off';
    canvas.dataset.classicShellModule = classicShellModuleKind(buildOptions);
  }
  const resolvedLoadModule = loadModule || (() => (
    buildOptions.classroom
      ? import('./SchoolRoomClassicShell.js')
      : import('./WarRoomClassicShell.js')
  ));
  return createLazyClassicWarRoomShellController(buildOptions, {
    eager,
    loadModule: resolvedLoadModule,
    isActive: () => !canvas || canvas.isConnected !== false,
    onBuilt: (objects) => {
      if (!canvas?.dataset) return;
      canvas.dataset.schoolRoomScene = objects.find((object) => object?.userData?.schoolRoomCanonical)?.userData?.schoolRoomSceneVersion || 'off';
      // A one-shot geometry census of V1, separate from GLB metrics for V2-4.
      // No per-frame traversal, GPU timing, draw-call or FPS claims.
      if (!buildOptions.classroom) {
        const census = censusClassicWarRoomShell(objects);
        canvas.dataset.warRoomClassicMeshNodes = String(census.meshNodes);
        canvas.dataset.warRoomClassicMeshInstances = String(census.meshInstances);
        canvas.dataset.warRoomClassicUniqueGeometries = String(census.uniqueGeometries);
        canvas.dataset.warRoomClassicPotentialTriangles = String(census.potentialTriangles);
        canvas.dataset.warRoomClassicUniqueTriangles = String(census.uniqueTriangles);
      }
    },
  });
}
