import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import { matthiasAmbientVisuals, matthiasTimeVisual } from '../matthiasVisuals.js';
import { reducedMotionStatus, setReducedMotion, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import MatthiasPuppet from './MatthiasPuppet.jsx';
import './MatthiasHomeResident.css';
import './MatthiasMotionOverride.css';

const AMBIENT_SCENE_MS = 28_000;
const COMPACT_VIEWPORT_QUERY = '(max-width: 760px)';

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

export default function MatthiasHomeVisit({ model, speaking = false, onAction, onDismiss, onOpenInsights }) {
  const hour = useMemo(() => new Date().getHours(), []);
  const ambientVisuals = useMemo(() => matthiasAmbientVisuals(hour), [hour]);
  const [ambientBeat, setAmbientBeat] = useState(0);
  const [motionStatus, setMotionStatus] = useState(() => reducedMotionStatus());
  const [compactViewport, setCompactViewport] = useState(() => matthiasCompactViewport());
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

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
    setAmbientBeat(0);
    if (speaking || ambientVisuals.length < 2 || motionStatus.effective) return undefined;
    const timer = window.setInterval(() => {
      setAmbientBeat((current) => (current + 1) % ambientVisuals.length);
    }, AMBIENT_SCENE_MS);
    return () => window.clearInterval(timer);
  }, [ambientVisuals.length, motionStatus.effective, speaking]);

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
              <MatthiasPuppet
                scene={visual.key || 'base'}
                speaking={speaking}
                reducedMotion={motionStatus.effective}
              />
            </span>
            <strong>{CPU_IDENTITY.name}</strong>
            <small>{speaking ? mood : visual.label}</small>
            {speaking && model.sessionLabel ? <em>{model.sessionLabel}</em> : null}
          </button>
          {motionStatus.effective ? (
            <button type="button" className="matthias-resident__motion-override" onClick={enableMotion}>
              {motionOverrideLabel}
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );

  // En móvil Matthias forma parte del flujo de Home: así nunca tapa tarjetas,
  // texto ni acciones aunque el bocadillo crezca. En desktop sí lo sacamos a
  // document.body, porque Home usa transforms y un fixed dentro de un ancestor
  // transformado dejaría de estar fijado al viewport.
  if (compactViewport) return resident;
  if (!portalReady || typeof document === 'undefined' || !document.body) return resident;
  return createPortal(resident, document.body);
}
