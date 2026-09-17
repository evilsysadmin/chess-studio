import { lazy, Suspense } from 'react';
import PvpChallengeNudge from './PvpChallengeNudge.jsx';

const PvpGameScreen = lazy(() => import('./PvpGameScreen.jsx'));

export default function PvpAppSurface({ view, flow }) {
  return (
    <>
      {view !== 'pvpGame' && flow.incomingChallenge && (
        <PvpChallengeNudge
          challenge={flow.incomingChallenge}
          onAccept={flow.acceptIncoming}
          onDecline={flow.declineChallenge}
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
