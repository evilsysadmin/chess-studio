export default function WarRoomLandscapeGate({ active = false, lockState = 'idle', onActivate }) {
  if (!active) return null;

  return (
    <section className="war-room-landscape-gate" role="dialog" aria-label="War Room en apaisado">
      <span aria-hidden="true">♜</span>
      <div className="war-room-landscape-gate__copy">
        <strong>Mejor en apaisado</strong>
        <p>Gira el móvil para un tablero más grande. Puedes seguir jugando en vertical.</p>
        {['rejected', 'unsupported'].includes(lockState) && <small>Si el navegador no gira solo, rota el teléfono.</small>}
      </div>
      <button type="button" onClick={onActivate}>Activar apaisado</button>
    </section>
  );
}
