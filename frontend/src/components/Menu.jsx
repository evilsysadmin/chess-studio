import { useEffect, useMemo, useState } from 'react';
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
import { buildHomeToday } from '../homeToday.js';
import { getDefaultTimeControlId, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import { shouldEnableHomePlayNudge } from '../homePlayNudgePolicy.js';
import { STORAGE_LOCAL, getStorageItem } from '../safeStorage.js';
import { setProfileStorageItem } from '../profileKeys.js';
import { homeNextBestAction } from '../nextBestAction.js';
import { difficultyForRating } from '../playerRating.js';
import { HOME_GUIDE_KEY, HOME_GUIDE_OPEN_EVENT } from '../homeGuide.js';
import tournamentCardArt from '../assets/home-modes/tournament.webp';
import combatCardArt from '../assets/home-modes/combat.webp';
import quickCardArt from '../assets/home-modes/quick.webp';
import UserReleaseNotesModal from './UserReleaseNotesModal.jsx';
import { APP_RELEASE } from '../release.js';
import { USER_RELEASE_NOTES_KEY } from '../userReleaseNotes.js';
import { buildHomeOnboarding, isFreshAccount, markOnboardingInsightsSeen, onboardingInsightsSeen } from '../homeOnboarding.js';
import { loadPuzzlesSolved } from '../puzzleStats.js';

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
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [seenReleaseNotes, setSeenReleaseNotes] = useState(() => getStorageItem(STORAGE_LOCAL, USER_RELEASE_NOTES_KEY) === APP_RELEASE);
  const [showHomeGuide, setShowHomeGuide] = useState(() => getStorageItem(STORAGE_LOCAL, HOME_GUIDE_KEY) !== '1');
  const tournamentLevel = levelForPoints(tournament.progressPoints || 0);
  const tournamentProgress = pointsIntoLevel(tournament.progressPoints || 0);
  const tournamentProgressPct = Math.round((tournamentProgress / POINTS_PER_LEVEL) * 100);
  const hasOpenOverlay = showQuickMatch || showMirrorMode || showReleaseNotes;
  const homePlayNudgeEnabled = shouldEnableHomePlayNudge({ suppressHomeNudge, hasOpenOverlay, loggingOut: false, hasSavedGame });
  const activity = useMemo(() => loadGameActivity(), []);
  const today = useMemo(() => buildHomeToday({
    daily: currentDailyStreak(),
    todayKey: dailyChallengeDayKey(),
    activity,
  }), []);
  const nextAction = useMemo(() => homeNextBestAction(activity), [activity]);
  const freshAccount = useMemo(() => isFreshAccount({ activity, tournament }), [activity, tournament]);
  const onboarding = useMemo(() => buildHomeOnboarding({
    activity,
    puzzlesSolved: loadPuzzlesSolved(),
    insightsSeen: onboardingInsightsSeen(),
  }), [activity]);

  useEffect(() => {
    const syncDefaultClock = () => setTimeControlId(getDefaultTimeControlId());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, syncDefaultClock);
    return () => window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, syncDefaultClock);
  }, []);

  useEffect(() => {
    const reopenGuide = () => setShowHomeGuide(true);
    window.addEventListener(HOME_GUIDE_OPEN_EVENT, reopenGuide);
    return () => window.removeEventListener(HOME_GUIDE_OPEN_EVENT, reopenGuide);
  }, []);

  function closeHomeGuide() {
    setProfileStorageItem(HOME_GUIDE_KEY, '1');
    setShowHomeGuide(false);
  }

  function openReleaseNotes() {
    setProfileStorageItem(USER_RELEASE_NOTES_KEY, APP_RELEASE);
    setSeenReleaseNotes(true);
    setShowReleaseNotes(true);
  }

  function openOnboardingInsights() {
    markOnboardingInsightsSeen();
    closeHomeGuide();
    onInsights();
  }

  function runOnboardingNext() {
    if (onboarding.next === 'game') { closeHomeGuide(); onTournament(); return; }
    if (onboarding.next === 'puzzle') { closeHomeGuide(); onPuzzle(); return; }
    if (onboarding.next === 'insights') { openOnboardingInsights(); return; }
    closeHomeGuide();
  }

  return (
    <div className="menu home-friendly">
      <button type="button" className={`home-release-notes-link ${seenReleaseNotes ? '' : 'has-new'}`} onClick={openReleaseNotes}>
        <span>{seenReleaseNotes ? 'Novedades' : 'Nuevo'}</span>
        <b>{APP_RELEASE}</b>
        <i aria-hidden="true">→</i>
      </button>
      {hasSavedGame && (
        <div className="menu-group home-continue-group">
          <button type="button" className="home-continue-card" disabled={loading} onClick={onContinue}>
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
          <button type="button" className="home-start-guide-close" onClick={closeHomeGuide} aria-label="Cerrar guía rápida">×</button>
          <div className="home-start-guide-copy">
            <span className="section-label">PRIMEROS 60 SEGUNDOS · {onboarding.completed}/3</span>
            <h2>{onboarding.complete ? 'Ya conoces el circuito básico.' : freshAccount ? 'Tres pasos y ya sabes dónde está todo.' : 'Sigue desde el siguiente paso útil.'}</h2>
            <p>{onboarding.complete ? 'Juega, entrena y revisa tu diagnóstico cuando te apetezca. El resto de modos queda detrás de un clic.' : 'No necesitas aprender todos los modos ahora. Completa este recorrido corto y luego explora a tu ritmo.'}</p>
          </div>
          <div className="home-start-guide-path" aria-label="Primeros pasos de Chess Studio">
            {onboarding.steps.map((step, index) => (
              <span key={step.id} className={`${step.done ? 'is-done' : ''} ${onboarding.next === step.id ? 'is-next' : ''}`}>
                <i aria-hidden="true">{step.done ? '✓' : index + 1}</i><b>{step.label}</b><small>{step.detail}</small>
              </span>
            ))}
          </div>
          <div className="home-start-guide-actions">
            <button type="button" className="primary-btn" onClick={runOnboardingNext}>
              {onboarding.next === 'game' ? 'Jugar primer rival' : onboarding.next === 'puzzle' ? 'Resolver un puzzle' : onboarding.next === 'insights' ? 'Abrir Así juegas' : 'Listo'}
            </button>
            {!onboarding.complete && <button type="button" className="secondary-btn" onClick={closeHomeGuide}>Ahora no</button>}
          </div>
        </section>
      )}

      <section className="home-today-card" aria-label="Hoy en Chess Studio">
        <div className="home-today-main">
          <div>
            <span className="section-label">HOY</span>
            <strong>{today.dailyHeadline}</strong>
            <small>{today.dailyDetail}</small>
          </div>
          <button type="button" className={today.dailySolved ? 'secondary-btn' : 'primary-btn'} onClick={onDailyChallenge}>
            {today.dailySolved ? 'Ver desafíos' : 'Abrir desafíos →'}
          </button>
        </div>
        <details className="home-today-details">
          <summary>Ver más</summary>
          <div>
            <span>Mejor racha <b>{today.bestStreak}</b></span>
            <span>Última partida <b>{today.lastResult ? `${today.lastResult.label} · ${today.lastResult.modeLabel}` : 'Sin partidas terminadas'}</b></span>
          </div>
        </details>
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

      <section className="menu-group home-primary-group home-modes-section" aria-label="Modos principales">
        <div className="home-group-heading">
          <div><span className="section-label">Jugar</span><h2>Elige tu próxima partida</h2></div>
          <div className="home-heading-actions"><p>Compite, continúa tu campaña o juega a tu ritmo.</p>{features.homeGuide !== false && <button type="button" className="home-context-guide" onClick={() => setShowHomeGuide(true)}><span>?</span> Juega primero</button>}</div>
        </div>
        <div className="menu-grid menu-grid-3 home-primary-grid">
          <TutorialModeCard tutorialId="tournament" className="menu-card accent-brass home-primary-card home-mode-card home-mode-featured" onClick={onTournament}>
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
              <IconPuzzle className="menu-card-icon" /><h3>Laboratorio</h3><p>Construye o pega una posición y juégala.</p><span className="menu-card-cta">Abrir →</span>
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
          <TutorialModeCard tutorialId="insights" className="menu-card accent-hint home-primary-card home-mode-card home-learning-card" onClick={() => { markOnboardingInsightsSeen(); onInsights(); }}>
            <span className="home-mode-icon" aria-hidden="true"><IconEye className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Diagnóstico</b><i>Tu juego real</i></span><h3>Así juegas</h3><span className="home-mode-description">Tu prioridad actual y una acción concreta para mejorar.</span></span><span className="menu-card-cta">Ver diagnóstico <b aria-hidden="true">→</b></span>
          </TutorialModeCard>

          <TutorialModeCard tutorialId="puzzles" className="menu-card accent-danger home-primary-card home-mode-card home-learning-card" onClick={onTrainPersonal}>
            <span className="home-mode-icon" aria-hidden="true"><IconPuzzle className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Puzzles personales</b><i>Desde tus partidas</i></span><h3>Entrena tus grandes cagadas</h3><span className="home-mode-description">Tus errores reales se convierten en posiciones para que no vuelvas a pisar el mismo rastrillo.</span></span><span className="menu-card-cta">Entrenar pendientes <b aria-hidden="true">→</b></span>
          </TutorialModeCard>

          <TutorialModeCard tutorialId="practice" className="menu-card accent-success home-primary-card home-mode-card home-learning-card" disabled={loading} onClick={() => onNewGame(difficulty, color, { learning: true, timeControlId })}>
            <span className="home-mode-icon" aria-hidden="true"><IconBulb className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Sin presión</b><i>No afecta al rating</i></span><h3>Partida de práctica</h3><span className="home-mode-description">Juega con pistas gratuitas y aplica lo aprendido.</span></span><span className="menu-card-cta">Empezar práctica <b aria-hidden="true">→</b></span>
          </TutorialModeCard>
        </div>

        <details className="friendly-disclosure home-learning-more">
          <summary>Más aprendizaje y herramientas</summary>
          <div className="friendly-disclosure-body menu-grid compact-mode-grid home-tools-grid">
            <TutorialModeCard tutorialId="puzzles" className="menu-card accent-hint home-mode-card home-tool-card" onClick={onPuzzle}>
              <span className="home-mode-icon" aria-hidden="true"><IconPuzzle className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Táctica</b><i>Diario</i></span><h3>Puzzles</h3><span className="home-mode-description">Casos clásicos y un reto nuevo cada día.</span></span><span className="menu-card-cta">Resolver <b aria-hidden="true">→</b></span>
            </TutorialModeCard>
            <button type="button" className="menu-card accent-success home-mode-card home-tool-card" onClick={onTutorial}>
              <span className="home-mode-icon" aria-hidden="true"><IconBook className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Fundamentos</b><i>Guía</i></span><h3>Aprendizaje</h3><span className="home-mode-description">Lecciones breves, glosario y reglas esenciales.</span></span><span className="menu-card-cta">Abrir <b aria-hidden="true">→</b></span>
            </button>
            <TutorialModeCard tutorialId="openings" className="menu-card accent-success home-mode-card home-tool-card" onClick={onOpenings}>
              <span className="home-mode-icon" aria-hidden="true"><IconBookmark className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Repertorio</b><i>Paso a paso</i></span><h3>Aperturas</h3><span className="home-mode-description">Ensaya líneas útiles con contexto y repetición.</span></span><span className="menu-card-cta">Practicar <b aria-hidden="true">→</b></span>
            </TutorialModeCard>
            <button type="button" className="menu-card accent-brass home-mode-card home-tool-card" onClick={onHistory}>
              <span className="home-mode-icon" aria-hidden="true"><IconBookmark className="menu-card-icon" /></span><span className="home-mode-copy"><span className="home-mode-kicker"><b>Archivo</b><i>Replays</i></span><h3>Historial</h3><span className="home-mode-description">Resultados, partidas guardadas y revisiones.</span></span><span className="menu-card-cta">Abrir <b aria-hidden="true">→</b></span>
            </button>
          </div>
        </details>
      </div>

      {error && <p className="error-text">{error}</p>}

      <HomePlayNudge
        enabled={homePlayNudgeEnabled}
        hasSavedGame={hasSavedGame}
        onContinue={onContinue}
        onPlay={() => setShowQuickMatch(true)}
      />

      {showReleaseNotes && <UserReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />}
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
          rating={rating}
          onStart={() => { onNewGame(autoDifficulty ? difficultyForRating(rating?.rating ?? 400) : difficulty, color, { timeControlId, seriesBestOf, suddenDeath, threatCheck, adaptiveDifficulty: autoDifficulty }); setShowQuickMatch(false); }}
          onClose={() => setShowQuickMatch(false)}
        />
      )}
      {showMirrorMode && (
        <MirrorModeModal
          onStart={(profile) => {
            onNewGame(profile.difficulty, 'random', { ghost: true, ghostStyle: profile.style });
            setShowMirrorMode(false);
          }}
          onClose={() => setShowMirrorMode(false)}
        />
      )}
    </div>
  );
}
