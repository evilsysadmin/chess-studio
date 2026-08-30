import { useEffect, useMemo, useState } from 'react';
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

  if (!target) return null;

  return createPortal(
    <span
      className="insights-matthias-motion"
      data-insights-matthias-motion="true"
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
      }}
      aria-hidden="true"
    >
      <MatthiasLayeredArt
        avatar={visual.avatar}
        scene={visual.scene}
        activity={visual.label}
        reducedMotion={reducedMotion}
      />
      <MatthiasCoffeeSteam
        scene={visual.scene}
        reducedMotion={reducedMotion}
      />
    </span>,
    target,
  );
}
