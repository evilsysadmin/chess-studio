import './WarRoomLandscapeGate.css';

export default function WarRoomLandscapeGate({
  active = false,
  lockState = 'idle',
  onActivate,
  title = 'Mejor en apaisado',
  copy = 'La War Room intentará girar el móvil. Si el navegador lo bloquea, usa Girar.',
  rejectedCopy = 'El navegador necesita este toque para bloquear la orientación.',
  icon = '♜',
}) {
  if (!active) return null;

  return (
    <section className="war-room-landscape-gate" role="dialog" aria-label="War Room en apaisado">
      <span aria-hidden="true">{icon}</span>
      <div className="war-room-landscape-gate__copy">
        <strong>{title}</strong>
        <p>{copy}</p>
        {lockState === 'rejected' && <small>{rejectedCopy}</small>}
      </div>
      <button type="button" aria-label="Activar apaisado" onClick={onActivate}>Girar</button>
    </section>
  );
}
