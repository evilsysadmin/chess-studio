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
    // The cold-start watchdog is allowed to choose the static Home only if
    // this visit has NEVER shown a complete WebGL frame. After a live 3D
    // context is lost, a painted preview must remain a reversible state.
    let everPresented3D = false;
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
      // On a slow GPU users can use the pre-decoded illustration while
      // WebGL starts or recovers. Only a NEVER-ready cold start may switch
      // permanently to static after 30 seconds: otherwise a delayed browser
      // webglcontextrestored event could no longer reach the Blender canvas.
      helpTimer = window.setTimeout(showIllustration, 6_000);
      fallbackTimer = window.setTimeout(() => {
        if (!visibleRef.current && !everPresented3D) onUseStaticHomeRef.current?.();
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
          everPresented3D = true;
          delete stage.dataset.home3dPreview;
          setReady(true);
          setPreviewing(false);
          onHomeAvailableRef.current?.();
          clearRecovery();
        });
      });
    };
    // Readiness only depends on a direct canvas child and two of *its*
    // attributes. Observing every descendant class change causes needless
    // readiness queries when Matthias, hotspots or menus update their UI.
    // Keep stage childList tracking so a recreated WebGL canvas is watched.
    // undefined forces the first watchCanvas() to observe the stage even
    // before React mounts its canvas (when the query initially returns null).
    let watchedCanvas;
    const observer = new MutationObserver(() => {
      watchCanvas();
      inspect();
    });
    const watchCanvas = () => {
      const canvas = stage.querySelector(':scope > canvas.illustrated-home__castle-3d');
      if (canvas === watchedCanvas) return;
      observer.disconnect();
      observer.observe(stage, { childList: true });
      if (canvas) {
        observer.observe(canvas, {
          attributes: true,
          attributeFilter: ['class', 'data-home-blender-runtime'],
        });
      }
      watchedCanvas = canvas;
    };
    watchCanvas();
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
