export const PAWN_SLUG_ENEMY_VISUAL_EVIDENCE = Object.freeze({
  alphaThreshold: 16,
  minOpaqueRatio: 0.002,
  sampleMaxWidth: 256,
  sampleMaxHeight: 128,
  canonicalSegments: 6,
  fallbackSegments: 3,
});

function safeDimension(value) {
  const number = Math.floor(Number(value) || 0);
  return number > 0 ? number : 0;
}

export function pawnSlugEnemyAlphaCoverage(
  rgba,
  width,
  height,
  { axis = 'all', segments = 1, alphaThreshold = PAWN_SLUG_ENEMY_VISUAL_EVIDENCE.alphaThreshold } = {},
) {
  const safeWidth = safeDimension(width);
  const safeHeight = safeDimension(height);
  const safeSegments = Math.max(1, Math.floor(Number(segments) || 1));
  const totalPixels = safeWidth * safeHeight;
  if (!rgba || totalPixels <= 0 || rgba.length < totalPixels * 4) {
    return Object.freeze({ overall: 0, minSegment: 0, segments: Object.freeze([]) });
  }

  const opaqueBySegment = new Array(safeSegments).fill(0);
  const pixelsBySegment = new Array(safeSegments).fill(0);
  let opaque = 0;

  for (let y = 0; y < safeHeight; y += 1) {
    for (let x = 0; x < safeWidth; x += 1) {
      const pixel = y * safeWidth + x;
      const alpha = rgba[pixel * 4 + 3];
      let segment = 0;
      if (axis === 'x') segment = Math.min(safeSegments - 1, Math.floor((x / safeWidth) * safeSegments));
      else if (axis === 'y') segment = Math.min(safeSegments - 1, Math.floor((y / safeHeight) * safeSegments));
      pixelsBySegment[segment] += 1;
      if (alpha >= alphaThreshold) {
        opaque += 1;
        opaqueBySegment[segment] += 1;
      }
    }
  }

  const segmentCoverage = opaqueBySegment.map((count, index) => (
    pixelsBySegment[index] > 0 ? count / pixelsBySegment[index] : 0
  ));
  return Object.freeze({
    overall: opaque / totalPixels,
    minSegment: Math.min(...segmentCoverage),
    segments: Object.freeze(segmentCoverage),
  });
}

export function inspectPawnSlugEnemyImage(
  image,
  {
    axis = 'all',
    segments = 1,
    documentRef = typeof document !== 'undefined' ? document : null,
  } = {},
) {
  const width = safeDimension(image?.naturalWidth || image?.videoWidth || image?.width);
  const height = safeDimension(image?.naturalHeight || image?.videoHeight || image?.height);
  if (!width || !height) {
    return Object.freeze({ checked: true, opaque: false, reason: 'missing-dimensions', overall: 0, minSegment: 0 });
  }
  if (!documentRef?.createElement) {
    return Object.freeze({ checked: false, opaque: true, reason: 'probe-unavailable', overall: null, minSegment: null });
  }

  try {
    const scale = Math.min(
      1,
      PAWN_SLUG_ENEMY_VISUAL_EVIDENCE.sampleMaxWidth / width,
      PAWN_SLUG_ENEMY_VISUAL_EVIDENCE.sampleMaxHeight / height,
    );
    const sampleWidth = Math.max(1, Math.round(width * scale));
    const sampleHeight = Math.max(1, Math.round(height * scale));
    const canvas = documentRef.createElement('canvas');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext?.('2d', { willReadFrequently: true });
    if (!context?.drawImage || !context?.getImageData) {
      return Object.freeze({ checked: false, opaque: true, reason: 'probe-unavailable', overall: null, minSegment: null });
    }
    context.clearRect?.(0, 0, sampleWidth, sampleHeight);
    context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
    const rgba = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const coverage = pawnSlugEnemyAlphaCoverage(rgba, sampleWidth, sampleHeight, { axis, segments });
    const minimum = PAWN_SLUG_ENEMY_VISUAL_EVIDENCE.minOpaqueRatio;
    const opaque = coverage.overall >= minimum && coverage.minSegment >= minimum;
    return Object.freeze({
      checked: true,
      opaque,
      reason: opaque ? 'opaque-pixels' : 'transparent-source',
      overall: coverage.overall,
      minSegment: coverage.minSegment,
    });
  } catch {
    // Rendering must remain fail-open on browsers that prohibit canvas readback.
    // The browser smoke remains fail-closed because unverified evidence is not
    // published as a live enemy visual contract.
    return Object.freeze({ checked: false, opaque: true, reason: 'probe-failed', overall: null, minSegment: null });
  }
}
