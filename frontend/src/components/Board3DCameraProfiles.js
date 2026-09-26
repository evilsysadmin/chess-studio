export function classicWarRoomCameraFramingProfile(aspect = 1) {
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  const wide = safeAspect >= 1.42;

  // V1 prioritises piece separation and click readability over showing as much
  // wall as possible. Keep the long desktop lens, but raise the eyeline so the
  // board reads more like a playable surface and less like a low cinematic shot.
  // v3 adds only ~1.8° more pitch on wide desktop to separate piece bases a bit
  // better without turning the composition into a top-down board view.
  return wide
    ? Object.freeze({
        version: 'classic-overhead-v3',
        halfSpan: 5.46,
        padding: 1.07,
        minDistance: 13.2,
        maxDistance: 28,
        targetY: 1.25,
        targetZ: -0.1,
        cameraY: 9.55,
        cameraZ: 9.3,
      })
    : Object.freeze({
        version: 'classic-overhead-v3',
        halfSpan: 5.72,
        padding: 1.12,
        minDistance: 14.4,
        maxDistance: 30,
        targetY: 0.82,
        targetZ: -0.06,
        cameraY: 10.2,
        cameraZ: 10.35,
      });
}
