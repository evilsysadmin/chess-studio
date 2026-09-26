import {
  isClassicWarRoomVariant,
  isWarRoomVariantSelectable,
  loadWarRoomVariant,
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

export function startWarRoomVariantScene({
  scene, classicShellController, variant, selectable, whiteSide, renderLite, canvas, onStatus, onPaint,
}) {
  let cancelled = false;
  let releaseShell = null;
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
    setClassicShellVisible(visibleClassicShell, true);
    scene.userData ||= {};
    scene.userData.warRoomRenderedVariant = 'classic';
    setStatus('idle', 'classic');
    onPaint?.();
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
      setClassicShellVisible(classicShellObjects, false);
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
      setClassicShellVisible(fallbackClassicShell, true);
      scene.userData ||= {};
      scene.userData.warRoomRenderedVariant = 'classic';
      setStatus('fallback', 'classic-fallback');
      onPaint?.();
    });

  return () => {
    cancelled = true;
    releaseShell?.();
    releaseShell = null;
    scene.userData ||= {};
    scene.userData.warRoomRenderedVariant = 'classic';
  };
}
