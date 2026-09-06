const DESKTOP_POINT_LIGHT_KEEP_NAMES = new Set([
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
    spotLightsCulled: 0,
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
    } else if (object?.isSpotLight) {
      // The premium group historically stacked two museum spot keys on top of
      // torch/fire/global light. Their job is already covered by the bright
      // emissive torch halos and the global key, while every extra forward light
      // expands the PBR shader cost for the whole room.
      object.visible = false;
      object.userData ||= {};
      object.userData.warRoomPerformanceLight = 'global-key-covered';
      stats.spotLightsCulled += 1;
    }

    // Static decor used to participate in every directional shadow refresh even
    // though almost none of it moves. Keep real-time shadow casting for chess
    // pieces, which are built outside this premium-decor group. The room still
    // receives the key light and keeps all material/IBL depth.
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
  root.userData.warRoomSpotLightsCulled = stats.spotLightsCulled;
  root.userData.warRoomStaticShadowCastersRetired = stats.staticShadowCastersRetired;
  return stats;
}

export function warRoomDesktopPointLightKeepNames() {
  return new Set(DESKTOP_POINT_LIGHT_KEEP_NAMES);
}
