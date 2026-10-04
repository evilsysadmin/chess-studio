export default function ChroniclesDefeatOverlay({ onRestart, onExit }) {
  return (
    <div className="chronicles-finish is-defeat" role="dialog" aria-modal="true" aria-label="Expedición terminada">
      <span>EXPEDICIÓN TERMINADA</span>
      <strong>La compañía ha caído.</strong>
      <p>Todos los miembros están fuera de combate. Esta run ha terminado y ya no admite más acciones.</p>
      <div className="chronicles-finish-actions">
        <button type="button" className="primary-btn" onClick={onRestart}>Nueva expedición</button>
        <button type="button" className="secondary-btn" onClick={onExit}>Salir</button>
      </div>
    </div>
  );
}
