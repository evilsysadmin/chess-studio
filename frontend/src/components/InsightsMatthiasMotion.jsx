import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { matthiasTimeVisual } from '../matthiasVisuals.js';
import {
  reducedMotionStatus,
  USER_PREFERENCES_CHANGED_EVENT,
} from '../userPreferences.js';
import MatthiasCoffeeSteam from './MatthiasCoffeeSteam.jsx';
import MatthiasLayeredArt from './MatthiasLayeredArt.jsx';

function currentReducedMotion() {
  return reducedMotionStatus().effective;
}

export default function InsightsMatthiasMotion() {
  const [target, setTarget] = useState(null);
  const [reducedMotion, setReducedMotion] = useState(currentReducedMotion);
  const visual = useMemo(() => matthiasTimeVisual(), []);

  useEffect(() => {
    const node = document.querySelector(
      '.insights-workspace-view-now .ai-player-portrait-character',
    );
    if (!node) return undefined;

    const originalImage = node.querySelector(':scope > img');
    const previousPosition = node.style.position;
    const previousOverflow = node.style.overflow;
    const previousOpacity = originalImage?.style.opacity || '';

    node.style.position = 'relative';
    node.style.overflow = 'hidden';
    node.dataset.matthiasInsightsAnimated = 'true';
    if (originalImage) originalImage.style.opacity = '0';
    setTarget(node);

    return () => {
      setTarget(null);
      delete node.dataset.matthiasInsightsAnimated;
      node.style.position = previousPosition;
      node.style.overflow = previousOverflow;
      if (originalImage) originalImage.style.opacity = previousOpacity;
    };
  }, []);

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
        inset: 0,
        display: 'block',
        width: '100%',
        height: '100%',
        borderRadius: 'inherit',
        overflow: 'hidden',
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
