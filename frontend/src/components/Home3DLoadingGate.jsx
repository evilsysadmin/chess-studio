import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { home3DFrameReady } from './Home3DReadiness.js';
import './Home3DLoadingGate.css';

// No wrapper is inserted inside the illustrated stage: existing canvas/art
// adjacent-sibling selectors and diegetic click targets must keep working.
export default function Home3DLoadingGate({ stageRef, onUseStaticHome }) {
  const [ready, setReady] = useState(false);
  const [stalled, setStalled] = useState(false);
  const visibleRef = useRef(false);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let cancelled = false;
    let pending = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const cancelFrames = () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      firstFrame = 0;
      secondFrame = 0;
    };
    const inspect = () => {
      if (!home3DFrameReady(stage)) {
        cancelFrames();
        pending = false;
        if (visibleRef.current) {
          visibleRef.current = false;
          setReady(false);
        }
        return;
      }
      if (pending || visibleRef.current) return;
      pending = true;
      // First frame was drawn by Three; let the browser composite it before
      // exposing the hall, without keeping LOADING for an arbitrary duration.
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          if (cancelled) return;
          if (!home3DFrameReady(stage)) {
            pending = false;
            return;
          }
          visibleRef.current = true;
          setReady(true);
          setStalled(false);
        });
      });
    };
    const observer = new MutationObserver(inspect);
    observer.observe(stage, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-home-blender-runtime'],
    });
    const timeout = window.setTimeout(() => {
      if (!visibleRef.current) setStalled(true);
    }, 30_000);
    inspect();
    return () => {
      cancelled = true;
      observer.disconnect();
      cancelFrames();
      window.clearTimeout(timeout);
    };
  }, [stageRef]);

  if (ready || typeof document === 'undefined') return null;
  return createPortal(
    <div className="route-loading home-3d-loading" role="status" aria-live="polite" data-home-loading="waiting-for-frame">
      <span>LOADING</span>
      {stalled && (
        <div className="home-3d-loading__recovery">
          <span>El castillo está tardando demasiado en prepararse.</span>
          <button type="button" className="secondary-btn" onClick={onUseStaticHome}>Entrar con la imagen del castillo</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
