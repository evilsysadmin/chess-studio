import './WarRoomLandscapeGate.css';

// Código Rojo GP-2/GP-3 (#34): la War Room se juega bien en vertical, así que el
// apaisado es una OFERTA compacta, no un banner que tape el tablero.
export default function WarRoomLandscapeGate({ active = false, lockState = 'idle', onActivate }) {
  if (!active) return null;

  const hint = lockState === 'rejected'
    ? 'El navegador necesita este toque para girar la War Room a apaisado.'
    : 'Girar la War Room a apaisado.';
  return (
    <section className="war-room-landscape-gate" aria-label="War Room en apaisado">
      <button type="button" aria-label="Activar apaisado" title={hint} onClick={onActivate}>
        <span aria-hidden="true">↻</span>
        Apaisado
      </button>
    </section>
  );
}
