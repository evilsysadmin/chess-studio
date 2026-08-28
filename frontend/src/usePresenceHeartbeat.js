import { useEffect, useMemo } from 'react';
import { bindPresenceLifecycle } from './presenceLifecycle.js';

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
  dailyChallenges: 'Puzzle',
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

  useEffect(() => bindPresenceLifecycle(coarseActivity), [coarseActivity]);

  return coarseActivity;
}
