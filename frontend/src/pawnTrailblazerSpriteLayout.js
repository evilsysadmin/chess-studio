function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

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
