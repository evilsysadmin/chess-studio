export default function WarRoomLandscapeGate({ active = false, lockState = 'idle', onActivate }) {
  if (!active) return null;

  return (
    <section className="war-room-landscape-gate" role="dialog" aria-modal="true" aria-label="War Room en apaisado">
      <span aria-hidden="true">♜</span>
      <strong>Gira el móvil</strong>
      <p>La War Room se juega en apaisado: tablero grande, sin distracciones.</p>
      <button type="button" onClick={onActivate}>Activar apaisado</button>
      {['rejected', 'unsupported'].includes(lockState) && <small>Si el navegador no gira solo, rota el teléfono.</small>}
    </section>
  );
}
