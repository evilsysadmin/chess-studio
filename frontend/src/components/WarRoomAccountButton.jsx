import './WarRoomAccountButton.css';

function openMountedAccountMenu() {
  const trigger = document.querySelector('.masthead-account-trigger');
  trigger?.click();
}

export default function WarRoomAccountButton() {
  return (
    <button
      type="button"
      className="war-room-account-button"
      aria-label="Mi cuenta"
      title="Mi cuenta"
      onClick={openMountedAccountMenu}
    >
      <span aria-hidden="true">⚙</span>
    </button>
  );
}
