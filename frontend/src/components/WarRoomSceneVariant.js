import {
  isClassicWarRoomVariant,
  loadWarRoomVariantInstaller,
  warRoomVariantSupportsHans,
} from './WarRoomVariant.js';

export function shouldShowClassicWarRoomShell(options = {}) {
  return isClassicWarRoomVariant(options);
}

export function warRoomVariantShellCoarsePointer({
  renderLite = false,
  coarsePointer = globalThis.matchMedia?.('(pointer: coarse)')?.matches || false,
} = {}) {
  return Boolean(renderLite || coarsePointer);
}

function setClassicShellVisible(objects, visible) {
  for (const object of objects || []) {
    if (object) object.visible = visible;
  }
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === 'function');
}

function syncBlenderShadowTelemetry(scene, variant, canvas) {
  if (!canvas?.dataset || !scene?.children) return;
  const root = scene.children.find((child) => child?.userData?.warRoomVariant === variant);
  if (!root?.userData) return;
  const { userData } = root;
  const rows = [
    ['warRoomBlenderShadowCasterBudget', 'warRoomShadowCasterBudget'],
    ['warRoomBlenderShadowCasterCandidates', 'warRoomShadowCasterCandidates'],
    ['warRoomBlenderShadowProjectedCount', 'warRoomShadowProjectedCount'],
    ['warRoomBlenderShadowCasterCount', 'warRoomShadowCasterCount'],
    ['warRoomBlenderShadowWarmup', 'warRoomShadowWarmup'],
  ];
  for (const [source, target] of rows) {
    const value = userData[source];
    if (value === undefined || value === null) continue;
    canvas.dataset[target] = String(value);
  }
}

export function startWarRoomVariantScene({
  scene,
  classicShellController,
  variant,
  selectable,
  whiteSide,
  renderLite,
  canvas,
  onStatus,
  onPaint,
  loadVariantInstaller = loadWarRoomVariantInstaller,
  loadHansStage = () => import('./WarRoomHansStage.js'),
}) {
  let cancelled = false;
  let releaseShell = null;
  let releaseHans = null;
  const classicShellObjects = classicShellController?.current?.() || [];
  const ensureClassicShell = classicShellController?.ensure;
  const setStatus = (status, renderedVariant) => {
    if (canvas) {
      canvas.dataset.warRoomVariantStatus = status;
      if (renderedVariant) canvas.dataset.warRoomVariant = renderedVariant;
      if (status !== 'fallback') delete canvas.dataset.warRoomVariantError;
    }
    onStatus?.(status);
  };

  if (shouldShowClassicWarRoomShell({ selectable, variant })) {
    const visibleClassicShell = ensureClassicShell?.() || classicShellObjects;
    if (isPromiseLike(visibleClassicShell)) {
      scene.userData ||= {};
      scene.userData.warRoomRenderedVariant = 'classic-loading';
      setStatus('loading', 'classic-loading');
      onPaint?.();
      void Promise.resolve(visibleClassicShell)
        .then((objects) => {
          if (cancelled) {
            setClassicShellVisible(objects, false);
            return;
          }
          setClassicShellVisible(objects, true);
          scene.userData ||= {};
          scene.userData.warRoomRenderedVariant = 'classic';
          setStatus('idle', 'classic');
          onPaint?.();
        })
        .catch((error) => {
          if (cancelled) return;
          if (canvas) canvas.dataset.warRoomVariantError = String(error?.message || error || 'classic-shell-error').slice(0, 240);
          scene.userData ||= {};
          scene.userData.warRoomRenderedVariant = 'classic-error';
          setStatus('fallback', 'classic-fallback');
          onPaint?.();
        });
      return () => {
        cancelled = true;
        setClassicShellVisible(classicShellController?.current?.() || [], false);
      };
    }

    setClassicShellVisible(visibleClassicShell, true);
    scene.userData ||= {};
    scene.userData.warRoomRenderedVariant = 'classic';
    setStatus('idle', 'classic');
    return () => {};
  }

  // A persisted Blender-shell session must not pay the construction cost of the procedural
  // classic room. Only hide an already-built classic shell; build it lazily if
  // the user switches back or if the selected GLB fails to load.
  setClassicShellVisible(classicShellObjects, false);
  scene.userData ||= {};
  scene.userData.warRoomRenderedVariant = `${variant}-loading`;
  setStatus('loading', `${variant}-loading`);
  onPaint?.();
  const shellCoarsePointer = warRoomVariantShellCoarsePointer({ renderLite });
  const onShellRefine = () => {
    syncBlenderShadowTelemetry(scene, variant, canvas);
    onPaint?.();
  };
  void loadVariantInstaller(variant)
    .then((installShell) => installShell(scene, {
      whiteSide,
      coarsePointer: shellCoarsePointer,
      onRefine: onShellRefine,
    }))
    .then((release) => {
      if (cancelled) return release?.();
      releaseShell = release;
      syncBlenderShadowTelemetry(scene, variant, canvas);
      if (warRoomVariantSupportsHans(variant)) {
        // Hans is decorative/narrative rather than a prerequisite for board
        // interaction. Keep his sizeable stage/routine graph off the initial
        // Blender-room path and load it only after the shell itself is ready.
        if (canvas) canvas.dataset.warRoomHansStage = 'loading';
        void Promise.resolve()
          .then(() => loadHansStage())
          .then(({ installWarRoomHansVariantStage }) => {
            if (cancelled) return;
            const hans = installWarRoomHansVariantStage(scene, {
              variant,
              coarsePointer: shellCoarsePointer,
              shellRoot: scene.children.find((child) => child?.userData?.warRoomVariant === variant) || null,
            });
            if (cancelled) {
              hans.release?.();
              return;
            }
            releaseHans = hans.release;
            if (canvas) canvas.dataset.warRoomHansStage = hans.status;
            // The board requires two real paints with Hans' driver present
            // before releasing his scene dialogue. The lazy stage arrives
            // after the room's normal ready paint, so both qualifying paints
            // must be explicit here rather than relying on unrelated installer
            // side effects to trigger a second render.
            onPaint?.();
            onPaint?.();
          })
          .catch((error) => {
            if (cancelled) return;
            if (canvas) {
              canvas.dataset.warRoomHansStage = 'error';
              canvas.dataset.warRoomHansStageError = String(error?.message || error).slice(0, 200);
            }
          });
      }
      setClassicShellVisible(classicShellController?.current?.() || classicShellObjects, false);
      scene.userData ||= {};
      scene.userData.warRoomRenderedVariant = variant;
      setStatus('ready', variant);
      onPaint?.();
    })
    .catch((error) => {
      if (cancelled) return;
      if (canvas) {
        canvas.dataset.warRoomVariantError = String(error?.message || error || 'unknown-shell-error').slice(0, 240);
      }
      const fallbackClassicShell = ensureClassicShell?.() || classicShellObjects;
      const revealFallback = (objects) => {
        if (cancelled) {
          setClassicShellVisible(objects, false);
          return;
        }
        setClassicShellVisible(objects, true);
        scene.userData ||= {};
        scene.userData.warRoomRenderedVariant = 'classic';
        setStatus('fallback', 'classic-fallback');
        onPaint?.();
      };
      if (isPromiseLike(fallbackClassicShell)) {
        void Promise.resolve(fallbackClassicShell)
          .then(revealFallback)
          .catch((fallbackError) => {
            if (cancelled) return;
            if (canvas) {
              canvas.dataset.warRoomVariantError = `${canvas.dataset.warRoomVariantError || 'shell-error'}; classic: ${String(fallbackError?.message || fallbackError).slice(0, 160)}`;
            }
            scene.userData ||= {};
            scene.userData.warRoomRenderedVariant = 'classic-fallback-error';
            setStatus('fallback', 'classic-fallback');
            onPaint?.();
          });
        return;
      }
      revealFallback(fallbackClassicShell);
    });

  return () => {
    cancelled = true;
    releaseHans?.();
    releaseHans = null;
    if (canvas) {
      delete canvas.dataset.warRoomHansStage;
      delete canvas.dataset.warRoomHansStageError;
    }
    releaseShell?.();
    releaseShell = null;
    scene.userData ||= {};
    scene.userData.warRoomRenderedVariant = 'classic';
  };
}
