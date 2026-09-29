import { useEffect, useMemo, useRef, useState } from 'react';
import { projectMatthiasKingAnchor, projectMatthiasKingAnchorWithCamera } from './Matthias3DBubbleAnchor.js';
import {
  BOARD3D_PROJECTION_EVENT,
  projectWorldPointNdc,
  readBoard3DViewProjection,
} from './Board3DProjectionDiagnostics.js';

function sameAnchor(current, next) {
  if (current === next) return true;
  if (!current || !next) return false;
  return current.square === next.square
    && Math.abs(current.left - next.left) < 0.02
    && Math.abs(current.top - next.top) < 0.02;
}

export default function useMatthias3DBubbleAnchor({
  fen,
  matthiasKingColor,
  orientation = 'white',
  enabled = false,
} = {}) {
  const stageRef = useRef(null);
  const [anchor, setAnchor] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setAnchor(null);
      return undefined;
    }

    const stage = stageRef.current;
    if (!stage) return undefined;
    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = stage.getBoundingClientRect();
      // Preferimos la cámara real publicada por Board3D; el modelo local sólo
      // cubre el primer frame, antes de que el renderer haya pintado.
      const canvas = stage.querySelector('.board3d-main-canvas');
      const elements = readBoard3DViewProjection(canvas);
      const fromCamera = elements ? projectMatthiasKingAnchorWithCamera({
        fen,
        matthiasKingColor,
        elements,
        canvasRect: canvas.getBoundingClientRect(),
        stageRect: rect,
        projectPoint: projectWorldPointNdc,
      }) : null;
      const next = fromCamera || projectMatthiasKingAnchor({
        fen,
        matthiasKingColor,
        orientation,
        width: rect.width,
        height: rect.height,
        coarsePointer: Boolean(window.matchMedia?.('(pointer: coarse)')?.matches),
        viewportWidth: Number(window.innerWidth) || rect.width,
      });
      setAnchor((current) => sameAnchor(current, next) ? current : next);
    };

    const scheduleUpdate = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    update();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleUpdate)
      : null;
    observer?.observe(stage);
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    stage.addEventListener(BOARD3D_PROJECTION_EVENT, scheduleUpdate);

    return () => {
      stage.removeEventListener(BOARD3D_PROJECTION_EVENT, scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [enabled, fen, matthiasKingColor, orientation]);

  const bubbleStyle = useMemo(() => anchor ? {
    left: `${anchor.left.toFixed(3)}%`,
    top: `${anchor.top.toFixed(3)}%`,
    right: 'auto',
  } : null, [anchor]);

  return {
    stageRef,
    bubbleStyle,
    trackedSquare: anchor?.square || null,
  };
}
