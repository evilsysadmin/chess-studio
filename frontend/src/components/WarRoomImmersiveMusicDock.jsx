import MusicPlayer from './MusicPlayer.jsx';
import './WarRoomImmersiveMusicDock.css';

export default function WarRoomImmersiveMusicDock() {
  return (
    <aside
      className="war-room-immersive-music-dock game-side-column-3d"
      aria-label="RetroPlayer de la War Room"
    >
      <MusicPlayer initiallyCollapsed />
    </aside>
  );
}
