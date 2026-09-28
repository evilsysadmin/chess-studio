export function classicWarRoomCameraFramingProfile(aspect = 1) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const wide = safeAspect >= 1.42;

  // Immersion is now the normal desktop surface, so V1 no longer needs the
  // old ~45° selection-first pitch. Keep the crop/lens, but settle around
  // 39.5° wide: cinematic enough to show room depth while keeping pieces
  // easier to select than the lower experiment.
  return wide
    ? Object.freeze({
        version: 'classic-cinematic-v5',
        halfSpan: 5.28,
        padding: 1.04,
        minDistance: 13.2,
        maxDistance: 28,
        targetY: 1.25,
        targetZ: -0.1,
        cameraY: 8.738,
        cameraZ: 10.6,
      })
    : Object.freeze({
        version: 'classic-cinematic-v5',
        halfSpan: 5.72,
        padding: 1.12,
        minDistance: 14.4,
        maxDistance: 30,
        targetY: 0.82,
        targetZ: -0.06,
        cameraY: 9.55,
        cameraZ: 10.95,
      });
}


export function v3WarRoomCameraFramingProfile(baseProfile = {}) {
  const cameraY = Number(baseProfile.cameraY) || 0;
  const cameraZ = Number(baseProfile.cameraZ) || 1;
  const elevation = Math.atan2(cameraY, Math.abs(cameraZ)) + (2 * Math.PI / 180);
  return Object.freeze({
    ...baseProfile,
    version: 'v3-cinematic-plus-2deg-v1',
    cameraY: Math.tan(elevation) * Math.abs(cameraZ),
  });
}
