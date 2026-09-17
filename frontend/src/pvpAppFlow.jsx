import React, { useCallback, useEffect, useState } from 'react';
import PvpChallengeNudge from './components/PvpChallengeNudge.jsx';
import { clearPvpMatchSession, loadPvpMatchSession, savePvpMatchSession } from './pvpEnrollment.js';
import { usePvpPresence } from './usePvpPresence.js';

const PvpGameScreen = React.lazy(() => import('./components/PvpGameScreen.jsx'));

export function usePvpAppFlow({ view, replaceView, setCombatBattleUiActive }) {
  const pvp = usePvpPresence();
  const [pvpMatch, setPvpMatch] = useState(() => loadPvpMatchSession());

  useEffect(() => {
    if (view !== 'pvpGame' || pvpMatch || !pvp.lobby.activeMatch) return;
    setPvpMatch(pvp.lobby.activeMatch);
    savePvpMatchSession(pvp.lobby.activeMatch);
  }, [pvp.lobby.activeMatch, pvpMatch, view]);

  useEffect(() => {
    if (!pvp.enrolled || view === 'pvpGame') return;
    void pvp.refresh({ quiet: true, heartbeat: true });
  }, [pvp.enrolled, pvp.refresh, view]);

  const openPvpMatch = useCallback((match) => {
    if (!match?.id) return;
    setCombatBattleUiActive(false);
    savePvpMatchSession(match);
    setPvpMatch(match);
    replaceView('pvpGame');
  }, [replaceView, setCombatBattleUiActive]);

  const acceptIncomingPvpChallenge = useCallback(async (challenge) => {
    const result = await pvp.acceptChallenge(challenge?.id);
    if (result?.match) openPvpMatch(result.match);
  }, [openPvpMatch, pvp.acceptChallenge]);

  const exitPvpMatch = useCallback(() => {
    clearPvpMatchSession();
    setPvpMatch(null);
    replaceView('menu');
    void pvp.refresh({ quiet: true, heartbeat: pvp.enrolled });
  }, [pvp.enrolled, pvp.refresh, replaceView]);

  return { pvp, pvpMatch, openPvpMatch, acceptIncomingPvpChallenge, exitPvpMatch };
}

export function PvpChallengeSurface({ view, pvp, onAccept }) {
  const challenge = pvp.incomingChallenge;
  if (!challenge || view === 'pvpGame') return null;
  return (
    <PvpChallengeNudge
      challenge={challenge}
      pendingCount={pvp.incoming.length}
      busyKey={pvp.busyKey}
      error={pvp.error}
      onAccept={() => void onAccept(challenge)}
      onDecline={() => void pvp.declineChallenge(challenge.id)}
    />
  );
}

export function PvpGameSurface({ view, match, onExit }) {
  if (view !== 'pvpGame') return null;
  return match
    ? <PvpGameScreen initialMatch={match} onExit={onExit} />
    : <div className="route-loading" role="status">Recuperando duelo 1 vs 1…</div>;
}
