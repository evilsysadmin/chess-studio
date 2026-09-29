import { useLayoutEffect, useRef } from 'react';
import {
  BOARD3D_PLAY_CORNERS,
  BOARD3D_PLAY_SURFACE_Y,
  projectWorldPointNdc,
  readBoard3DViewProjection,
} from './Board3DProjectionDiagnostics.js';

const EDGE_PAD_PX = 8;

/**
 * Pure fit: dado el ancla (px dentro del host), el tamaño del bocadillo y el
 * hueco disponible, devuelve cuánto desplazarlo para que quepa entero sin tapar
 * el HUD. La cola compensa el desplazamiento horizontal y sigue apuntando al rey.
 */
export function fitMatthiasBubble({
  anchorX,
  anchorY,
  bubbleWidth,
  bubbleHeight,
  hostWidth,
  minTop = EDGE_PAD_PX,
  maxBottom = Number.POSITIVE_INFINITY,
  pad = EDGE_PAD_PX,
}) {
  const values = [anchorX, anchorY, bubbleWidth, bubbleHeight, hostWidth, minTop];
  if (!values.every(Number.isFinite)) return { shiftX: 0, shiftY: 0 };
  const half = bubbleWidth / 2;
  const fitsWidth = bubbleWidth + pad * 2 <= hostWidth;
  const center = fitsWidth
    ? Math.min(Math.max(anchorX, pad + half), hostWidth - pad - half)
    : hostWidth / 2;
  const top = anchorY - bubbleHeight;
  // Bajar para librar el HUD, pero NUNCA por debajo del borde del tablero: un
  // bocadillo sobre las casillas se come los toques de la jugada.
  const room = Number.isFinite(maxBottom) ? Math.max(0, maxBottom - anchorY) : Number.POSITIVE_INFINITY;
  return {
    shiftX: center - anchorX,
    shiftY: top < minTop ? Math.min(minTop - top, room) : 0,
  };
}

// Chrome fijo que el bocadillo no puede tapar: HUD táctico y aviso de versión.
const TOP_CHROME_SELECTOR = '.game-3d-turn-pill, body.war-room-immersive-active .release-update-notice';

function topChromeBottomWithin(hostRect) {
  let bottom = EDGE_PAD_PX;
  for (const node of document.querySelectorAll(TOP_CHROME_SELECTOR)) {
    const rect = node.getBoundingClientRect();
    if (!rect.height || rect.top > hostRect.top + hostRect.height / 2) continue;
    bottom = Math.max(bottom, rect.bottom - hostRect.top + EDGE_PAD_PX);
  }
  return bottom;
}

// Borde superior del tablero renderizado (proyección real publicada por Board3D).
function boardTopWithin(host, hostRect) {
  const canvas = host.querySelector('.board3d-main-canvas');
  const elements = readBoard3DViewProjection(canvas);
  if (!elements) return Number.POSITIVE_INFINITY;
  const ys = BOARD3D_PLAY_CORNERS
    .map(([x, z]) => projectWorldPointNdc(elements, [x, BOARD3D_PLAY_SURFACE_Y, z]))
    .filter(Boolean)
    .map((ndc) => ndc.y);
  if (ys.length !== 4) return Number.POSITIVE_INFINITY;
  const canvasRect = canvas.getBoundingClientRect();
  const clientY = canvasRect.top + ((1 - Math.max(...ys)) / 2) * canvasRect.height;
  return clientY - hostRect.top - EDGE_PAD_PX;
}

/**
 * Código Rojo GP-3 (#34): el bocadillo de Matthias nace sobre su rey, pero en un
 * teléfono vertical el rey suele estar pegado al borde y el bocadillo se salía de
 * pantalla o tapaba el HUD. Medimos tras el layout y aplicamos el desplazamiento
 * mediante variables CSS (el transform/keyframes las consumen).
 */
export default function useMatthiasBubbleFit(host, deps) {
  const bubbleRef = useRef(null);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble || !host) return undefined;

    const fit = () => {
      const hostRect = host.getBoundingClientRect();
      const left = Number.parseFloat(bubble.style.left);
      const top = Number.parseFloat(bubble.style.top);
      const { shiftX, shiftY } = fitMatthiasBubble({
        anchorX: (left / 100) * hostRect.width,
        anchorY: (top / 100) * hostRect.height,
        bubbleWidth: bubble.offsetWidth,
        bubbleHeight: bubble.offsetHeight,
        hostWidth: hostRect.width,
        minTop: topChromeBottomWithin(hostRect),
        maxBottom: boardTopWithin(host, hostRect),
      });
      bubble.style.setProperty('--matthias-bubble-shift-x', `${shiftX.toFixed(1)}px`);
      bubble.style.setProperty('--matthias-bubble-shift-y', `${shiftY.toFixed(1)}px`);
      bubble.dataset.matthiasBubbleDetached = shiftY > 0 ? 'true' : 'false';
    };

    let frame = 0;
    const scheduleFit = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; fit(); });
    };
    fit();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleFit) : null;
    observer?.observe(bubble);
    observer?.observe(host);
    // El aviso de versión puede montarse después (deploy durante la partida).
    const chromeObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(scheduleFit) : null;
    chromeObserver?.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      chromeObserver?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, ...deps]);

  return bubbleRef;
}
