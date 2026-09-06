const DESKTOP_POINT_LIGHT_KEEP_NAMES = new Set([
  'war-room-rim-light',
  'war-room-warm-light',
  'war-room-fire-light',
  'war-room-side-torch-light',
]);

function belongsToChessPiece(object) {
  let current = object;
  while (current) {
    if (current.userData?.type && current.userData?.color && current.userData?.square) return true;
    current = current.parent;
  }
  return false;
}

export function applyWarRoomPerformanceBudget(root, { coarsePointer = false } = {}) {
  const stats = {
    pointLightsKept: 0,
    pointLightsCulled: 0,
    staticShadowCastersRetired: 0,
  };
  if (!root || coarsePointer || typeof root.traverse !== 'function') return stats;

  root.traverse((object) => {
    if (object?.isPointLight) {
      if (DESKTOP_POINT_LIGHT_KEEP_NAMES.has(object.name)) {
        stats.pointLightsKept += 1;
        object.userData ||= {};
        object.userData.warRoomPerformanceLight = 'kept-real-light';
      } else {
        object.visible = false;
        object.userData ||= {};
        object.userData.warRoomPerformanceLight = 'emissive-only';
        stats.pointLightsCulled += 1;
      }
    }

    // Static decor used to participate in every directional shadow refresh even
    // though almost none of it moves. Keep real-time shadow casting for chess
    // pieces, which are created after this pass and are the only shadows the
    // player needs to read tactically. The room still receives the key light and
    // keeps all material/IBL depth.
    if (object?.isMesh && object.castShadow && !belongsToChessPiece(object)) {
      object.castShadow = false;
      object.userData ||= {};
      object.userData.warRoomStaticShadowCasterRetired = true;
      stats.staticShadowCastersRetired += 1;
    }
  });

  root.userData ||= {};
  root.userData.warRoomPerformanceBudget = 'desktop-hard-cut-v1';
  root.userData.warRoomPointLightsKept = stats.pointLightsKept;
  root.userData.warRoomPointLightsCulled = stats.pointLightsCulled;
  root.userData.warRoomStaticShadowCastersRetired = stats.staticShadowCastersRetired;
  return stats;
}

export function warRoomDesktopPointLightKeepNames() {
  return new Set(DESKTOP_POINT_LIGHT_KEEP_NAMES);
}
