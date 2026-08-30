import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import { matthiasAmbientVisuals, matthiasTimeVisual } from '../matthiasVisuals.js';
import './MatthiasHomeResident.css';

const AMBIENT_SCENE_MS = 58_000;

function reducedMotionPreferred() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function MatthiasHomeVisit({ model, speaking = false, onAction, onDismiss, onOpenInsights }) {
  const hour = useMemo(() => new Date().getHours(), []);
  const ambientVisuals = useMemo(() => matthiasAmbientVisuals(hour), [hour]);
  const [ambientBeat, setAmbientBeat] = useState(0);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    setAmbientBeat(0);
    if (speaking || ambientVisuals.length < 2 || reducedMotionPreferred()) return undefined;
    const timer = window.setInterval(() => {
      setAmbientBeat((current) => (current + 1) % ambientVisuals.length);
    }, AMBIENT_SCENE_MS);
    return () => window.clearInterval(timer);
  }, [ambientVisuals.length, speaking]);

  if (!model) return null;

  const speakingVisual = matthiasTimeVisual(hour);
  const visual = speaking ? speakingVisual : (ambientVisuals[ambientBeat] || speakingVisual);
  const mood = model.moodLabel || 'Observador';

  const resident = (
    <aside
      className={`matthias-resident matthias-resident--${model.variant || 'quiet'} matthias-resident--mood-${model.moodCue || 'observant'}${speaking ? ' is-speaking' : ' is-quiet'}`}
      aria-label="Rincón de Matthias"
      data-viewport-resident="true"
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

        <button
          type="button"
          className="matthias-resident__character"
          data-ambient-scene={visual.key || 'default'}
          onClick={onOpenInsights}
          aria-label="Abrir Así juegas con Matthias"
          aria-describedby={speaking ? 'matthias-home-message' : undefined}
          title="Matthias · abrir Así juegas"
        >
          <span className="matthias-resident__portrait-shell" aria-hidden="true">
            <img key={visual.key || visual.avatar} src={visual.avatar} alt="" />
          </span>
          <strong>{CPU_IDENTITY.name}</strong>
          <small>{speaking ? mood : visual.label}</small>
          {speaking && model.sessionLabel ? <em>{model.sessionLabel}</em> : null}
        </button>
      </div>
    </aside>
  );

  // Home usa transforms para su composición visual. Un fixed dentro de un
  // ancestor transformado deja de estar fijado al viewport y puede acabar en
  // mitad del lienzo. Tras montar, sacamos al residente a document.body para
  // que right/bottom sean siempre coordenadas reales de la ventana.
  if (!portalReady || typeof document === 'undefined' || !document.body) return resident;
  return createPortal(resident, document.body);
}
