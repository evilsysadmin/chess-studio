import { useEffect, useRef, useState } from 'react';
import aldricHall from '../assets/chronicles/ui/shops/aldric-hall.svg';
import braskWatch from '../assets/chronicles/ui/shops/brask-watch.svg';
import ilseTemple from '../assets/chronicles/ui/shops/ilse-temple.svg';
import './ChroniclesShop.css';
import './ChroniclesAudience.css';

const ROOM_ART = Object.freeze({
  'aldric-hall': Object.freeze({
    src: aldricHall,
    alt: 'El alcalde Aldric, ante la mesa de su despacho en el ayuntamiento',
  }),
  'watch-house': Object.freeze({
    src: braskWatch,
    alt: 'El sargento Brask, armado ante el mapa del cuartel',
  }),
  temple: Object.freeze({
    src: ilseTemple,
    alt: 'La sacerdotisa Ilse ante el altar del templo',
  }),
});

export default function ChroniclesAudience({ dialogue, onAction, onClose }) {
  const firstChoiceRef = useRef(null);
  const [reply, setReply] = useState('');
  const [actionTaken, setActionTaken] = useState(false);
  const choices = dialogue?.choices?.filter((choice) => !actionTaken || choice.kind !== 'action') || [];
  const room = ROOM_ART[dialogue?.room] || null;

  const choose = (choice) => {
    if (!choice) return;
    if (choice.kind === 'leave') {
      onClose();
      return;
    }
    if (choice.kind === 'say') {
      setReply(choice.answer);
      return;
    }
    if (choice.kind === 'action') {
      // The authoritative reducer (not dialogue UI) applies quest effects.
      const message = onAction(choice.actionId);
      setReply(message || 'El interlocutor asiente sin añadir nada.');
      setActionTaken(true);
    }
  };

  useEffect(() => {
    firstChoiceRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Tab') return; // Preserve normal focus traversal.
      // Only the audience handles keys while it is open. Never let 1-4
      // select heroes or W/arrow move the expedition behind the dialogue.
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      const digit = Number(event.key);
      if (/^[1-9]$/.test(event.key) && digit <= choices.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        choose(choices[digit - 1]);
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 'a', 'A', 's', 'S', 'd', 'D', 'f', 'F', ' '].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [choices, onClose, onAction]);

  if (!dialogue) return null;

  return (
    <div className="chronicles-shop__backdrop" onClick={onClose}>
      <section className="chronicles-shop chronicles-audience"
        role="dialog" aria-modal="true"
        aria-label={`Conversación con ${dialogue.name}`}
        data-chronicles-audience={dialogue.id}
        data-chronicles-audience-spoken={actionTaken ? 'true' : 'false'}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="chronicles-shop__head chronicles-audience__head">
          <div>
            <span>CONVERSACIÓN · {dialogue.place}</span>
            <h2>{dialogue.name}</h2>
            <p>Elige una respuesta tocándola o pulsando su número.</p>
          </div>
          <button type="button" className="chronicles-shop__close" onClick={onClose}
            aria-label="Salir de la conversación">✕</button>
        </header>

        <figure className="chronicles-audience__scene">
          {room ? <img src={room.src} alt={room.alt} draggable="false" /> : (
            <div className="chronicles-audience__scene-fallback" aria-hidden="true">✦</div>
          )}
        </figure>

        <div className="chronicles-audience__dialogue">
          <small>{reply ? `${dialogue.name.toUpperCase()} RESPONDE` : 'AUDIENCIA'}</small>
          <p data-chronicles-dialogue-answer aria-live="polite">{reply || dialogue.greeting}</p>
          <div className="chronicles-audience__actions" aria-label="Respuestas disponibles">
            {choices.map((choice, index) => (
              <button ref={index === 0 ? firstChoiceRef : undefined} key={choice.id}
                type="button" data-chronicles-dialogue-choice={choice.id}
                onClick={() => choose(choice)}>
                <b aria-hidden="true">{index + 1}.</b>
                <span>{choice.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
