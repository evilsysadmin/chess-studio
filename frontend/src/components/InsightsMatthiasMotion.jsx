import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { matthiasTimeVisual } from '../matthiasVisuals.js';
import {
  reducedMotionStatus,
  USER_PREFERENCES_CHANGED_EVENT,
} from '../userPreferences.js';
import MatthiasCoffeeSteam from './MatthiasCoffeeSteam.jsx';
import MatthiasLayeredArt from './MatthiasLayeredArt.jsx';

const PORTRAIT_SELECTOR = '.insights-workspace-view-now .ai-player-portrait-character';

function currentReducedMotion() {
  return reducedMotionStatus().effective;
}

export default function InsightsMatthiasMotion() {
  const [target, setTarget] = useState(null);
  const [reducedMotion, setReducedMotion] = useState(currentReducedMotion);
  const visual = useMemo(() => matthiasTimeVisual(), []);

  // El diagnóstico y su retrato llegan después de montar InsightsScreen. Buscar
  // sólo una vez dejaba a Matthias estático si la petición todavía no había
  // terminado. Observamos inserciones y enlazamos el rig cuando aparece el
  // retrato real; al salir de "Ahora" el observer desaparece con el componente.
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
    const previousOverflow = target.style.overflow;
    const previousOpacity = originalImage?.style.opacity || '';

    target.style.position = 'relative';
    target.style.overflow = 'hidden';
    target.dataset.matthiasInsightsAnimated = 'true';
    if (originalImage) originalImage.style.opacity = '0';

    return () => {
      delete target.dataset.matthiasInsightsAnimated;
      target.style.position = previousPosition;
      target.style.overflow = previousOverflow;
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
