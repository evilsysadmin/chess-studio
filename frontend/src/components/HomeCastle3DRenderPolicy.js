export const HOME_CASTLE_3D_MIN_WIDTH = 1000;
export const HOME_CASTLE_3D_LITE_MIN_WIDTH = 360;
export const HOME_CASTLE_3D_MOBILE_ENABLE_MIN_WIDTH = 360;

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function homeCastle3DRenderPolicy({
  viewportWidth,
  devicePixelRatio = 1,
  hardwareConcurrency = 8,
} = {}) {
  const width = finitePositive(viewportWidth, 0);
  const dpr = finitePositive(devicePixelRatio, 1);
  const cores = finitePositive(hardwareConcurrency, 8);

  const forced2d = width < HOME_CASTLE_3D_LITE_MIN_WIDTH || cores <= 2;
  const desktop = width >= HOME_CASTLE_3D_MIN_WIDTH;
  const mobileLiteEnabled = width >= HOME_CASTLE_3D_MOBILE_ENABLE_MIN_WIDTH
    && width < HOME_CASTLE_3D_MIN_WIDTH
    && cores > 4;
  const enabled = !forced2d && (desktop || mobileLiteEnabled);
  const lod = forced2d
    ? '2d'
    : (desktop && width >= 1200 && cores > 4 ? 'full' : 'lite');

  const pixelRatioCap = lod === 'full' ? 1.5 : 1.25;
  const minFrameIntervalMs = lod === 'lite' ? 1000 / 30 : 0;
  const geometrySegments = lod === 'full'
    ? Object.freeze({ width: 64, height: 36 })
    : Object.freeze({ width: 32, height: 18 });

  return Object.freeze({
    enabled,
    lod,
    pixelRatio: Math.min(dpr, pixelRatioCap),
    minFrameIntervalMs,
    geometrySegments,
    antialias: lod === 'full',
    powerPreference: lod === 'full' ? 'high-performance' : 'low-power',
  });
}
