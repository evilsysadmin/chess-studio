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
      enterMatch: flow.enterMatch,
      enroll: flow.enroll,
      leave: flow.leave,
    });
    return clearPvpRuntime;
  }, [flow.enterMatch, flow.enroll, flow.leave, flow.menuStatus]);

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
