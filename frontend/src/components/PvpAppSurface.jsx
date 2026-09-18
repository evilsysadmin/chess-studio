import { lazy, Suspense, useEffect } from 'react';
import PvpChallengeNudge from './PvpChallengeNudge.jsx';
import PvpHandoffModal from './PvpHandoffModal.jsx';
import { usePvpAppFlow } from '../usePvpAppFlow.js';
import { clearPvpRuntime, publishPvpRuntime } from '../pvpRuntimeBridge.js';

const PvpGameScreen = lazy(() => import('./PvpGameScreen.jsx'));

export default function PvpAppSurface({ view, replaceView }) {
  const flow = usePvpAppFlow({ view, replaceView });

  useEffect(() => {
    publishPvpRuntime({
      ...flow.menuStatus,
      lobby: flow.enrolled ? flow.lobby : null,
      enterMatch: flow.enterMatch,
      refresh: flow.refresh,
      enroll: flow.enroll,
      leave: flow.leave,
      challenge: flow.challenge,
      cancelChallenge: flow.cancelChallenge,
      acceptChallenge: flow.acceptChallenge,
      declineChallenge: flow.declineChallenge,
    });
  }, [flow.acceptChallenge, flow.cancelChallenge, flow.challenge, flow.declineChallenge, flow.enterMatch, flow.enroll, flow.leave, flow.lobby, flow.menuStatus, flow.refresh]);

  useEffect(() => clearPvpRuntime, []);

  return (
    <>
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
        />
      )}
      {view === 'pvpGame' && flow.match && (
        <Suspense fallback={<div className="route-loading" role="status">Abriendo duelo 1 vs 1…</div>}>
          <PvpGameScreen initialMatch={flow.match} onExit={flow.exitMatch} />
        </Suspense>
      )}
    </>
  );
}
