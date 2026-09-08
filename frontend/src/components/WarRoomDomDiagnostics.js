import { hansInitialReplyPointReached } from './WarRoomHansFireCallContract.js';

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
  const x = Number(projected?.x);
  const y = Number(projected?.y);
  const waitingForInitialReply = canvas.dataset?.warRoomHansNarrativePhase === 'await-hans';
  const replyReady = hansInitialReplyPointReached({
    hansScreen: screenState,
    route: canvas.dataset?.warRoomHansRoute || '',
    logicalX: canvas.dataset?.warRoomHansLogicalX,
  });
  const effectiveScreenState = waitingForInitialReply && screenState === 'onscreen' && !replyReady
    ? 'edge'
    : screenState;
  const visibleScreenState = effectiveScreenState === 'onscreen'
    || effectiveScreenState === 'offscreen'
    || effectiveScreenState === 'edge';

  writes += setDatasetIfChanged(canvas, 'warRoomHansScreen', effectiveScreenState);
  if (!canvas.dataset?.warRoomHansFirstScreen && visibleScreenState) {
    writes += setDatasetIfChanged(canvas, 'warRoomHansFirstScreen', effectiveScreenState);
  }

  if (Number.isFinite(x) && Number.isFinite(y)) {
    writes += setDatasetIfChanged(canvas, 'warRoomHansNdcX', x.toFixed(3));
    writes += setDatasetIfChanged(canvas, 'warRoomHansNdcY', y.toFixed(3));
  }

  if (marker) {
    writes += setAttributeIfChanged(marker, 'data-war-room-hans-runtime', visibleScreenState ? 'visible' : effectiveScreenState);
    writes += setAttributeIfChanged(marker, 'data-war-room-hans-screen', effectiveScreenState);
    if (!marker.hasAttribute?.('data-war-room-hans-first-screen') && visibleScreenState) {
      writes += setAttributeIfChanged(marker, 'data-war-room-hans-first-screen', effectiveScreenState);
    }
  }

  return writes;
}