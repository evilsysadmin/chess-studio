export const HOME_CASTLE_3D_MIN_WIDTH = 1000;
export const HOME_CASTLE_3D_LITE_MIN_WIDTH = 360;
export const HOME_CASTLE_3D_MOBILE_ENABLE_MIN_WIDTH = 360;

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function cappedLod(baselineLod, runtimeLodCap) {
  if (runtimeLodCap === '2d') return '2d';
  if (runtimeLodCap === 'lite' && baselineLod === 'full') return 'lite';
  return baselineLod;
}

export function homeCastle3DRenderPolicy({
  viewportWidth,
  devicePixelRatio = 1,
  hardwareConcurrency = 8,
  runtimeLodCap = null,
} = {}) {
  const width = finitePositive(viewportWidth, 0);
  const dpr = finitePositive(devicePixelRatio, 1);
  const cores = finitePositive(hardwareConcurrency, 8);

  const forced2d = width < HOME_CASTLE_3D_LITE_MIN_WIDTH || cores <= 2;
  const desktop = width >= HOME_CASTLE_3D_MIN_WIDTH;
  const mobileLiteEnabled = width >= HOME_CASTLE_3D_MOBILE_ENABLE_MIN_WIDTH
    && width < HOME_CASTLE_3D_MIN_WIDTH
    && cores > 4;
  const baselineEnabled = !forced2d && (desktop || mobileLiteEnabled);
  const baselineLod = forced2d
    ? '2d'
    : (desktop && width >= 1200 && cores > 4 ? 'full' : 'lite');
  const lod = cappedLod(baselineLod, runtimeLodCap);
  const enabled = baselineEnabled && lod !== '2d';

  // Full desktop may use the real display DPR up to 2x. The canonical master is
  // now 1814px wide rather than the old 800px thumbnail, so a HiDPI canvas no
  // longer magnifies a tiny source before compositing it back to CSS pixels.
  const pixelRatioCap = lod === 'full' ? 2 : 1.25;
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

// A cap only ever tightens: full -> lite -> 2d, never back.
export function tighterRuntimeLodCap(current, next) {
  if (current === '2d' || next === current) return current;
  if (next === '2d') return '2d';
  if (next === 'lite' && current == null) return 'lite';
  return current;
}
