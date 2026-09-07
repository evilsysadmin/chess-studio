import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import { matthiasAmbientVisuals, matthiasTimeVisual } from '../matthiasVisuals.js';
import { matthiasSessionContext } from '../matthiasSessionContext.js';
import { buildSessionSummary } from '../sessionSummary.js';
import { reducedMotionStatus, setReducedMotion, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import MatthiasHomePresenceAvatar from './MatthiasHomeMicrogestureAvatar.jsx';
import './MatthiasHomeResident.css';
import './HomeCastleCoherence.css';
import './MatthiasHomeSessionSummary.css';
import './MatthiasMotionOverride.css';
import './MatthiasHomeMobilePortrait.css';

const AMBIENT_SCENE_MS = 28_000;
const COMPACT_VIEWPORT_QUERY = '(max-width: 760px)';
export const HOME_HOUR_REFRESH_MS = 60_000;
export const HOME_THREE_MOTION_INTENSITY = 1.12;

export function matthiasMotionReduced({ appReduced, mediaReduced } = {}) {
  if (typeof appReduced === 'boolean') return Boolean(appReduced || mediaReduced);
  return reducedMotionStatus({ systemReduced: mediaReduced }).effective;
}

export function matthiasCompactViewport({ mediaMatches, innerWidth } = {}) {
  if (typeof mediaMatches === 'boolean') return mediaMatches;
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') return window.matchMedia(COMPACT_VIEWPORT_QUERY).matches;
  const width = innerWidth ?? window.innerWidth;
  return Number.isFinite(width) && width <= 760;
}

export function matthiasHomeShouldRunClock({ documentVisible = true } = {}) {
  return Boolean(documentVisible);
}

export function matthiasHomeShouldCycleAmbient({
  documentVisible = true,
  speaking = false,
  reducedMotion = false,
  sceneCount = 0,
} = {}) {
  return Boolean(documentVisible && !speaking && !reducedMotion && Number(sceneCount) >= 2);
}

export default function MatthiasHomeVisit({ model, speaking = false, onAction, onDismiss, onOpenInsights }) {
  const [hour, setHour] = useState(() => new Date().getHours());
  const ambientVisuals = useMemo(() => matthiasAmbientVisuals(hour), [hour]);
  const [ambientBeat, setAmbientBeat] = useState(0);
  const [motionStatus, setMotionStatus] = useState(() => reducedMotionStatus());
  const [compactViewport, setCompactViewport] = useState(() => matthiasCompactViewport());
  const [portalReady, setPortalReady] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() => (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  ));
  const sessionSummary = useMemo(
    () => buildSessionSummary(matthiasSessionContext()),
    [model?.sessionLabel],
  );

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const refreshVisibility = () => setDocumentVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', refreshVisibility);
    return () => document.removeEventListener('visibilitychange', refreshVisibility);
  }, []);

  // Home puede permanecer montada durante horas. El reloj sólo necesita vivir
  // mientras la pestaña es visible; al volver se sincroniza inmediatamente y
  // después retoma la cadencia normal.
  useEffect(() => {
    if (typeof window === 'undefined' || !matthiasHomeShouldRunClock({ documentVisible })) return undefined;
    const refreshHour = () => setHour(new Date().getHours());
    refreshHour();
    const timer = window.setInterval(refreshHour, HOME_HOUR_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [documentVisible]);

  useEffect(() => {
    if (typeof Image !== 'function') return undefined;
    const images = ambientVisuals.slice(1).map((scene) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = scene.avatar;
      return image;
    });
    return () => {
      images.forEach((image) => { image.src = ''; });
    };
  }, [ambientVisuals]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia(COMPACT_VIEWPORT_QUERY)
      : null;
    const refresh = () => setCompactViewport(matthiasCompactViewport({
      mediaMatches: media?.matches,
      innerWidth: window.innerWidth,
    }));

    refresh();
    media?.addEventListener?.('change', refresh);
    if (!media) window.addEventListener('resize', refresh);
    return () => {
      media?.removeEventListener?.('change', refresh);
      if (!media) window.removeEventListener('resize', refresh);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const refresh = () => setMotionStatus(reducedMotionStatus({ systemReduced: media?.matches }));

    refresh();
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
    media?.addEventListener?.('change', refresh);
    return () => {
      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
      media?.removeEventListener?.('change', refresh);
    };
  }, []);

  useEffect(() => {
    if (!matthiasHomeShouldCycleAmbient({
      documentVisible,
      speaking,
      reducedMotion: motionStatus.effective,
      sceneCount: ambientVisuals.length,
    })) return undefined;
    setAmbientBeat(0);
    const timer = window.setInterval(() => {
      setAmbientBeat((current) => (current + 1) % ambientVisuals.length);
    }, AMBIENT_SCENE_MS);
    return () => window.clearInterval(timer);
  }, [ambientVisuals.length, documentVisible, motionStatus.effective, speaking]);

  if (!model) return null;

  const speakingVisual = matthiasTimeVisual(hour);
  const visual = speaking ? speakingVisual : (ambientVisuals[ambientBeat] || speakingVisual);
  const mood = model.moodLabel || 'Observador';

  function enableMotion() {
    setReducedMotion(false);
    setMotionStatus(reducedMotionStatus());
  }

  const motionOverrideLabel = motionStatus.source === 'system'
    ? 'Movimiento desactivado por el sistema · activar'
    : 'Movimiento desactivado en Chess Studio · activar';

  const resident = (
    <aside
      className={`matthias-resident matthias-resident--${model.variant || 'quiet'} matthias-resident--mood-${model.moodCue || 'observant'}${speaking ? ' is-speaking' : ' is-quiet'}${compactViewport ? ' is-inline' : ' is-viewport'}`}
      aria-label="Rincón de Matthias"
      data-viewport-resident="true"
      data-placement={compactViewport ? 'inline' : 'viewport'}
      data-motion-state={motionStatus.effective ? 'reduced' : 'active'}
      data-motion-source={motionStatus.source}
      data-home-hour={hour}
      data-home-visibility={documentVisible ? 'visible' : 'hidden'}
      data-three-presentation="home-v4"
    >
      <div className="matthias-resident__stage">
        {speaking ? (
          <section className="matthias-resident__bubble" aria-live="polite" aria-label="Mensaje de Matthias">
            <span className="section-label">{model.eyebrow}</span>
            <p id="matthias-home-message">{model.text}</p>
            {model.meta ? <small>{model.meta}</small> : null}
            <div className="matthias-resident__bubble-actions">
              <button type="button" className="matthias-resident__cta" onClick={onAction}>
                {model.actionLabel} <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="matthias-resident__dismiss" onClick={onDismiss} aria-label="Cerrar comentario de Matthias">×</button>
            </div>
          </section>
        ) : null}

        <div className="matthias-resident__character-stack">
          <button
            type="button"
            className="matthias-resident__character"
            data-ambient-scene={visual.key || 'default'}
            onClick={onOpenInsights}
            aria-label="Abrir Así juegas con Matthias"
            aria-describedby={speaking ? 'matthias-home-message' : undefined}
            title="Matthias · abrir Así juegas"
          >
            <span className="matthias-resident__portrait-shell" aria-hidden="true" data-portrait-frame="true">
              <MatthiasHomePresenceAvatar
                avatar={visual.avatar}
                scene={visual.key || 'base'}
                activity={visual.label || ''}
                speaking={speaking}
                reducedMotion={motionStatus.effective}
                motionIntensity={HOME_THREE_MOTION_INTENSITY}
              />
            </span>
            <strong>{CPU_IDENTITY.name}</strong>
            <small>{speaking ? mood : visual.label}</small>
            {speaking && model.sessionLabel ? <em>{model.sessionLabel}</em> : null}
          </button>

          {!speaking && sessionSummary ? (
            <details className="matthias-resident__session-summary" data-session-summary="true">
              <summary>
                <span>SESIÓN</span>
                <b>{sessionSummary.activityCount} actividad{sessionSummary.activityCount === 1 ? '' : 'es'}</b>
              </summary>
              <div className="matthias-resident__session-facts">
                {sessionSummary.facts.map((fact) => (
                  <p key={fact.id} data-tone={fact.tone}>
                    <span>{fact.label}</span>
                    <strong>{fact.text}</strong>
                  </p>
                ))}
              </div>
              <small>{sessionSummary.nextStep}</small>
              <button type="button" onClick={onOpenInsights}>Ver Así juegas →</button>
            </details>
          ) : null}

          {motionStatus.effective ? (
            <button type="button" className="matthias-resident__motion-override" onClick={enableMotion}>
              {motionOverrideLabel}
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );

  if (compactViewport) return resident;
  if (!portalReady || typeof document === 'undefined' || !document.body) return resident;
  return createPortal(resident, document.body);
}
