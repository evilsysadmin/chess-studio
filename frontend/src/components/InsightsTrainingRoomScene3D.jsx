import { useEffect, useRef, useState } from 'react';
import { createThreeRenderer } from '../threeRenderer.js';
import { isSoftwareWebGLRenderer } from './WarRoom3DAnimation.js';
import {
  buildInsightsTrainingRoomStage,
  configureInsightsTrainingRoomRenderer,
  insightsTrainingRoomRendererName,
} from './InsightsTrainingRoomStage.js';
import trainingRoomStill from '../assets/insights/training-room-still.webp';

export { INSIGHTS_TRAINING_ROOM_CAMERA } from './InsightsTrainingRoomStage.js';

export default function InsightsTrainingRoomScene3D() {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const host = canvas.parentElement;
    const viewportWidth = Math.max(0, Number(globalThis.innerWidth) || host?.clientWidth || 0);
    const viewportHeight = Math.max(0, Number(globalThis.innerHeight) || host?.clientHeight || 0);

    // The room is composed as a wide study. Phones get the existing readable
    // coaching layout with a lightweight diegetic CSS backdrop instead of
    // paying for a WebGL scene that would mostly be cropped away.
    if (viewportWidth < 760 || viewportHeight < 560) {
      setStatus('fallback-mobile');
      return undefined;
    }

    let renderer;
    let stage;
    let observer;
    let onResize;

    try {
      renderer = createThreeRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });

      // A CPU rasteriser needs ~10 s for this room's first frame: show the
      // pre-rendered still of the same scene. The canvas (and its context)
      // unmounts with it; forcing a context loss here would poison a re-run
      // of this effect on the same canvas (StrictMode).
      if (isSoftwareWebGLRenderer(insightsTrainingRoomRendererName(renderer))) {
        renderer.dispose();
        renderer = undefined;
        setStatus('static');
        return undefined;
      }

      configureInsightsTrainingRoomRenderer(renderer);
      stage = buildInsightsTrainingRoomStage(renderer);

      const draw = () => {
        const rect = host.getBoundingClientRect();
        stage.render(rect.width, rect.height);
      };
      draw();

      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(draw);
        observer.observe(host);
      } else {
        onResize = draw;
        globalThis.addEventListener?.('resize', onResize);
      }

      setStatus('ready');
    } catch {
      setStatus('fallback');
    }

    return () => {
      observer?.disconnect?.();
      if (onResize) globalThis.removeEventListener?.('resize', onResize);
      stage?.dispose?.();
      renderer?.dispose?.();
    };
  }, []);

  return (
    <div
      className={`insights-training-room-3d is-${status}`}
      data-insights-training-room-3d={status}
      aria-hidden="true"
    >
      {status === 'static'
        ? <img className="insights-training-room-still" src={trainingRoomStill} alt="" decoding="async" />
        : <canvas ref={canvasRef} />}
    </div>
  );
}
