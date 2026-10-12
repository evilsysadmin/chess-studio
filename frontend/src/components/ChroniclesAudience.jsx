import { useEffect, useRef } from 'react';
import aldricHall from '../assets/chronicles/ui/shops/aldric-hall.svg';
import './ChroniclesShop.css';
import './ChroniclesAudience.css';

// Diegetic presentation only: the quest/action and rewards remain owned by
// chroniclesReduce. Opening the room does not grant anything; speaking does.
export default function ChroniclesAudience({ audience, onTalk, onClose }) {
  const actionRef = useRef(null);

  useEffect(() => {
    actionRef.current?.focus();
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  if (!audience) return null;

  return (
    <div className="chronicles-shop__backdrop" onClick={onClose}>
      <section
        className="chronicles-shop chronicles-audience"
        role="dialog"
        aria-modal="true"
        aria-label="Audiencia con el alcalde Aldric"
        data-chronicles-audience={audience.id}
        data-chronicles-audience-spoken={audience.spoken ? 'true' : 'false'}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="chronicles-shop__head chronicles-audience__head">
          <div>
            <span>AYUNTAMIENTO · SWORDHAVEN</span>
            <h2>Alcalde Aldric</h2>
            <p>Despacho del alcalde</p>
          </div>
          <button type="button" className="chronicles-shop__close" onClick={onClose}
            aria-label="Salir del ayuntamiento">✕</button>
        </header>

        <figure className="chronicles-audience__scene">
          <img src={aldricHall} alt="El alcalde Aldric, de barba gris y túnica borgoña, tras su escritorio en el ayuntamiento" draggable="false" />
        </figure>

        <div className="chronicles-audience__dialogue" aria-live="polite">
          <small>{audience.spoken ? 'ALDRIC RESPONDE' : 'AUDIENCIA'}</small>
          <p>{audience.spoken
            ? audience.message
            : 'Aldric levanta la vista de sus papeles. Tu compañía tiene su atención.'}</p>
          <div className="chronicles-audience__actions">
            {!audience.spoken && (
              <button ref={actionRef} type="button" data-chronicles-audience-talk onClick={onTalk}>
                {audience.label || 'Hablar con Aldric'}
              </button>
            )}
            <button ref={audience.spoken ? actionRef : undefined} type="button"
              onClick={onClose} data-chronicles-audience-exit>
              {audience.spoken ? 'Continuar la expedición' : 'Salir'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
