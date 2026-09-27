import './WarRoomLandscapeGate.css';

export default function WarRoomLandscapeGate({ active = false, lockState = 'idle', onActivate }) {
  if (!active) return null;

  return (
    <section className="war-room-landscape-gate" role="dialog" aria-label="War Room en apaisado">
      <span aria-hidden="true">♜</span>
      <div className="war-room-landscape-gate__copy">
        <strong>Mejor en apaisado</strong>
        <p>La War Room intentará girar el móvil. Si el navegador lo bloquea, usa Girar.</p>
        {lockState === 'rejected' && <small>El navegador necesita este toque para bloquear la orientación.</small>}
      </div>
      <button type="button" aria-label="Activar apaisado" onClick={onActivate}>Girar</button>
    </section>
  );
}
