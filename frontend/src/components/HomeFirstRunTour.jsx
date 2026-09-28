import { useEffect, useMemo, useState } from 'react';
import { HOME_FIRST_RUN_TOUR_STEPS } from '../homeFirstRunTour.js';
import HomeMatthias3D from './HomeMatthias3D.jsx';
import { MATTHIAS_BASE_AVATAR } from '../matthiasVisuals.js';
import './HomeFirstRunTour.css';

function targetBox(target) {
  if (!target || typeof document === 'undefined') return null;
  const node = document.querySelector(`[data-home-tour-target="${target}"]`);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const pad = 8;
  return {
    left: Math.max(6, rect.left - pad),
    top: Math.max(6, rect.top - pad),
    width: Math.max(44, rect.width + pad * 2),
    height: Math.max(44, rect.height + pad * 2),
  };
}

export default function HomeFirstRunTour({ active = false, onComplete, onSkip, onFocusTarget }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [box, setBox] = useState(null);
  const step = HOME_FIRST_RUN_TOUR_STEPS[stepIndex] || HOME_FIRST_RUN_TOUR_STEPS[0];
  const last = stepIndex === HOME_FIRST_RUN_TOUR_STEPS.length - 1;

  useEffect(() => {
    onFocusTarget?.(active ? (step?.target || '') : '');
    return () => onFocusTarget?.('');
  }, [active, onFocusTarget, step?.target]);

  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      setBox(null);
      return undefined;
    }
    let raf = 0;
    const sync = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => setBox(targetBox(step?.target)));
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [active, step?.target]);

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onSkip?.();
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (last) onComplete?.();
        else setStepIndex((current) => Math.min(HOME_FIRST_RUN_TOUR_STEPS.length - 1, current + 1));
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setStepIndex((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, last, onComplete, onSkip]);

  const placement = useMemo(() => {
    if (!box || typeof window === 'undefined') return 'bottom';
    return box.top > window.innerHeight * .52 ? 'top' : 'bottom';
  }, [box]);

  if (!active) return null;

  return (
    <section
      className="home-first-run-tour"
      data-step={step.id}
      data-placement={placement}
      role="dialog"
      aria-modal="true"
      aria-label="Guía rápida de Chess Studio con Matthias"
    >
      <div className="home-first-run-tour__shade" aria-hidden="true" />
      {box && (
        <div
          className="home-first-run-tour__spotlight"
          aria-hidden="true"
          style={{
            left: `${box.left}px`,
            top: `${box.top}px`,
            width: `${box.width}px`,
            height: `${box.height}px`,
          }}
        />
      )}
      <article className="home-first-run-tour__briefing">
        <div className="home-first-run-tour__matthias" aria-hidden="true">
          <HomeMatthias3D
            fallbackAvatar={MATTHIAS_BASE_AVATAR}
            scene="base"
            activity="Dando la visita guiada"
            speaking
            reducedMotion={typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches}
            activeRoom={step?.target || ''}
          />
        </div>
        <div className="home-first-run-tour__copy">
        <header>
          <span>{step.eyebrow}</span>
          <b>{stepIndex + 1}/{HOME_FIRST_RUN_TOUR_STEPS.length}</b>
        </header>
        <h2>{step.title}</h2>
        <p>{step.text}</p>
        <footer>
          <button type="button" className="home-first-run-tour__skip" onClick={onSkip}>
            Omitir guía
          </button>
          <div>
            {stepIndex > 0 && (
              <button type="button" className="home-first-run-tour__back" onClick={() => setStepIndex((current) => current - 1)}>
                Atrás
              </button>
            )}
            <button
              type="button"
              className="home-first-run-tour__next"
              onClick={() => {
                if (last) onComplete?.();
                else setStepIndex((current) => current + 1);
              }}
            >
              {last ? 'Entrar en Chess Studio' : 'Siguiente'}
            </button>
          </div>
        </footer>
        </div>
      </article>
    </section>
  );
}
