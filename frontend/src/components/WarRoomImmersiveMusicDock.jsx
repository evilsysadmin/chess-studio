import MusicPlayer from './MusicPlayer.jsx';
import './WarRoomImmersiveMusicDock.css';

export default function WarRoomImmersiveMusicDock({ ariaLabel = 'RetroPlayer de la War Room' } = {}) {
  return (
    <aside
      className="war-room-immersive-music-dock game-side-column-3d"
      aria-label={ariaLabel}
    >
      <MusicPlayer initiallyCollapsed />
    </aside>
  );
}
