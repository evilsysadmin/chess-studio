import { useEffect, useMemo } from 'react';
import { touchActivity } from './auth.js';
import { PRESENCE_HEARTBEAT_MS } from './presenceCadence.js';

const ACTIVITY_BY_VIEW = Object.freeze({
  menu: 'Menú principal',
  game: 'Partida',
  tournament: 'Torneo',
  tournamentGame: 'Torneo',
  combat: 'Combat Chess',
  roguelike: 'Combat Chess',
  combatReplay: 'Replay',
  replay: 'Replay',
  insights: 'Así juegas',
  history: 'Historial',
  puzzle: 'Puzzle',
  tutorial: 'Aprendizaje',
  openings: 'Aperturas',
  lab: 'Laboratorio',
  spectator: 'Espectador',
  admin: 'Panel admin',
  board3d: 'Experimento 3D',
});


export function activityForView(view) {
  return ACTIVITY_BY_VIEW[view] || 'Navegando';
}

export function usePresenceHeartbeat(view) {
  const coarseActivity = useMemo(() => activityForView(view), [view]);

  useEffect(() => {
    const reportPresence = () => {
      const foreground = typeof document === 'undefined' ? null : document.visibilityState === 'visible';
      touchActivity(coarseActivity, foreground);
    };
    const handleVisibility = () => reportPresence();

    reportPresence();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') reportPresence();
    }, PRESENCE_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [coarseActivity]);

  return coarseActivity;
}
