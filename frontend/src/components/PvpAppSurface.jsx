import { lazy, Suspense, useEffect } from 'react';
import PvpChallengeNudge from './PvpChallengeNudge.jsx';
import PvpHandoffModal from './PvpHandoffModal.jsx';
import { usePvpAppFlow } from '../usePvpAppFlow.js';
import { clearPvpRuntime, publishPvpRuntime } from '../pvpRuntimeBridge.js';
import useWarRoomLandscape from './useWarRoomLandscape.js';
import WarRoomLandscapeGate from './WarRoomLandscapeGate.jsx';
import { exitWarRoomBrowserFullscreen } from './useWarRoomImmersive.js';

const PvpGameScreen = lazy(() => import('./PvpGameScreen.jsx'));

export default function PvpAppSurface({ view, replaceView }) {
  const flow = usePvpAppFlow({ view, replaceView });
  const landscapeActive = Boolean(flow.handoffMatch || (view === 'pvpGame' && flow.match));
  const {
    needsRotation: warRoomNeedsRotation,
    lockState: warRoomOrientationLock,
    activateLandscape,
  } = useWarRoomLandscape(landscapeActive);

  useEffect(() => {
    if (landscapeActive) return undefined;
    void exitWarRoomBrowserFullscreen();
    return undefined;
  }, [landscapeActive]);

  useEffect(() => {
    publishPvpRuntime({
      ...flow.menuStatus,
      // The runtime bridge owns the lobby snapshot even before enrollment. Keeping
      // one source of truth avoids swapping from the modal's local pre-join roster
      // to a self-only global snapshot as soon as join succeeds.
      lobby: flow.lobby,
      enterMatch: flow.enterMatch,
      refresh: flow.refresh,
      enroll: flow.enroll,
      leave: flow.leave,
      challenge: flow.challenge,
      cancelChallenge: flow.cancelChallenge,
      acceptChallenge: flow.acceptIncoming,
      declineChallenge: flow.declineChallenge,
    });
  }, [flow.acceptIncoming, flow.cancelChallenge, flow.challenge, flow.declineChallenge, flow.enterMatch, flow.enroll, flow.leave, flow.lobby, flow.menuStatus, flow.refresh]);

  useEffect(() => clearPvpRuntime, []);

  return (
    <>
      <WarRoomLandscapeGate
        active={warRoomNeedsRotation}
        lockState={warRoomOrientationLock}
        onActivate={activateLandscape}
      />
      {view !== 'pvpGame' && !flow.handoffMatch && flow.incomingChallenge && (
        <PvpChallengeNudge
          challenge={flow.incomingChallenge}
          onAccept={flow.acceptIncoming}
          onDecline={flow.declineChallenge}
        />
      )}
      {flow.handoffMatch && (
        <PvpHandoffModal
          match={flow.handoffMatch}
          error={flow.handoffError}
          onComplete={flow.completeHandoff}
          onAbort={flow.cancelHandoff}
        />
      )}
      {view === 'pvpGame' && flow.match && (
        <Suspense fallback={<div className="route-loading" role="status">Abriendo duelo 1 vs 1…</div>}>
          <PvpGameScreen
            initialMatch={flow.match}
            onMatchUpdate={flow.updateMatch}
            onExit={flow.exitMatch}
          />
        </Suspense>
      )}
    </>
  );
}
