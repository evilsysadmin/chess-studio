export const CHRONICLES_MINIMUM_VISIBILITY = Object.freeze({
  firstPerson: Object.freeze({
    ambientDesktop: 0.68,
    ambientCoarse: 0.76,
    exposureDesktop: 1.0,
    exposureCoarse: 1.06,
  }),
  isometric: Object.freeze({
    exposure: 1.04,
    hemi: 1.06,
    fill: 1.08,
    bounce: 0.98,
  }),
});

function finiteOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function chroniclesReadableIsometricLighting(lighting = {}) {
  const minimum = CHRONICLES_MINIMUM_VISIBILITY.isometric;
  return Object.freeze({
    exposure: Math.max(minimum.exposure, finiteOr(lighting.exposure, 1)),
    hemi: Math.max(minimum.hemi, finiteOr(lighting.hemi, 1)),
    fill: Math.max(minimum.fill, finiteOr(lighting.fill, 1)),
    bounce: Math.max(minimum.bounce, finiteOr(lighting.bounce, 1)),
  });
}
