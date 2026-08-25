import { useEffect, useMemo, useState } from 'react';
import { difficultyLabel } from '../difficulty.js';
import { levelForPoints, pointsIntoLevel, POINTS_PER_LEVEL } from '../tournament.js';
import { IconBookmark, IconTrophy, IconBulb, IconBook, IconPuzzle, IconSword, IconEye, IconPawn } from './Icons.jsx';
import QuickMatchModal from './QuickMatchModal.jsx';
import MirrorModeModal from './MirrorModeModal.jsx';
import ModeTutorialTip from './ModeTutorialTip.jsx';
import FeedbackModal from './FeedbackModal.jsx';
import FeedbackAssistant from './FeedbackAssistant.jsx';
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
  onLab,
  hasSavedGame,
  loading,
  error,
  tournament,
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
  const [showMirrorMode, setShowMirrorMode] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showHomeGuide, setShowHomeGuide] = useState(() => getStorageItem(STORAGE_LOCAL, HOME_GUIDE_KEY) !== '1');
  const tournamentLevel = levelForPoints(tournament.progressPoints || 0);
  const tournamentProgress = pointsIntoLevel(tournament.progressPoints || 0);
  const tournamentProgressPct = Math.round((tournamentProgress / POINTS_PER_LEVEL) * 100);
  const hasOpenOverlay = showQuickMatch || showMirrorMode || showFeedback;
  const homePlayNudgeEnabled = shouldEnableHomePlayNudge({ suppressHomeNudge, hasOpenOverlay, loggingOut: false, hasSavedGame });
  const today = useMemo(() => buildHomeToday({
    daily: currentDailyStreak(),
    todayKey: dailyChallengeDayKey(),
    activity: loadGameActivity(),
  }), []);
  const nextAction = useMemo(() => homeNextBestAction(loadGameActivity()), []);

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

  return (
    <div className="menu home-friendly">
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

      {showHomeGuide && (
        <section className="home-start-guide" aria-label="Guía rápida de Chess Studio">
          <button type="button" className="home-start-guide-close" onClick={closeHomeGuide} aria-label="Cerrar guía rápida">×</button>
          <div className="home-start-guide-copy">
            <span className="section-label">EMPIEZA AQUÍ</span>
            <h2>Juega primero. Descubre el resto a tu ritmo.</h2>
            <p>Una partida rápida usa buenos valores iniciales. Entrenamiento, desafíos y Combat quedan disponibles cuando quieras profundizar.</p>
          </div>
          <div className="home-start-guide-path" aria-label="Opciones principales">
            <span><b>Jugar</b><small>Partida contra la CPU</small></span>
            <span><b>Mejorar</b><small>Análisis y práctica</small></span>
            <span><b>Desafíos</b><small>Tres objetivos diarios</small></span>
          </div>
          <div className="home-start-guide-actions">
            <button type="button" className="primary-btn" onClick={() => { closeHomeGuide(); setShowQuickMatch(true); }}>Jugar ahora</button>
            <button type="button" className="secondary-btn" onClick={closeHomeGuide}>Explorar Home</button>
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
          <p>Compite, continúa tu campaña o juega a tu ritmo.</p>
        </div>
        <div className="menu-grid menu-grid-3 home-primary-grid">
          <TutorialModeCard tutorialId="tournament" className="menu-card accent-brass home-primary-card home-mode-card home-mode-featured" onClick={onTournament}>
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
            <span className="home-mode-icon" aria-hidden="true"><IconSword className="menu-card-icon" /></span>
            <span className="home-mode-copy">
              <span className="home-mode-kicker"><b>Campaña</b><i>Ejército persistente</i></span>
              <h3>{COMBAT_CHESS_CAMPAIGN_LABEL}</h3>
              <span className="home-mode-description">Tus unidades ganan experiencia y continúan entre batallas.</span>
            </span>
            <span className="menu-card-cta">Continuar campaña <b aria-hidden="true">→</b></span>
          </TutorialModeCard>

          <TutorialModeCard tutorialId="quick-match-rules" className="menu-card accent-hint home-primary-card home-mode-card home-mode-quick" onClick={() => setShowQuickMatch(true)}>
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
            <TutorialModeCard tutorialId="rival-ghost" className="menu-card accent-hint" onClick={() => setShowMirrorMode(true)}>
              <IconEye className="menu-card-icon" /><h3>Rival Fantasma</h3><p>CPU basada en tendencias reales de tu juego.</p><span className="menu-card-cta">Jugar →</span>
            </TutorialModeCard>
            <TutorialModeCard tutorialId="spectator" className="menu-card accent-hint" onClick={onSpectator}>
              <IconEye className="menu-card-icon" /><h3>Espectador</h3><p>CPU contra CPU. Tú miras el incendio.</p><span className="menu-card-cta">Mirar →</span>
            </TutorialModeCard>
            <TutorialModeCard tutorialId="lab" className="menu-card accent-success" onClick={onLab}>
              <IconPuzzle className="menu-card-icon" /><h3>Laboratorio</h3><p>Construye o pega una posición y juégala.</p><span className="menu-card-cta">Abrir →</span>
            </TutorialModeCard>
          </div>
        </details>
      </section>

      <div className="menu-group home-primary-group">
        <div className="home-group-heading">
          <div><span className="section-label">Mejorar</span><h2>Aprender y practicar</h2></div>
          <p>Tres accesos principales. El resto queda a un toque.</p>
        </div>
        <div className="menu-grid menu-grid-3 home-primary-grid">
          <div className="insights-feature-shell home-insights-shell">
            <button type="button" className="insights-feature-card home-primary-insights" onClick={onInsights}>
              <span className="insights-feature-icon" aria-hidden="true"><IconEye /></span>
              <span className="insights-feature-copy"><span className="insights-feature-kicker">TU JUEGO</span><strong>Así juegas</strong><span>Qué haces bien, qué falla y qué practicar ahora.</span></span>
              <span className="insights-feature-cta">Analizar →</span>
            </button>
            <ModeTutorialTip tutorialId="insights" />
          </div>

          <TutorialModeCard tutorialId="puzzles" className="menu-card accent-danger home-primary-card" onClick={onTrainPersonal}>
            <IconPuzzle className="menu-card-icon" /><h3>Practicar tus errores</h3><p>Puzzles creados a partir de tus propias partidas.</p><span className="menu-card-cta">Entrenar →</span>
          </TutorialModeCard>

          <TutorialModeCard tutorialId="practice" className="menu-card accent-success home-primary-card" disabled={loading} onClick={() => onNewGame(difficulty, color, { learning: true, timeControlId })}>
            <IconBulb className="menu-card-icon" /><h3>Partida de práctica</h3><p>Juega con pistas gratis y sin afectar al rating.</p><span className="menu-card-cta">Jugar →</span>
          </TutorialModeCard>
        </div>

        <details className="friendly-disclosure home-learning-more">
          <summary>Más aprendizaje y herramientas</summary>
          <div className="friendly-disclosure-body menu-grid menu-grid-3 compact-mode-grid">
            <TutorialModeCard tutorialId="puzzles" className="menu-card accent-hint" onClick={onPuzzle}>
              <IconPuzzle className="menu-card-icon" /><h3>Puzzles</h3><p>Clásicos y reto diario.</p><span className="menu-card-cta">Resolver →</span>
            </TutorialModeCard>
            <button type="button" className="menu-card accent-success" onClick={onTutorial}>
              <IconBook className="menu-card-icon" /><h3>Aprendizaje</h3><p>Lecciones, glosario y tutoriales.</p><span className="menu-card-cta">Abrir →</span>
            </button>
            <TutorialModeCard tutorialId="openings" className="menu-card accent-success" onClick={onOpenings}>
              <IconBookmark className="menu-card-icon" /><h3>Aperturas</h3><p>Practica líneas clásicas paso a paso.</p><span className="menu-card-cta">Practicar →</span>
            </TutorialModeCard>
            <button type="button" className="menu-card accent-brass" onClick={onHistory}>
              <IconBookmark className="menu-card-icon" /><h3>Historial</h3><p>Tus partidas, resultados y replays.</p><span className="menu-card-cta">Abrir →</span>
            </button>
          </div>
        </details>
      </div>

      {error && <p className="error-text">{error}</p>}

      <FeedbackAssistant blocked={hasOpenOverlay || showHomeGuide} autoOpen={false} onFeedback={() => setShowFeedback(true)} />

      <HomePlayNudge
        enabled={homePlayNudgeEnabled}
        hasSavedGame={hasSavedGame}
        onContinue={onContinue}
        onPlay={() => setShowQuickMatch(true)}
      />

      {showFeedback && <FeedbackModal context="Home" onClose={() => setShowFeedback(false)} />}
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
