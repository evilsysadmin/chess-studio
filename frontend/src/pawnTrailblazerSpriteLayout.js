function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

// Fit artwork inside a world-space box without ever stretching it. Before an
// image reports native dimensions the target box itself is the deterministic
// fallback; once loaded, the same helper preserves the real aspect ratio.
export function trailSpriteScale({
  imageWidth,
  imageHeight,
  targetHeight,
  maxWidth,
}) {
  const heightLimit = positive(targetHeight, 1);
  const widthLimit = positive(maxWidth, heightLimit);
  const width = positive(imageWidth, widthLimit);
  const height = positive(imageHeight, heightLimit);
  const aspect = width / height;

  let fittedHeight = heightLimit;
  let fittedWidth = fittedHeight * aspect;
  if (fittedWidth > widthLimit) {
    fittedWidth = widthLimit;
    fittedHeight = fittedWidth / aspect;
  }

  return Object.freeze({
    width: fittedWidth,
    height: fittedHeight,
  });
}
