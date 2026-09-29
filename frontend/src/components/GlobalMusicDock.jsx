import React from 'react';
import LiveServiceStatus from './LiveServiceStatus.jsx';

const MusicPlayer = React.lazy(() => import('./MusicPlayer.jsx'));

// Reproductor global + estado del servicio fuera de las vistas de tablero.
export default function GlobalMusicDock({ isAdminUser, onAdmin }) {
  return (
    <div className="global-music-dock" aria-label="Reproductor global">
      <React.Suspense fallback={null}>
        <MusicPlayer />
      </React.Suspense>
      <LiveServiceStatus isAdminUser={isAdminUser} onAdmin={onAdmin} />
    </div>
  );
}
