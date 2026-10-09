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
    },
  });
}
