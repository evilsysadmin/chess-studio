import { useEffect, useMemo, useRef, useState } from 'react';
import './HomeRoute.css';
import QuickMatchModal from './QuickMatchModal.jsx';
import PracticeMatchModal from './PracticeMatchModal.jsx';
import MirrorModeModal from './MirrorModeModal.jsx';
import HomeIllustrated from './HomeIllustrated.jsx';
import { getDefaultTimeControlId, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import { difficultyForQuickMatchRating } from '../quickMatchDifficulty.js';
import { loadRivalry } from '../rivalry.js';
import {
  buildMatthiasHomeCardModel,
  buildMatthiasHomeVisit,
  buildMatthiasIntroVisit,
  buildMatthiasLoginGreeting,
  markMatthiasHomeShown,
  markMatthiasOnboarded,
  matthiasHomeLastShownAt,
  matthiasHomeSessionSeen,
  matthiasIntroPlacement,
  matthiasOnboarded,
  shouldShowMatthiasHome,
} from '../matthiasHome.js';
import { consumeMatthiasLoginGreeting, matthiasLoginGreetingPending } from '../matthiasSession.js';
import { fetchMatthiasDailyStatus } from '../matthiasDaily.js';
import { matthiasSessionContext } from '../matthiasSessionContext.js';

export default function Menu({
  onNewGame,
  onContinue,
  onTournament,
  onTutorial,
  onOpenings,
  onPuzzle,
  onDailyChallenge,
  onTrainPersonal,
  onCombat,
  onCombatRoguelike,
  onSpectator,
  onHistory,
  onInsights,
  onProgress,
  onLab,
  hasSavedGame,
  loading,
  error,
  rating,
  suppressHomeNudge = false,
}) {
  const [difficulty, setDifficulty] = useState(50);
  const [autoDifficulty, setAutoDifficulty] = useState(true);
  const [color, setColor] = useState('random');
  const [timeControlId, setTimeControlId] = useState(() => getDefaultTimeControlId());
  const [seriesBestOf, setSeriesBestOf] = useState(1);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [threatCheck, setThreatCheck] = useState(false);
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [showPracticeMatch, setShowPracticeMatch] = useState(false);
  const [showMirrorMode, setShowMirrorMode] = useState(false);
  const [matthiasVisit, setMatthiasVisit] = useState(null);
  const [matthiasMemory, setMatthiasMemory] = useState(null);
  const matthiasRollRef = useRef(Math.random());

  const matthiasIntroPending = !matthiasOnboarded();
  const matthiasIntroBlocked = suppressHomeNudge
    || hasSavedGame
    || showQuickMatch
    || showPracticeMatch
    || showMirrorMode
    || Boolean(error);
  const matthiasCornerBlocked = suppressHomeNudge
    || showQuickMatch
    || showPracticeMatch
    || showMirrorMode
    || Boolean(error);
  const rivalry = useMemo(() => loadRivalry(), []);
  const matthiasCandidate = useMemo(
    () => buildMatthiasHomeVisit({ rivalry, memory: matthiasMemory, hasSavedGame }),
    [rivalry, matthiasMemory, hasSavedGame],
  );
  const matthiasSession = useMemo(() => matthiasSessionContext(), []);
  const matthiasCardModel = useMemo(
    () => buildMatthiasHomeCardModel({
      visit: matthiasVisit,
      memory: matthiasMemory,
      sessionContext: matthiasSession,
    }),
    [matthiasMemory, matthiasSession, matthiasVisit],
  );

  useEffect(() => {
    let active = true;
    if (!matthiasOnboarded()) return () => { active = false; };
    void fetchMatthiasDailyStatus()
      .then((status) => { if (active) setMatthiasMemory(status?.memory || null); })
      .catch(() => { if (active) setMatthiasMemory(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (matthiasVisit) return;

    if (matthiasIntroPending) {
      const introPlacement = matthiasIntroPlacement({
        onboarded: false,
        guideEnabled: false,
        guideVisible: false,
        blocked: matthiasIntroBlocked,
      });
      if (introPlacement !== 'visit') return;
      setMatthiasVisit(buildMatthiasIntroVisit());
      return;
    }

    if (matthiasIntroBlocked) return;
    if (matthiasLoginGreetingPending()) {
      consumeMatthiasLoginGreeting();
      setMatthiasVisit(buildMatthiasLoginGreeting());
      return;
    }

    const show = shouldShowMatthiasHome({
      hasOpenOverlay: matthiasIntroBlocked,
      hasPriorityAction: hasSavedGame,
      sessionSeen: matthiasHomeSessionSeen(),
      lastShownAt: matthiasHomeLastShownAt(),
      randomValue: matthiasRollRef.current,
      relationshipTier: matthiasMemory?.relationship?.tier || 'newcomer',
      visitKind: matthiasCandidate?.kind || 'generic',
    });
    if (!show) return;
    markMatthiasHomeShown();
    setMatthiasVisit(matthiasCandidate);
  }, [
    hasSavedGame,
    matthiasCandidate,
    matthiasIntroBlocked,
    matthiasIntroPending,
    matthiasMemory,
    matthiasVisit,
  ]);

  useEffect(() => {
    if (matthiasOnboarded()) return;
    if (matthiasVisit?.kind !== 'intro' || matthiasIntroBlocked) return;
    markMatthiasOnboarded();
    consumeMatthiasLoginGreeting();
    markMatthiasHomeShown();
  }, [matthiasIntroBlocked, matthiasVisit]);

  useEffect(() => {
    if (matthiasVisit?.kind !== 'login-greeting') return undefined;
    const timer = window.setTimeout(() => {
      setMatthiasVisit((current) => current?.kind === 'login-greeting' ? null : current);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [matthiasVisit?.kind]);

  useEffect(() => {
    const syncDefaultClock = () => setTimeControlId(getDefaultTimeControlId());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, syncDefaultClock);
    return () => window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, syncDefaultClock);
  }, []);

  function handleMatthiasAction() {
    const action = matthiasVisit?.action || 'insights';
    setMatthiasVisit(null);
    if (action === 'continue') { onContinue(); return; }
    if (action === 'train') { onTrainPersonal(); return; }
    if (action === 'insights') { onInsights(); return; }
    setShowQuickMatch(true);
  }

  return (
    <div className="menu menu-illustrated">
      <HomeIllustrated
        hasSavedGame={hasSavedGame}
        loading={loading}
        error={showQuickMatch || showPracticeMatch || showMirrorMode ? null : error}
        onPlay={() => setShowQuickMatch(true)}
        onContinue={onContinue}
        onTournament={onTournament}
        onTrain={onTutorial}
        onCombat={onCombatRoguelike}
        onDaily={() => onDailyChallenge()}
        onHistory={onHistory}
        onInsights={onInsights}
        matthiasModel={matthiasCardModel}
        matthiasSpeaking={Boolean(matthiasVisit) && !matthiasCornerBlocked}
        onMatthiasAction={handleMatthiasAction}
        onMatthiasDismiss={() => setMatthiasVisit(null)}
        tools={[
          ['Puzzles personales', onTrainPersonal],
          ['Puzzles clásicos', onPuzzle],
          ['Aperturas', onOpenings],
          ['Partida de práctica', () => setShowPracticeMatch(true)],
          ['Modo espejo', () => setShowMirrorMode(true)],
          ['Combat Chess libre', onCombat],
          ['Espectador', onSpectator],
          ['Mi progreso', onProgress],
          ['Experimentos geniales', onLab],
        ]}
      />

      {showQuickMatch && (
        <QuickMatchModal
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          autoDifficulty={autoDifficulty}
          setAutoDifficulty={setAutoDifficulty}
          color={color}
          setColor={setColor}
          timeControlId={timeControlId}
          setTimeControlId={setTimeControlId}
          seriesBestOf={seriesBestOf}
          setSeriesBestOf={setSeriesBestOf}
          suddenDeath={suddenDeath}
          setSuddenDeath={setSuddenDeath}
          threatCheck={threatCheck}
          setThreatCheck={setThreatCheck}
          loading={loading}
          error={error}
          rating={rating}
          onStart={async () => {
            const started = await onNewGame(
              autoDifficulty ? difficultyForQuickMatchRating(rating?.rating ?? 400) : difficulty,
              color,
              {
                timeControlId,
                seriesBestOf,
                suddenDeath,
                threatCheck,
                adaptiveDifficulty: autoDifficulty,
              },
            );
            if (started) setShowQuickMatch(false);
          }}
          onClose={() => setShowQuickMatch(false)}
        />
      )}

      {showPracticeMatch && (
        <PracticeMatchModal
          color={color}
          setColor={setColor}
          timeControlId={timeControlId}
          setTimeControlId={setTimeControlId}
          loading={loading}
          error={error}
          rating={rating}
          onStart={async ({ difficulty: practiceDifficulty, adaptiveDifficulty }) => {
            const started = await onNewGame(practiceDifficulty, color, {
              learning: true,
              timeControlId,
              adaptiveDifficulty,
            });
            if (started) setShowPracticeMatch(false);
          }}
          onClose={() => setShowPracticeMatch(false)}
        />
      )}

      {showMirrorMode && (
        <MirrorModeModal
          loading={loading}
          error={error}
          onStart={async (profile) => {
            const started = await onNewGame(profile.difficulty, 'random', {
              ghost: true,
              ghostStyle: profile.style,
            });
            if (started) setShowMirrorMode(false);
          }}
          onClose={() => setShowMirrorMode(false)}
        />
      )}
    </div>
  );
}
