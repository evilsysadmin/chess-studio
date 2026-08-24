import { useEffect, useMemo, useState } from 'react';
import { difficultyLabel } from '../difficulty.js';
import { levelForPoints } from '../tournament.js';
import { logout, getUsername } from '../auth.js';
import { pushProfileToServer } from '../profileBackup.js';
import { IconBookmark, IconTrophy, IconBulb, IconBook, IconPuzzle, IconSword, IconEye, IconPawn } from './Icons.jsx';
import ProfileBackupModal from './ProfileBackupModal.jsx';
import AchievementsModal from './AchievementsModal.jsx';
import QuickMatchModal from './QuickMatchModal.jsx';
import MirrorModeModal from './MirrorModeModal.jsx';
import AccountModal from './AccountModal.jsx';
import ModeTutorialTip from './ModeTutorialTip.jsx';
import FeedbackModal from './FeedbackModal.jsx';
import HomePlayNudge from './HomePlayNudge.jsx';
import { COMBAT_CHESS_FREE_LABEL, COMBAT_CHESS_CAMPAIGN_LABEL } from '../combatChessBrand.js';
import { currentDailyStreak, dailyChallengeDayKey } from '../dailyChallenge.js';
import { loadGameActivity } from '../gameActivity.js';
import { buildHomeToday } from '../homeToday.js';
import { getDefaultTimeControlId, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import { shouldEnableHomePlayNudge } from '../homePlayNudgePolicy.js';

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
  isAdminUser,
  onAdmin,
  onSpectator,
  onHistory,
  onInsights,
  onLab,
  onBoard3D,
  hasSavedGame,
  loading,
  error,
  tournament,
  rating,
  suppressHomeNudge = false,
}) {
  const [difficulty, setDifficulty] = useState(50);
  const [color, setColor] = useState('random');
  const [timeControlId, setTimeControlId] = useState(() => getDefaultTimeControlId());
  const [seriesBestOf, setSeriesBestOf] = useState(1);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [threatCheck, setThreatCheck] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [showMirrorMode, setShowMirrorMode] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const tournamentLevel = levelForPoints(tournament.progressPoints || 0);
  const username = getUsername();
  const hasOpenOverlay = showBackup || showQuickMatch || showMirrorMode || showAchievements || showAccount || showFeedback;
  const homePlayNudgeEnabled = shouldEnableHomePlayNudge({ suppressHomeNudge, hasOpenOverlay, loggingOut, hasSavedGame });
  const today = useMemo(() => buildHomeToday({
    daily: currentDailyStreak(),
    todayKey: dailyChallengeDayKey(),
    activity: loadGameActivity(),
  }), []);

  useEffect(() => {
    const syncDefaultClock = () => setTimeControlId(getDefaultTimeControlId());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, syncDefaultClock);
    return () => window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, syncDefaultClock);
  }, []);

  async function handleLogout() {
    setLogoutError(null);
    setLoggingOut(true);
    try {
      await pushProfileToServer({ throwOnError: true });
      logout();
      window.location.reload();
    } catch (error) {
      if (error?.status === 401) {
        logout();
        window.location.reload();
        return;
      }
      setLogoutError('No se pudo guardar tu progreso antes de cerrar sesión. Reintenta cuando vuelva la conexión.');
      setLoggingOut(false);
    }
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

      <section className="home-today-card" aria-label="Hoy en Chess Studio">
        <div className="home-today-main">
          <div>
            <span className="section-label">HOY</span>
            <strong>{today.dailySolved ? 'Desafío diario resuelto' : 'Desafío diario pendiente'}</strong>
            <small>Racha actual: {today.streak} día{today.streak === 1 ? '' : 's'}</small>
          </div>
          <button type="button" className={today.dailySolved ? 'secondary-btn' : 'primary-btn'} onClick={onDailyChallenge}>
            {today.dailySolved ? 'Ver desafío' : 'Jugar desafío →'}
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

      <div className="menu-group home-primary-group">
        <div className="home-group-heading">
          <div><span className="section-label">Jugar</span><h2>¿Qué te apetece?</h2></div>
          <p>Elige una. Las variantes raras están guardadas en “Más modos”.</p>
        </div>
        <div className="menu-grid menu-grid-3 home-primary-grid">
          <TutorialModeCard tutorialId="quick-match-rules" className="menu-card accent-hint home-primary-card" onClick={() => setShowQuickMatch(true)}>
            <IconPawn className="menu-card-icon" />
            <h3>Partida rápida</h3>
            <p>CPU, nivel configurable y a jugar.</p>
            <span className="menu-card-cta">Nivel {difficulty} · {difficultyLabel(difficulty)} →</span>
          </TutorialModeCard>

          <TutorialModeCard tutorialId="combat-campaign" className="menu-card accent-danger home-primary-card" onClick={onCombatRoguelike}>
            <IconSword className="menu-card-icon" />
            <h3>{COMBAT_CHESS_CAMPAIGN_LABEL}</h3>
            <p>Campaña, ejército persistente y batallas progresivas.</p>
            <span className="menu-card-cta">Abrir campaña →</span>
          </TutorialModeCard>

          <TutorialModeCard tutorialId="tournament" className="menu-card accent-brass home-primary-card" onClick={onTournament}>
            <IconTrophy className="menu-card-icon" />
            <h3>Torneo</h3>
            <p>Rivales cada vez más duros y progreso por resultados.</p>
            <span className="menu-card-cta">Nivel {tournamentLevel} →</span>
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
      </div>

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
            <IconPuzzle className="menu-card-icon" /><h3>Practicar tus errores</h3><p>Puzzles nacidos de tus propias cagadas.</p><span className="menu-card-cta">Entrenar →</span>
          </TutorialModeCard>

          <TutorialModeCard tutorialId="practice" className="menu-card accent-success home-primary-card" disabled={loading} onClick={() => onNewGame(difficulty, color, { learning: true, timeControlId })}>
            <IconBulb className="menu-card-icon" /><h3>Práctica</h3><p>Partida normal con pistas gratis.</p><span className="menu-card-cta">Jugar práctica →</span>
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

      {isAdminUser && (
        <div className="menu-group home-admin-group">
          <button type="button" className="menu-card accent-danger home-admin-card" onClick={onAdmin}>
            <IconEye className="menu-card-icon" /><h3>Admin Panel</h3><p>Usuarios, feedback y operación.</p><span className="menu-card-cta">Abrir →</span>
          </button>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <button type="button" className="home-feedback-button" onClick={() => setShowFeedback(true)} aria-label="Dar feedback del juego">
        <span aria-hidden="true">💬</span> Dar feedback
      </button>

      <HomePlayNudge
        enabled={homePlayNudgeEnabled}
        hasSavedGame={hasSavedGame}
        onContinue={onContinue}
        onPlay={() => setShowQuickMatch(true)}
      />

      <div className="footer-links-row">
        <button type="button" className="backup-link" onClick={() => setShowAchievements(true)}>Ver logros</button>
        <button type="button" className="backup-link" onClick={() => setShowAccount(true)}>Mi cuenta</button>
        <button type="button" className="backup-link" onClick={() => setShowBackup(true)}>Exportar / importar mi progreso</button>
        <button type="button" className="backup-link" onClick={onBoard3D}>Experimento 3D</button>
        <button type="button" className="backup-link" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Guardando…' : `Cerrar sesión${username ? ` (${username})` : ''}`}</button>
        {logoutError && <p className="error-text" style={{ marginTop: '0.5rem' }}>{logoutError}</p>}
      </div>

      {showAccount && <AccountModal onClose={() => setShowAccount(false)} />}
      {showFeedback && <FeedbackModal context="Home" onClose={() => setShowFeedback(false)} />}
      {showBackup && <ProfileBackupModal onClose={() => setShowBackup(false)} />}
      {showAchievements && <AchievementsModal onClose={() => setShowAchievements(false)} />}
      {showQuickMatch && (
        <QuickMatchModal
          difficulty={difficulty}
          setDifficulty={setDifficulty}
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
          onStart={() => { onNewGame(difficulty, color, { timeControlId, seriesBestOf, suddenDeath, threatCheck }); setShowQuickMatch(false); }}
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
