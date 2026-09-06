function setDatasetIfChanged(element, key, value) {
  if (!element?.dataset) return 0;
  const next = String(value);
  if (element.dataset[key] === next) return 0;
  element.dataset[key] = next;
  return 1;
}

function setAttributeIfChanged(element, name, value) {
  if (!element?.setAttribute) return 0;
  const next = String(value);
  if (element.getAttribute?.(name) === next) return 0;
  element.setAttribute(name, next);
  return 1;
}

export function applyWarRoomLightDiagnostics(canvas, {
  grade = 'reactive-v9',
  keyIntensity = 0,
  exposure = 0,
} = {}) {
  let writes = 0;
  writes += setDatasetIfChanged(canvas, 'warRoomLightGrade', grade);
  writes += setDatasetIfChanged(canvas, 'warRoomLightKey', Number(keyIntensity).toFixed(2));
  writes += setDatasetIfChanged(canvas, 'warRoomLightExposure', Number(exposure).toFixed(3));
  return writes;
}

export function applyWarRoomHansScreenDiagnostics({
  canvas,
  marker = null,
  screenState = 'missing',
  projected = null,
} = {}) {
  if (!canvas) return 0;
  let writes = 0;
  const visibleScreenState = screenState === 'onscreen' || screenState === 'offscreen';

  writes += setDatasetIfChanged(canvas, 'warRoomHansScreen', screenState);
  if (!canvas.dataset?.warRoomHansFirstScreen && visibleScreenState) {
    writes += setDatasetIfChanged(canvas, 'warRoomHansFirstScreen', screenState);
  }

  const x = Number(projected?.x);
  const y = Number(projected?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    writes += setDatasetIfChanged(canvas, 'warRoomHansNdcX', x.toFixed(3));
    writes += setDatasetIfChanged(canvas, 'warRoomHansNdcY', y.toFixed(3));
  }

  if (marker) {
    writes += setAttributeIfChanged(marker, 'data-war-room-hans-screen', screenState);
    if (!marker.hasAttribute?.('data-war-room-hans-first-screen') && visibleScreenState) {
      writes += setAttributeIfChanged(marker, 'data-war-room-hans-first-screen', screenState);
    }
  }

  return writes;
}
