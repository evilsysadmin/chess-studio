import {
  isClassicWarRoomVariant,
  loadWarRoomVariantInstaller,
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

export function warRoomVariantHostsHans(variant) {
  return variant === 'v2' || variant === 'v3' || variant === 'v4';
}

export function startWarRoomVariantScene({
  scene, classicShellController, variant, selectable, whiteSide, renderLite, canvas, onStatus, onPaint,
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
  void loadWarRoomVariantInstaller(variant)
    .then((installShell) => installShell(scene, {
      whiteSide,
      coarsePointer: shellCoarsePointer,
      onRefine: onPaint,
    }))
    .then((release) => {
      if (cancelled) return release?.();
      releaseShell = release;
      setClassicShellVisible(classicShellController?.current?.() || classicShellObjects, false);
      scene.userData ||= {};
      scene.userData.warRoomRenderedVariant = variant;
      setStatus('ready', variant);
      onPaint?.();

      if (warRoomVariantHostsHans(variant)) {
        // The room is already visible and marked ready. Hans is ambient flavor,
        // so load his stage afterwards instead of making the first War Room
        // paint pay for the whole actor/service graph.
        void import('./WarRoomHansStage.js')
          .then(({ installWarRoomHansVariantStage }) => {
            if (cancelled) return;
            try {
              const hans = installWarRoomHansVariantStage(scene, {
                variant,
                coarsePointer: shellCoarsePointer,
                shellRoot: scene.children.find((child) => child?.userData?.warRoomVariant === variant) || null,
              });
              if (cancelled) return hans.release?.();
              releaseHans = hans.release;
              if (canvas) canvas.dataset.warRoomHansStage = hans.status;
              // Hans' fire-call narrative needs one paint after his driver lands.
              onPaint?.();
            } catch (error) {
              if (canvas) canvas.dataset.warRoomHansStageError = String(error?.message || error).slice(0, 200);
            }
          })
          .catch((error) => {
            if (!cancelled && canvas) {
              canvas.dataset.warRoomHansStageError = String(error?.message || error || 'hans-stage-load-error').slice(0, 200);
            }
          });
      }
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
