import { useEffect, useMemo, useRef, useState } from 'react';
import { projectMatthiasKingAnchor } from './Matthias3DBubbleAnchor.js';

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
      const next = projectMatthiasKingAnchor({
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

    return () => {
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
