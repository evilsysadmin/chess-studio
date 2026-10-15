import { useEffect, useRef } from 'react';
import { chroniclesGoldBalance } from '../chronicles/chroniclesContentRuntime.js';
import { chroniclesMapForState } from '../chronicles/chroniclesMapCatalog.js';
import { CHRONICLES_TAVERN_PRICES, chroniclesTavernRestPrice } from '../chronicles/chroniclesTavern.js';
import './ChroniclesTavern.css';

// An interior counter, not a second map or a teleport: the company stays on
// the authored street entrance while the overlay owns input and focus.
export default function ChroniclesTavern({ state, onAction, onClose }) {
  const closeRef = useRef(null);
  const map = chroniclesMapForState(state);
  const entry = map?.interactables?.find((item) => item.id === state.tavern?.id);
  const gold = chroniclesGoldBalance(state);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  if (!entry) return null;
  const innName = state.mapId === 'swordhaven-first-book' ? 'La Espada Mellada' : (entry.label || 'Posada').split(' · ')[0];
  const restPrice = chroniclesTavernRestPrice(entry);
  const choices = [
    { id: 'food', name: 'Comprar comida', detail: 'Una ración de viaje para el inventario de la compañía.', price: CHRONICLES_TAVERN_PRICES.food },
    { id: 'drink', name: 'Beber y comer', detail: 'Una ronda caliente: recupera 2 PV de cada compañero consciente.', price: CHRONICLES_TAVERN_PRICES.drink },
    { id: 'rumor', name: 'Escuchar rumores', detail: 'Noticias del camino, personajes y lugares que merece la pena visitar.', price: 0 },
    { id: 'rest', name: 'Descansar', detail: 'Recupera heridas y puntos de hechizo según las reglas de esta posada.', price: restPrice },
  ];
  return (
    <div className="chronicles-tavern__backdrop" onClick={onClose}>
      <section className="chronicles-tavern" role="dialog" aria-modal="true" aria-label={`Taberna · ${innName}`}
        data-chronicles-tavern={entry.id} onClick={(event) => event.stopPropagation()}>
        <header className="chronicles-tavern__header">
          <div>
            <small>CHRONICLES · {map.title}</small>
            <h2>{innName}</h2>
            <p>Comida, cerveza, rumores y camas. Aquí sí se permite descansar.</p>
          </div>
          <b aria-label={`Oro de la compañía: ${gold}`}>{gold} oro</b>
          <button type="button" ref={closeRef} className="chronicles-tavern__close"
            onClick={onClose} aria-label="Salir de la taberna">×</button>
        </header>
        <div className="chronicles-tavern__scene" aria-hidden="true">
          <span>✦</span><strong>{innName.toUpperCase()}</strong><span>✦</span>
        </div>
        <p className="chronicles-tavern__message" role="status" aria-live="polite">{state.message}</p>
        <div className="chronicles-tavern__choices">
          {choices.map((choice) => (
            <button key={choice.id} type="button" data-tavern-choice={choice.id}
              disabled={gold < choice.price}
              onClick={() => onAction({ type: 'tavern-use', choice: choice.id })}>
              <span><strong>{choice.name}</strong><small>{choice.detail}</small></span>
              <b>{choice.price ? `${choice.price} oro` : 'Gratis'}</b>
            </button>
          ))}
        </div>
        <footer><small>La compañía conserva su posición en la calle al salir.</small>
          <button type="button" onClick={onClose}>Volver a la calle</button>
        </footer>
      </section>
    </div>
  );
}
