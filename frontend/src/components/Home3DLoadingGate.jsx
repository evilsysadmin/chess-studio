import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { home3DFrameReady } from './Home3DReadiness.js';
import './Home3DLoadingGate.css';

// No wrapper is inserted inside the illustrated stage: existing canvas/art
// adjacent-sibling selectors and diegetic click targets must keep working.
export default function Home3DLoadingGate({ stageRef, onUseStaticHome, onHomeAvailable }) {
  const [ready, setReady] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const visibleRef = useRef(false);
  const onUseStaticHomeRef = useRef(onUseStaticHome);
  onUseStaticHomeRef.current = onUseStaticHome;
  const onHomeAvailableRef = useRef(onHomeAvailable);
  onHomeAvailableRef.current = onHomeAvailable;

  // The stage belongs to a parent host element. Child layout effects can run
  // before React attaches that parent's ref; passive effects run after commit.
  // The portal already masks the viewport from the first paint.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let cancelled = false;
    let pending = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let helpTimer = 0;
    let fallbackTimer = 0;
    const showIllustration = () => {
      if (cancelled || visibleRef.current) return;
      stage.dataset.home3dPreview = 'painted';
      setPreviewing(true);
      onHomeAvailableRef.current?.();
    };
    const clearRecovery = () => {
      window.clearTimeout(helpTimer);
      window.clearTimeout(fallbackTimer);
      helpTimer = 0;
      fallbackTimer = 0;
    };
    const armRecovery = () => {
      if (fallbackTimer) return;
      // On a slow GPU users may immediately choose the pre-decoded illustration;
      // the same recovery applies after a later WebGL context loss.
      helpTimer = window.setTimeout(showIllustration, 6_000);
      fallbackTimer = window.setTimeout(() => {
        if (!visibleRef.current) onUseStaticHomeRef.current?.();
      }, 30_000);
    };
    const cancelFrames = () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      firstFrame = 0;
      secondFrame = 0;
    };
    const inspect = () => {
      if (!home3DFrameReady(stage)) {
        armRecovery();
        cancelFrames();
        pending = false;
        if (visibleRef.current) {
          visibleRef.current = false;
          setReady(false);
          showIllustration();
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
          delete stage.dataset.home3dPreview;
          setReady(true);
          setPreviewing(false);
          onHomeAvailableRef.current?.();
          clearRecovery();
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
    armRecovery();
    inspect();
    return () => {
      cancelled = true;
      observer.disconnect();
      cancelFrames();
      clearRecovery();
      delete stage.dataset.home3dPreview;
    };
  }, [stageRef]);

  if (ready || previewing || typeof document === 'undefined') return null;
  return createPortal(
    <div className="route-loading home-3d-loading" role="status" aria-live="polite" data-home-loading="waiting-for-frame">
      <span>LOADING</span>
    </div>,
    document.body,
  );
}
