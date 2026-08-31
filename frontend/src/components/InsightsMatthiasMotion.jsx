import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { matthiasTimeVisual } from '../matthiasVisuals.js';
import {
  reducedMotionStatus,
  USER_PREFERENCES_CHANGED_EVENT,
} from '../userPreferences.js';
import MatthiasCoffeeSteam from './MatthiasCoffeeSteam.jsx';
import MatthiasLayeredArt from './MatthiasLayeredArt.jsx';

// The avatar the player actually sees at the top of "Consulta del día" is the
// stable target in Así juegas. The larger "Así te ve la CPU" portrait is
// conditional, so wiring motion there left the visible consultation avatar
// static for users without enough portrait data.
const PORTRAIT_SELECTOR = '.insights-workspace-view-now .matthias-daily-heading';
const PORTRAIT_SIZE = 48;

function currentReducedMotion() {
  return reducedMotionStatus().effective;
}

export default function InsightsMatthiasMotion() {
  const [target, setTarget] = useState(null);
  const [reducedMotion, setReducedMotion] = useState(currentReducedMotion);
  const portraitRef = useRef(null);
  const visual = useMemo(() => matthiasTimeVisual(), []);

  // The daily consultation is data-backed and can arrive after InsightsScreen
  // mounts. Observe insertions so motion attaches to the real avatar whenever
  // the section becomes eligible instead of relying on one lucky first query.
  useEffect(() => {
    let disposed = false;
    const locate = () => {
      if (disposed) return;
      const next = document.querySelector(PORTRAIT_SELECTOR);
      setTarget((current) => current === next ? current : next);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      setTarget(null);
    };
  }, []);

  useEffect(() => {
    if (!target) return undefined;

    const originalImage = target.querySelector(':scope > img');
    const previousPosition = target.style.position;
    const previousOpacity = originalImage?.style.opacity || '';

    target.style.position = 'relative';
    target.dataset.matthiasInsightsAnimated = 'true';
    // Keep the original image in layout so the title never shifts; the live rig
    // paints exactly over its 48px slot.
    if (originalImage) originalImage.style.opacity = '0';

    return () => {
      delete target.dataset.matthiasInsightsAnimated;
      target.style.position = previousPosition;
      if (originalImage) originalImage.style.opacity = previousOpacity;
    };
  }, [target]);

  useEffect(() => {
    const refresh = () => setReducedMotion(currentReducedMotion());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    media?.addEventListener?.('change', refresh);
    return () => {
      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
      media?.removeEventListener?.('change', refresh);
    };
  }, []);

  // At 48×48 the time-of-day rig can legitimately move a hand or a prop that
  // lives outside the visible crop, making Matthias look static even though
  // Web Animations is running. Give this tiny portrait its own always-visible
  // acting layer: a slow lean/breath over the whole face slot. The detailed rig
  // still animates underneath, but this guarantees a perceptible sign of life.
  useEffect(() => {
    const node = portraitRef.current;
    if (!node) return undefined;
    node.getAnimations?.().forEach((animation) => animation.cancel());
    node.dataset.insightsMotionState = reducedMotion ? 'reduced' : 'active';
    if (reducedMotion || typeof node.animate !== 'function') return undefined;

    const animation = node.animate([
      { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg)' },
      { offset: .24, transform: 'translate3d(-1.2px,-.7px,0) rotate(-1deg)' },
      { offset: .5, transform: 'translate3d(.5px,-1.15px,0) rotate(.35deg)' },
      { offset: .76, transform: 'translate3d(1.15px,-.35px,0) rotate(.85deg)' },
      { offset: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
    ], {
      duration: 5_200,
      iterations: Infinity,
      easing: 'cubic-bezier(.4,0,.2,1)',
    });

    return () => animation.cancel();
  }, [reducedMotion, target]);

  if (!target) return null;

  return createPortal(
    <span
      ref={portraitRef}
      className="insights-matthias-motion"
      data-insights-matthias-motion="true"
      data-insights-motion-profile="portrait-breathe"
      data-insights-motion-state={reducedMotion ? 'reduced' : 'active'}
      data-insights-motion-scene={visual.key || 'base'}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        display: 'block',
        width: `${PORTRAIT_SIZE}px`,
        height: `${PORTRAIT_SIZE}px`,
        borderRadius: '10px',
        overflow: 'hidden',
        pointerEvents: 'none',
        transformOrigin: '50% 55%',
        willChange: reducedMotion ? 'auto' : 'transform',
      }}
      aria-hidden="true"
    >
      <MatthiasLayeredArt
        avatar={visual.avatar}
        scene={visual.key || 'base'}
        activity={visual.label}
        reducedMotion={reducedMotion}
      />
      <MatthiasCoffeeSteam
        scene={visual.key || 'base'}
        reducedMotion={reducedMotion}
      />
    </span>,
    target,
  );
}
