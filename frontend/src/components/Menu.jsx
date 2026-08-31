import { useEffect, useMemo, useRef, useState } from 'react';
import { difficultyLabel } from '../difficulty.js';
import { levelForPoints, pointsIntoLevel, POINTS_PER_LEVEL } from '../tournament.js';
import { IconBookmark, IconTrophy, IconBulb, IconBook, IconPuzzle, IconSword, IconEye, IconPawn } from './Icons.jsx';
import QuickMatchModal from './QuickMatchModal.jsx';
import MirrorModeModal from './MirrorModeModal.jsx';
import ModeTutorialTip from './ModeTutorialTip.jsx';
import HomePlayNudge from './HomePlayNudge.jsx';
import { COMBAT_CHESS_FREE_LABEL, COMBAT_CHESS_CAMPAIGN_LABEL } from '../combatChessBrand.js';
import { currentDailyStreak, dailyChallengeDayKey } from '../dailyChallenge.js';
import { loadGameActivity } from '../gameActivity.js';
import { buildHomeToday, dailyMissionActionProps } from '../homeToday.js';
import { getDefaultTimeControlId, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import { shouldEnableHomePlayNudge } from '../homePlayNudgePolicy.js';
import { STORAGE_LOCAL, getStorageItem } from '../safeStorage.js';
import { removeProfileStorageItem, setProfileStorageItem } from '../profileKeys.js';
import { homeNextBestAction } from '../nextBestAction.js';
import { difficultyForRating } from '../playerRating.js';
import { HOME_GUIDE_KEY, HOME_GUIDE_OPEN_EVENT } from '../homeGuide.js';
import tournamentCardArt from '../assets/home-modes/tournament.webp';
import combatCardArt from '../assets/home-modes/combat.webp';
import quickCardArt from '../assets/home-modes/quick.webp';
import { buildHomeOnboarding, isFreshAccount, markOnboardingInsightsSeen, onboardingInsightsSeen } from '../homeOnboarding.js';
import { loadPuzzlesSolved } from '../puzzleStats.js';
import { APP_RELEASE } from '../release.js';
import { loadRivalry } from '../rivalry.js';
import { buildMatthiasHomeCardModel, buildMatthiasHomeVisit, buildMatthiasIntroVisit, buildMatthiasLoginGreeting, markMatthiasHomeShown, markMatthiasOnboarded, matthiasHomeLastShownAt, matthiasHomeSessionSeen, matthiasIntroPlacement, matthiasOnboarded, shouldShowMatthiasHome } from '../matthiasHome.js';
import { consumeMatthiasLoginGreeting, matthiasLoginGreetingPending } from '../matthiasSession.js';
import MatthiasHomeVisit from './MatthiasHomeVisit.jsx';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import { fetchMatthiasDailyStatus } from '../matthiasDaily.js';
import { matthiasSessionContext } from '../matthiasSessionContext.js';
import { loadMatthiasSchoolProgress, matthiasSchoolSummary } from '../matthiasSchool.js';

function TutorialModeCard({ tutorialId, className, children, ...buttonProps }) {
  return (
    <div className="menu-card-shell">
      <button type="button" className={className} {...buttonProps}>{children}</button>
      <ModeTutorialTip tutorialId={tutorialId} />
    </div>
  );
}

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
  tournament,
  rating,
  combatProgress,
  suppressHomeNudge = false,
  features = {},
}) {
  const [difficulty, setDifficulty] = useState(50);
  const [autoDifficulty, setAutoDifficulty] = useState(true);
  const [color, setColor] = useState('random');
  const [timeControlId, setTimeControlId] = useState(() => getDefaultTimeControlId());
  const [seriesBestOf, setSeriesBestOf] = useState(1);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [threatCheck, setThreatCheck] = useState(false);
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [showMirrorMode, setShowMirrorMode] = useState(false);
  const [footerPanel, setFooterPanel] = useState(null);
  const [showHomeGuide, setShowHomeGuide] = useState(() => getStorageItem(STORAGE_LOCAL, HOME_GUIDE_KEY) !== '1');
  const [matthiasVisit, setMatthiasVisit] = useState(null);
  const [matthiasMemory, setMatthiasMemory] = useState(null);
  const [matthiasGuidesInitialWelcome] = useState(() => getStorageItem(STORAGE_LOCAL, HOME_GUIDE_KEY) !== '1' && !matthiasOnboarded());
  const matthiasRollRef = useRef(Math.random());
  const tournamentLevel = levelForPoints(tournament.progressPoints || 0);
  const tournamentProgress = pointsIntoLevel(tournament.progressPoints || 0);
  const tournamentProgressPct = Math.round((tournamentProgress / POINTS_PER_LEVEL) * 100);
  const matthiasIntroPending = !matthiasOnboarded();
  const matthiasIntroBlocked = suppressHomeNudge || hasSavedGame || showQuickMatch || showMirrorMode || Boolean(footerPanel) || Boolean(error);
  // Una acción prioritaria (p. ej. Continuar partida) silencia el bocadillo,
  // pero no debe borrar al personaje residente de Home. Los overlays reales sí.
  const matthiasCornerBlocked = suppressHomeNudge || showQuickMatch || showMirrorMode || Boolean(footerPanel) || Boolean(error);
  const blockingHomeOverlay = matthiasIntroBlocked || showHomeGuide;
  const hasOpenOverlay = blockingHomeOverlay || Boolean(matthiasVisit);
  const homePlayNudgeEnabled = shouldEnableHomePlayNudge({ suppressHomeNudge, hasOpenOverlay, loggingOut: false, hasSavedGame });
  const activity = useMemo(() => loadGameActivity(), []);
  const today = useMemo(() => buildHomeToday({
    daily: currentDailyStreak(),
    todayKey: dailyChallengeDayKey(),
    activity,
  }), []);
  const nextAction = useMemo(() => homeNextBestAction(activity), [activity]);
  const rivalry = useMemo(() => loadRivalry(), []);
  const matthiasCandidate = useMemo(() => buildMatthiasHomeVisit({ rivalry, memory: matthiasMemory, hasSavedGame }), [rivalry, matthiasMemory, hasSavedGame]);
  const matthiasSession = useMemo(() => matthiasSessionContext(), [activity]);
  const schoolSummary = useMemo(() => matthiasSchoolSummary(loadMatthiasSchoolProgress()), []);
  const matthiasCardModel = useMemo(() => buildMatthiasHomeCardModel({ visit: matthiasVisit, memory: matthiasMemory, sessionContext: matthiasSession }), [matthiasMemory, matthiasSession, matthiasVisit]);
  const freshAccount = useMemo(() => isFreshAccount({ activity, tournament }), [activity, tournament]);
  const onboarding = useMemo(() => buildHomeOnboarding({
    activity,
    puzzlesSolved: loadPuzzlesSolved(),
    insightsSeen: onboardingInsightsSeen(),
    schoolStarted: schoolSummary.completed > 0,
  }), [activity, schoolSummary.completed]);

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
    // En una cuenta nueva Matthias no compite con la guía: la propia guía es
    // su presentación. Si la guía no está disponible, conserva el nudge
    // independiente como fallback para perfiles que aún no lo conocen.
    if (matthiasIntroPending) {
      const introPlacement = matthiasIntroPlacement({
        onboarded: false,
        guideEnabled: features.homeGuide !== false,
        guideVisible: showHomeGuide,
        blocked: matthiasIntroBlocked,
      });
      if (introPlacement !== 'visit') return;
      setMatthiasVisit(buildMatthiasIntroVisit());
      return;
    }
    if (blockingHomeOverlay) return;
    if (matthiasLoginGreetingPending()) {
      consumeMatthiasLoginGreeting();
      setMatthiasVisit(buildMatthiasLoginGreeting());
      return;
    }
    const show = shouldShowMatthiasHome({
      hasOpenOverlay: blockingHomeOverlay,
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
  }, [blockingHomeOverlay, features.homeGuide, hasSavedGame, matthiasCandidate, matthiasIntroBlocked, matthiasIntroPending, matthiasVisit, showHomeGuide]);

  useEffect(() => {
    if (matthiasOnboarded()) return;
    const standaloneIntroVisible = matthiasVisit?.kind === 'intro';
    const guideIntroVisible = matthiasGuidesInitialWelcome
      && features.homeGuide !== false
      && showHomeGuide
      && !matthiasIntroBlocked;
    if (!standaloneIntroVisible && !guideIntroVisible) return;
    // Se marca sólo después de que React haya pintado una presentación real.
    // `matthiasGuidesInitialWelcome` es un snapshot de esta primera visita, de
    // modo que el texto no desaparece al persistir la marca de onboarding.
    markMatthiasOnboarded();
    consumeMatthiasLoginGreeting();
    markMatthiasHomeShown();
  }, [features.homeGuide, matthiasGuidesInitialWelcome, matthiasIntroBlocked, matthiasVisit, showHomeGuide]);

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

  useEffect(() => {
    const reopenGuide = () => {
      removeProfileStorageItem(HOME_GUIDE_KEY);
      setShowHomeGuide(true);
    };
    window.addEventListener(HOME_GUIDE_OPEN_EVENT, reopenGuide);
    return () => window.removeEventListener(HOME_GUIDE_OPEN_EVENT, reopenGuide);
  }, []);

  function reopenHomeGuide() {
    removeProfileStorageItem(HOME_GUIDE_KEY);
    setShowHomeGuide(true);
  }

  function dismissHomeGuide() {
    // "Ahora no" y la X posponen la guía; nunca destruyen el progreso.
    // Si quedan pasos, Home mantiene un acceso explícito para retomarla.
    setProfileStorageItem(HOME_GUIDE_KEY, '1');
    setShowHomeGuide(false);
  }

  const homeGuideResumeLabel = onboarding.complete
    ? 'Guía rápida'
    : `Retomar guía · ${onboarding.completed}/${onboarding.steps.length}`;

  function hideHomeGuideForStep() {
    // Seguir el recorrido no equivale a descartarlo. Al volver a Home, el
    // siguiente paso real debe reaparecer hasta que el usuario lo cierre.
    setShowHomeGuide(false);
  }

  function openOnboardingInsights() {
    markOnboardingInsightsSeen();
    hideHomeGuideForStep();
    onInsights();
  }

  function openOnboardingStep(stepId) {
    if (stepId === 'school') { hideHomeGuideForStep(); onTutorial(); return; }
    if (stepId === 'game') { hideHomeGuideForStep(); if (hasSavedGame) onContinue(); else onTournament(); return; }
    if (stepId === 'puzzle') { hideHomeGuideForStep(); onPuzzle(); return; }
    if (stepId === 'insights') { openOnboardingInsights(); }
  }

  function handleMatthiasAction() {
    const action = matthiasVisit?.action || 'insights';
    setMatthiasVisit(null);
    if (action === 'continue') { onContinue(); return; }
    if (action === 'train') { onTrainPersonal(); return; }
    if (action === 'insights') { onInsights(); return; }
    setShowQuickMatch(true);
  }

  function onboardingCue(stepId) {
    if (!showHomeGuide || onboarding.next !== stepId) return null;
    const index = onboarding.steps.findIndex((step) => step.id === stepId);
    return <span className="home-onboarding-cue" aria-hidden="true">PASO {index + 1}/{onboarding.steps.length} · SIGUIENTE</span>;
  }

  function onboardingTargetClass(stepId) {
    return showHomeGuide && onboarding.next === stepId ? ' home-onboarding-target is-next' : '';
  }

  return (
    <div className="menu home-friendly">
      {hasSavedGame && (
        <div className="menu-group home-continue-group">
          <button type="button" className={`home-continue-card${showHomeGuide && onboarding.next === 'game' ? ' home-onboarding-target is-next' : ''}`} disabled={loading} onClick={onContinue}>
            {showHomeGuide && onboarding.next === 'game' ? onboardingCue('game') : null}
            <span className="home-continue-icon" aria-hidden="true"><IconBookmark /></span>
            <span className="home-continue-copy">
              <span className="section-label">Partida en curso</span>
              <strong>Continuar partida</strong>
              <small>Vuelve al tablero exactamente donde lo dejaste.</small>
            </span>
            <span className="home-continue-cta">Volver al tablero →</span>
          </button>
        </div>
      )}

      {features.homeGuide !== false && showHomeGuide && (
        <section className="home-start-guide" aria-label="Guía rápida de Chess Studio">
          <button type="button" className="home-start-guide-close" onClick={dismissHomeGuide} aria-label="Cerrar guía rápida">×</button>
          <div className="home-start-guide-copy home-start-guide-matthias">
            <img className="home-start-guide-avatar" src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
            <div className="home-start-guide-copy-body">
              <span className="section-label">{CPU_IDENTITY.name} · GUÍA DE CAMPO · {onboarding.completed}/{onboarding.steps.length}</span>
              <h2>{matthiasGuidesInitialWelcome ? 'Guten Morgen. Soy Matthias.' : onboarding.complete ? 'Ya conoces el circuito básico.' : freshAccount ? 'Cuatro pasos y ya sabes dónde está todo.' : 'Sigue desde el siguiente paso útil.'}</h2>
              <p>{matthiasGuidesInitialWelcome
                ? 'El mayor cabronazo ajedrecista a este lado del Tajo. Te ayudaré a triunfar o fracasar; lo que tú decidas. Empezamos en mi Escuela: tablero, cinco cursos y exámenes de promoción. Después ya te suelto por Chess Studio.'
                : onboarding.complete ? 'Bien. Ya sabes moverte por aquí. Juega, entrena y revisa tu diagnóstico cuando te apetezca.' : 'No necesitas aprender todos los modos ahora. El resplandor dorado marca tu siguiente paso; vuelve a Home y yo seguiré desde donde toca.'}</p>
            </div>
          </div>
          <div className="home-start-guide-path" aria-label="Primeros pasos de Chess Studio">
            {onboarding.steps.map((step, index) => (
              <button
                type="button"
                key={step.id}
                className={`${step.done ? 'is-done' : ''} ${onboarding.next === step.id ? 'is-next' : ''}`.trim()}
                onClick={() => openOnboardingStep(step.id)}
                aria-label={`${step.label}. ${step.detail}`}
              >
                <i aria-hidden="true">{step.done ? '✓' : index + 1}</i>
                <b>{step.label}</b>
                <small>{step.detail}</small>
                <em className="home-start-guide-link-arrow" aria-hidden="true">→</em>
              </button>
            ))}
          </div>
          {onboarding.next === 'game' && (
            <p className="home-onboarding-tip"><b>Reto de partida:</b> a veces Torneo te propone un objetivo extra para esa partida. Es opcional, no cambia las reglas ni el rating y sirve como meta concreta de progreso.</p>
          )}
          {!onboarding.complete && (
            <div className="home-start-guide-actions">
              <button type="button" className="secondary-btn" onClick={dismissHomeGuide}>Ahora no</button>
            </div>
          )}
        </section>
      )}

      {error && !showQuickMatch && !showMirrorMode && <div className="home-error-banner" role="alert"><b>No se pudo completar la acción.</b><span>{error}</span></div>}

      <section className={`home-today-card ${today.dailyFull ? 'is-complete' : today.dailySolved ? 'is-active' : ''}`} aria-label="Hoy en Chess Studio">
        <div className="home-today-emblem" aria-hidden="true">♞</div>
        <div className="home-today-copy">
          <span className="section-label">DESAFÍO DIARIO</span>
          <strong>{today.dailyHeadline}</strong>
          <small>{today.dailyDetail}</small>
        </div>
        <div className="home-today-missions" aria-label={`${today.dailySolvedCount || 0} de 3 desafíos completados`}>
          {(today.dailySlots || []).map((slot) => {
            const action = dailyMissionActionProps(slot, onDailyChallenge);
            return (
              <button
                type="button"
                key={slot.id}
                className={slot.solved ? 'done' : ''}
                onClick={action.onClick}
                aria-label={action.ariaLabel}
              >
                <i aria-hidden="true">{slot.solved ? '✓' : '·'}</i><b>{slot.label}</b>
              </button>
            );
          })}
        </div>
        <div className="home-today-streaks" aria-label="Rachas de desafío diario">
          <span>Racha <b>{today.streak || 0}</b></span><i>·</i><span>Mejor <b>{today.bestStreak || 0}</b></span>
        </div>
        <div className="home-today-actions">
          <button type="button" className={today.dailySolved ? 'secondary-btn' : 'primary-btn'} onClick={onDailyChallenge}>
            {today.dailyFull ? 'Revisar 3/3' : today.dailySolved ? `Seguir · ${today.dailySolvedCount || 0}/3 →` : 'Jugar ahora →'}
          </button>
        </div>
      </section>

      {nextAction && (
        <section className="home-next-action" aria-label="Recomendación para tu próxima partida">
          <div><span className="section-label">{nextAction.eyebrow}</span><strong>{nextAction.title}</strong><small>{nextAction.detail}</small></div>
          <button type="button" className="secondary-btn" onClick={() => {
            if (nextAction.id === 'practice') onNewGame(difficulty, color, { learning: true, timeControlId });
            else if (nextAction.id === 'tournament') onTournament();
            else setShowQuickMatch(true);
          }}>{nextAction.label} →</button>
        </section>
      )}

      {!showHomeGuide && !matthiasCornerBlocked && (
        <MatthiasHomeVisit
          model={matthiasCardModel}
          speaking={Boolean(matthiasVisit)}
          onAction={handleMatthiasAction}
          onDismiss={() => setMatthiasVisit(null)}
          onOpenInsights={onInsights}
        />
      )}

      <section className="menu-group home-primary-group home-modes-section" aria-label="Modos principales">
        <div className="home-group-heading">
          <div><span className="section-label">Jugar</span><h2>Elige tu próxima partida</h2></div>
          <div className="home-heading-actions"><p>Compite, continúa tu campaña o juega a tu ritmo.</p>{features.homeGuide !== false && !showHomeGuide && <button type="button" className="home-context-guide" onClick={reopenHomeGuide} aria-label={onboarding.complete ? 'Abrir guía rápida' : `Retomar guía, ${onboarding.completed} de ${onboarding.steps.length} pasos completados`}><span>?</span> {homeGuideResumeLabel}</button>}</div>
        </div>
        <div className="menu-grid menu-grid-3 home-primary-grid">
          <TutorialModeCard tutorialId="tournament" className={`menu-card accent-brass home-primary-card home-mode-card home-mode-featured${hasSavedGame ? '' : onboardingTargetClass('game')}`} onClick={onTournament}>
            {hasSavedGame ? null : onboardingCue('game')}
            <img className="home-mode-art" src={tournamentCardArt} alt="" aria-hidden="true" />
            <span className="home-mode-icon" aria-hidden="true"><IconTrophy className="menu-card-icon" /></span>
            <span className="home-mode-copy">
              <span className="home-mode-kicker"><b>Recomendado</b><i>Nivel {tournamentLevel}</i></span>
              <h3>Torneo</h3>
              <span className="home-mode-description">Encadena rivales, sube de nivel y construye una racha.</span>
            </span>
            <span className="home-mode-progress" aria-label={`${tournamentProgress} de ${POINTS_PER_LEVEL} XP para el siguiente nivel`}>
              <span><i style={{ width: `${tournamentProgressPct}%` }} /></span>
              <small>{tournamentProgress}/{POINTS_PER_LEVEL} XP</small>
            </span>
            <span className="menu-card-cta">Jugar siguiente rival <b aria-hidden="true">→</b></span>
          </TutorialModeCard>

          <TutorialModeCard tutorialId="combat-campaign" className="menu-card accent-danger home-primary-card home-mode-card home-mode-campaign" onClick={onCombatRoguelike}>
            <img className="home-mode-art" src={combatCardArt} alt="" aria-hidden="true" />
            <span className="home-mode-icon" aria-hidden="true"><IconSword className="menu-card-icon" /></span>
            <span className="home-mode-copy">
              <span className="home-mode-kicker"><b>{combatProgress?.rank?.label || 'Recluta'}</b><i>{combatProgress?.credits || 0} créditos</i></span>
              <h3>{COMBAT_CHESS_CAMPAIGN_LABEL}</h3>
              <span className="home-mode-description">Tu ejército gana experiencia, rango y recursos entre sectores.</span>
            </span>
            <span className="home-mode-progress" aria-label={`Progreso hacia el siguiente rango de Combat: ${Math.round((combatProgress?.nextProgress || 0) * 100)}%`}><span><i style={{ width: `${Math.round((combatProgress?.nextProgress || 0) * 100)}%` }} /></span><small>{Math.round((combatProgress?.nextProgress || 0) * 100)}% al siguiente rango</small></span>
            <span className="menu-card-cta">Continuar campaña <b aria-hidden="true">→</b></span>
          </TutorialModeCard>

          <TutorialModeCard tutorialId="quick-match-rules" className="menu-card accent-hint home-primary-card home-mode-card home-mode-quick" onClick={() => setShowQuickMatch(true)}>
            <img className="home-mode-art" src={quickCardArt} alt="" aria-hidden="true" />
            <span className="home-mode-icon" aria-hidden="true"><IconPawn className="menu-card-icon" /></span>
            <span className="home-mode-copy">
              <span className="home-mode-kicker"><b>A tu ritmo</b><i>CPU adaptable</i></span>
              <h3>Partida rápida</h3>
              <span className="home-mode-description">Una partida limpia contra una CPU ajustada a tu nivel.</span>
            </span>
            <span className="menu-card-cta">Nivel {difficulty} · {difficultyLabel(difficulty)} <b aria-hidden="true">→</b></span>
          </TutorialModeCard>
        </div>

        <details className="friendly-disclosure home-more-modes">
          <summary>Más modos de juego</summary>
          <div className="friendly-disclosure-body menu-grid menu-grid-4 compact-mode-grid">
            <TutorialModeCard tutorialId="combat-basics" className="menu-card accent-danger" onClick={onCombat}>
              <IconSword className="menu-card-icon" /><h3>{COMBAT_CHESS_FREE_LABEL}</h3><p>Batalla libre sin campaña.</p><span className="menu-card-cta">Preparar →</span>
            </TutorialModeCard>
            {features.rivalGhost !== false && <TutorialModeCard tutorialId="rival-ghost" className="menu-card accent-hint" onClick={() => setShowMirrorMode(true)}>
              <IconEye className="menu-card-icon" /><h3>Rival Fantasma</h3><p>CPU basada en tendencias reales de tu juego.</p><span className="menu-card-cta">Jugar →</span>
            </TutorialModeCard>}
            {features.spectator !== false && <TutorialModeCard tutorialId="spectator" className="menu-card accent-hint" onClick={onSpectator}>
              <IconEye className="menu-card-icon" /><h3>Espectador</h3><p>CPU contra CPU. Tú miras el incendio.</p><span className="menu-card-cta">Mirar →</span>
            </TutorialModeCard>}
            <TutorialModeCard tutorialId="lab" className="menu-card accent-success" onClick={onLab}>
              <IconPuzzle className="menu-card-icon" /><h3>Laboratorio</h3><p>Construye, pega o prueba una posición y juégala.</p><span className="menu-card-cta">Abrir →</span>
            </TutorialModeCard>
          </div>
        </details>
      </section>

      <div className="menu-group home-primary-group">
        <div className="home-group-heading">
          <div><span className="section-label">Mejorar</span><h2>Aprender y practicar</h2></div>
          <div className="home-heading-actions"><p>Analiza, entrena y vuelve al tablero con una idea clara.</p><div><button type="button" className="home-context-guide" onClick={onTutorial}><span>?</span> Aprende a jugar</button><button type="button" className="home-progress-link" onClick={onProgress}>Ver mi progreso →</button></div></div>
        </div>
        <div className="menu-grid menu-grid-3 home-primary-grid home-learning-grid">
          <TutorialModeCard tutorialId="insights" className={`menu-card accent-hint home-primary-card home-mode-card home-learning-card${onboardingTargetClass('insights')}`} onClick={() => { markOnboardingInsightsSeen(); onInsights(); }}>
            {onboardingCue('insights')}
            <span className="home-mode-icon" aria-hidden="true"><IconEye className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Diagnóstico</b><i>Tu juego real</i></span><h3>Así juegas</h3><span className="home-mode-description">Tu prioridad actual y una acción concreta para mejorar.</span></span><span className="menu-card-cta">Ver diagnóstico <b aria-hidden="true">→</b></span>
          </TutorialModeCard>

          <TutorialModeCard tutorialId="puzzles" className="menu-card accent-danger home-primary-card home-mode-card home-learning-card" onClick={onTrainPersonal}>
            <span className="home-mode-icon" aria-hidden="true"><IconPuzzle className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Puzzles personales</b><i>Desde tus partidas</i></span><h3>Entrena tus mayores errores</h3><span className="home-mode-description">Tus errores reales se convierten en posiciones para que no vuelvas a pisar el mismo rastrillo.</span></span><span className="menu-card-cta">Entrenar pendientes <b aria-hidden="true">→</b></span>
          </TutorialModeCard>

          <button type="button" className={`menu-card accent-success home-primary-card home-mode-card home-learning-card home-school-card${onboardingTargetClass('school')}`} onClick={onTutorial}>
            {onboardingCue('school')}
            <span className="home-mode-icon" aria-hidden="true"><IconBook className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>5 cursos · con examen</b><i>{schoolSummary.complete ? 'Graduado' : `${schoolSummary.currentCourseLabel} · ${schoolSummary.currentCourseCompleted}/${schoolSummary.currentCourseTotal}`}</i></span><h3>Escuela de Matthias</h3><span className="home-mode-description">Del movimiento básico al cálculo avanzado, siempre hands-on sobre el tablero. Aprueba cada examen para desbloquear el siguiente curso.</span></span><span className="menu-card-cta">{schoolSummary.completed > 0 ? 'Continuar formación' : 'Empezar por aquí'} <b aria-hidden="true">→</b></span>
          </button>
        </div>

        <details className="friendly-disclosure home-learning-more" open={showHomeGuide && onboarding.next === 'puzzle' ? true : undefined}>
          <summary>Más aprendizaje y herramientas</summary>
          <div className="friendly-disclosure-body menu-grid compact-mode-grid home-tools-grid">
            <TutorialModeCard tutorialId="puzzles" className={`menu-card accent-hint home-mode-card home-tool-card${onboardingTargetClass('puzzle')}`} onClick={onPuzzle}>
              {onboardingCue('puzzle')}
              <span className="home-mode-icon" aria-hidden="true"><IconPuzzle className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Táctica</b><i>Diario</i></span><h3>Puzzles</h3><span className="home-mode-description">Casos clásicos y un reto nuevo cada día.</span></span><span className="menu-card-cta">Resolver <b aria-hidden="true">→</b></span>
            </TutorialModeCard>
            <TutorialModeCard tutorialId="practice" className="menu-card accent-success home-mode-card home-tool-card" disabled={loading} onClick={() => onNewGame(difficulty, color, { learning: true, timeControlId })}>
              <span className="home-mode-icon" aria-hidden="true"><IconBulb className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Sin presión</b><i>No afecta al rating</i></span><h3>Partida de práctica</h3><span className="home-mode-description">Juega con pistas gratuitas y aplica lo aprendido.</span></span><span className="menu-card-cta">Empezar práctica <b aria-hidden="true">→</b></span>
            </TutorialModeCard>
            <TutorialModeCard tutorialId="openings" className="menu-card accent-success home-mode-card home-tool-card" onClick={onOpenings}>
              <span className="home-mode-icon" aria-hidden="true"><IconBookmark className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Repertorio</b><i>Paso a paso</i></span><h3>Aperturas</h3><span className="home-mode-description">Ensaya líneas útiles con contexto y repetición.</span></span><span className="menu-card-cta">Practicar <b aria-hidden="true">→</b></span>
            </TutorialModeCard>
            <button type="button" className="menu-card accent-brass home-mode-card home-tool-card" onClick={onHistory}>
              <span className="home-mode-icon" aria-hidden="true"><IconBookmark className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Archivo</b><i>Replays</i></span><h3>Historial</h3><span className="home-mode-description">Resultados, partidas guardadas y revisiones.</span></span><span className="menu-card-cta">Abrir <b aria-hidden="true">→</b></span>
            </button>
          </div>
        </details>
      </div>

      <footer className="home-footer" aria-label="Información de Chess Studio">
        <div className="home-footer-bar">
          <nav className="home-footer-links" aria-label="Ayuda y detalles">
            {[
              ['faq', 'FAQ'],
              ['shortcuts', 'Atajos'],
              ['privacy', 'Privacidad y datos'],
              ['about', 'Acerca de'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={footerPanel === id ? 'is-active' : ''}
                aria-expanded={footerPanel === id}
                aria-controls="home-footer-detail"
                onClick={() => setFooterPanel((current) => current === id ? null : id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <span className="home-footer-release">{APP_RELEASE}</span>
        </div>

        {footerPanel && (
          <section id="home-footer-detail" className="home-footer-detail" aria-label={footerPanel === 'faq' ? 'Preguntas frecuentes' : footerPanel === 'shortcuts' ? 'Atajos' : footerPanel === 'privacy' ? 'Privacidad y datos' : 'Acerca de Chess Studio'}>
            <button type="button" className="home-footer-close" onClick={() => setFooterPanel(null)} aria-label="Cerrar detalle">×</button>
            {footerPanel === 'faq' && (
              <>
                <span className="section-label">FAQ</span>
                <h3>Preguntas frecuentes</h3>
                <dl className="home-footer-faq">
                  <div><dt>¿Por dónde empiezo?</dt><dd>Partida rápida va al grano; Torneo añade progresión; Combat Chess es la campaña táctica persistente.</dd></div>
                  <div><dt>¿La práctica cambia mi rating?</dt><dd>No. La partida de práctica está pensada para probar ideas y usar pistas sin tocar el rating.</dd></div>
                  <div><dt>¿Qué es un Reto de partida?</dt><dd>Un objetivo opcional para esa partida —por ejemplo ganar sin pistas o llegar a cierto movimiento—. No cambia las reglas ni el rating; sí puede contar para progreso y logros.</dd></div>
                  <div><dt>¿Qué son los puzzles personales?</dt><dd>Posiciones nacidas de errores reales de tus partidas para volver a entrenar justo lo que más se repite.</dd></div>
                  <div><dt>¿Se guarda una partida en curso?</dt><dd>Chess Studio intenta conservar la sesión activa y muestra el estado de guardado durante la partida. Si una recuperación falla, ofrece reintento antes de descartar nada.</dd></div>
                </dl>
              </>
            )}
            {footerPanel === 'shortcuts' && (
              <>
                <span className="section-label">Controles</span>
                <h3>Atajos útiles</h3>
                <div className="home-footer-shortcuts">
                  <span><kbd>Esc</kbd><b>Volver o cerrar</b></span>
                  <span><kbd>Clic derecho</kbd><b>Volver o cerrar</b></span>
                  <span><kbd>← / →</kbd><b>Avanzar o retroceder en replays</b></span>
                  <span><kbd>Media keys</kbd><b>Controlar Retro Player</b></span>
                </div>
              </>
            )}
            {footerPanel === 'privacy' && (
              <>
                <span className="section-label">Privacidad</span>
                <h3>Datos que usa Chess Studio</h3>
                <p>El juego guarda progreso, preferencias, partidas y estadísticas necesarias para sus funciones. Para operación y seguridad el servicio puede registrar datos técnicos como IP de cliente, release, presencia aproximada y errores.</p>
                <p>No se recopila telemetría de clics, movimiento de ratón, pulsaciones de teclado ni contenido privado de la partida como señal de presencia.</p>
              </>
            )}
            {footerPanel === 'about' && (
              <>
                <span className="section-label">Chess Studio</span>
                <h3>Juega, aprende, compite.</h3>
                <p>Un estudio de ajedrez con partida clásica, entrenamiento basado en tu juego real y Combat Chess para cuando ocho peones normales ya te parecen demasiado civilizados.</p>
                <small>Release {APP_RELEASE}</small>
              </>
            )}
          </section>
        )}
      </footer>

      <HomePlayNudge
        enabled={homePlayNudgeEnabled}
        hasSavedGame={hasSavedGame}
        onContinue={onContinue}
        onPlay={() => setShowQuickMatch(true)}
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
            const started = await onNewGame(autoDifficulty ? difficultyForRating(rating?.rating ?? 400) : difficulty, color, { timeControlId, seriesBestOf, suddenDeath, threatCheck, adaptiveDifficulty: autoDifficulty });
            if (started) setShowQuickMatch(false);
          }}
          onClose={() => setShowQuickMatch(false)}
        />
      )}
      {showMirrorMode && (
        <MirrorModeModal
          loading={loading}
          error={error}
          onStart={async (profile) => {
            const started = await onNewGame(profile.difficulty, 'random', { ghost: true, ghostStyle: profile.style });
            if (started) setShowMirrorMode(false);
          }}
          onClose={() => setShowMirrorMode(false)}
        />
      )}
    </div>
  );
}
