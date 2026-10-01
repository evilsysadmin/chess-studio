import './WarRoomExitOverlay.css';

export default function WarRoomExitOverlay({
  onClick,
  disabled = false,
  ariaLabel = 'Salir de la partida',
}) {
  if (typeof onClick !== 'function') return null;
  return (
    <button
      type="button"
      className="war-room-exit-overlay"
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      <span aria-hidden="true">←</span>
      <span>SALIR</span>
    </button>
  );
}
