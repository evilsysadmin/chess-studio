import React, { useEffect, useState } from 'react';
import Menu from './components/Menu.jsx';
import { GameScreenRoute as GameScreen, TrainingRoomRoute as PuzzleScreen } from './goldenPathScreens.js';
import { TutorialRoute as Tutorial } from './tutorialRoute.js';
const OpeningsScreen = React.lazy(() => import('./components/OpeningsScreen.jsx'));
const TournamentScreen = React.lazy(() => import('./components/TournamentScreen.jsx'));
const HistoryScreen = React.lazy(() => import('./components/HistoryScreen.jsx'));
const ReplayScreen = React.lazy(() => import('./components/ReplayScreen.jsx'));
const CombatReplayScreen = React.lazy(() => import('./components/CombatReplayScreen.jsx'));
const SpectatorScreen = React.lazy(() => import('./components/SpectatorScreen.jsx'));
const Board3DExperiment = React.lazy(() => import('./components/Board3DExperiment.jsx'));
const PvpAppSurface = React.lazy(() => import('./components/PvpAppSurface.jsx'));
const DailyChallengesScreen = React.lazy(() => import('./components/DailyChallengesScreen.jsx'));
const CombatScreen = React.lazy(() => import('./components/CombatScreen.jsx'));
const RoguelikeScreen = React.lazy(() => import('./components/RoguelikeScreen.jsx'));
import PlayerStatusBar from './components/PlayerStatusBar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { api, STORAGE_KEY } from './api.js';
import { updateGameRecordChat, statisticalHistoryRecords } from './gameHistory.js';
import { recordGameActivity } from './gameActivity.js';
import { ratingChangeDetails, loadRatingHistory } from './playerRating.js';
const InsightsScreen = React.lazy(() => import('./components/InsightsScreen.jsx'));
const AdminScreen = React.lazy(() => import('./components/AdminScreen.jsx'));
const GlobalMusicDock = React.lazy(() => import('./components/GlobalMusicDock.jsx'));
const GlobalOverlayLayer = React.lazy(() => import('./components/GlobalOverlayLayer.jsx'));
import SaveStatusBadge from './components/SaveStatusBadge.jsx';
import ReleaseUpdateNotice from './components/ReleaseUpdateNotice.jsx';
import AdminFeedbackInboxButton from './components/AdminFeedbackInboxButton.jsx';
import { useAdminFeedbackInbox } from './useAdminFeedbackInbox.js';
import { SAVE_STATUS } from './saveStatus.js';
import LoginScreen from './components/LoginScreen.jsx';
import { reconcileRivalryHistory } from './rivalry.js';
import { loadActiveSeries } from './series.js';
const ShareResultModal = React.lazy(() => import('./components/ShareResultModal.jsx'));
const SharedResultScreen = React.lazy(() => import('./components/SharedResultScreen.jsx'));
import { buildLiveShareRecord, shareRecordFromHash } from './shareResult.js';
const LabScreen = React.lazy(() => import('./components/LabScreen.jsx'));
import { loadActiveContract, loadSpecialRun, reconcileCareerHistory } from './career.js';
import { loadActiveGameChat } from './gameChat.js';
import { loadActiveGameSession, loadVisibleActiveGameSession } from './activeGameSession.js';
import { usePresenceHeartbeat } from './usePresenceHeartbeat.js';
import { useActiveGameSessionPersistence } from './useActiveGameSessionPersistence.js';
import { useGameReconnect } from './useGameReconnect.js';
import { useViewNavigation } from './useViewNavigation.js';
import { LEARNING_STORAGE_KEY, hasRecoverableCombatState, useActiveSessionRestore } from './useActiveSessionRestore.js';
import { STORAGE_LOCAL, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';
import { useAuthenticatedApp } from './useAuthenticatedApp.js';
import { useAuthenticatedAudio } from './useAuthenticatedAudio.js';
import { usePlayerPortraitRefresh } from './usePlayerPortraitRefresh.js';
import { buildGameCrimeReplayRecord } from './crimeReplay.js';
import { useProfileSyncLifecycle } from './useProfileSyncLifecycle.js';
import { useReplayLibrary } from './useReplayLibrary.js';
import { setAdminPreviewAccess } from './adminPreview.js';
import { setFrontendTelemetryContext, startFrontendTelemetry } from './frontendTelemetry.js';
import { APP_RELEASE } from './release.js';
import { clearRememberedLabMode } from './labLaunchIntent.js';
import { useGameLaunchController } from './useGameLaunchController.js';
import { useLearningJourneyFlow } from './useLearningJourneyFlow.js';
import { useGlobalShellUi } from './useGlobalShellUi.js';
import { useTournamentFlow } from './useTournamentFlow.js';
import { useGameStartFlow } from './useGameStartFlow.js';
import { useCasualResultFlow } from './useCasualResultFlow.js';
import { useLogoutFlow } from './useLogoutFlow.js';
import { usePublicFeatureFlags } from './usePublicFeatureFlags.js';
import { useGameExitFlow } from './useGameExitFlow.js';

// 'menu' | 'game' | 'tutorial' | 'openings' | 'tournament' | 'tournamentGame' | 'puzzle' | 'combat' | 'history' | 'replay'
function AppInner({ isAdminUser }) {
  useEffect(() => {
    setAdminPreviewAccess(isAdminUser);
  }, [isAdminUser]);

  useEffect(() => startFrontendTelemetry(), []);

  const {
    view,
    navigateTo,
    goBack,
    replaceView,
    resetNavigation,
  } = useViewNavigation({
    isAdminUser,
    initialView: () => loadVisibleActiveGameSession()?.route || null,
  });
  const [combatBattleUiActive, setCombatBattleUiActive] = useState(false);
  const { puzzleLaunch, quickMatchLaunchNonce, insightsLandingSection, openPuzzleMode, openPersonalTraining, openDailyChallengeSlot, openInsights, returnToQuickMatchFromPersonalTraining } = useLearningJourneyFlow({ navigateTo, resetNavigation });

  usePresenceHeartbeat(view);

  useEffect(() => {
    if (view !== 'lab') clearRememberedLabMode();
  }, [view]);

  const adminFeedbackNewCount = useAdminFeedbackInbox({ enabled: isAdminUser, view });
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSavedGame, setHasSavedGame] = useState(() => !!getStorageItem(STORAGE_LOCAL, STORAGE_KEY) || !!loadActiveGameSession());
  const [learningMode, setLearningMode] = useState(() => getStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY) === '1');

  const [exitNotice, setExitNotice] = useState(null);
  const {
    historyList, setHistoryList,
    combatHistoryList, setCombatHistoryList,
    replayRecord, setReplayRecord,
    combatReplayRecord,
    replayInitialStep, setReplayInitialStep,
    pinnedReport, setPinnedReport,
    replayCrimeMode, setReplayCrimeMode,
    replayMovieMode,
    allHistory, insights,
    jumpToMove, openHistoryRecord, clearAllHistory, openMovie,
  } = useReplayLibrary({ navigateTo });
  usePlayerPortraitRefresh(insights);

  function openGameCrimeScene(finishedGame, moveReport, mode, outcomeOverride) {
    if (!finishedGame || !moveReport) return;
    const outcome = outcomeOverride || (
      finishedGame.status === 'checkmate'
        ? (finishedGame.turn === finishedGame.humanColor ? 'loss' : 'win')
        : 'draw'
    );
    const record = buildGameCrimeReplayRecord(finishedGame, mode, outcome);
    if (!record) return;
    record.gameChat = loadActiveGameChat(finishedGame.id);
    if (mode === 'casual' || mode === 'practice') {
      removeStorageItem(STORAGE_LOCAL, STORAGE_KEY);
      removeStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY);
      setHasSavedGame(false);
      setGame(null);
      setLearningMode(false);
    } else if (mode === 'tournament') {
      setTournamentGame(null);
    }
    setReplayRecord(record);
    setPinnedReport(moveReport);
    // Antes del impacto: el botón de Cámara del crimen reproduce la jugada.
    setReplayInitialStep(Math.max(0, moveReport.index));
    setReplayCrimeMode(true);
    navigateTo('replay');
  }

  // Estos dos viven en localStorage manejados por otras pantallas (el
  // Modo Combate tiene su propio roster, independiente) — los releemos acá
  // cada vez que cambia la vista, así la cabecera se mantiene al día sin
  // tener que levantar ese estado hasta acá arriba.
  const [activeTimeControl, setActiveTimeControl] = useState(null);
  const [activeSeries, setActiveSeries] = useState(() => loadActiveSeries());
  const [shareRecord, setShareRecord] = useState(null);
  const [activeContract, setActiveContract] = useState(() => loadActiveContract());
  const [specialRun, setSpecialRun] = useState(() => loadSpecialRun());
  const [gameContext, setGameContext] = useState({});
  const shellUi = useGlobalShellUi(view, setCombatHistoryList);
  const {
    rating, setRating, combatOverview,
    showRatingDetail, openRatingDetail, closeRatingDetail, showCombatSummary, openCombatSummary, closeCombatSummary,
    showSettings, openSettings, closeSettings, showGlobalAccount, openGlobalAccount, closeGlobalAccount,
    showGlobalReleaseNotes, releaseNotesSeen, openReleaseNotes, closeReleaseNotes, showGlobalFeedback,
    openGlobalFeedback, closeGlobalFeedback, showAccountMenu, toggleAccountMenu, closeAccountMenu,
    accountMenuRef, accountMenuButtonRef, suppressHomeNudge,
  } = shellUi;
  const [gameSaveState, setGameSaveState] = useState(SAVE_STATUS.SAVED);
  const featureFlags = usePublicFeatureFlags();
  const { loggingOut, logoutError, logout: handleGlobalLogout } = useLogoutFlow(view);
  const gameLaunch = useGameLaunchController(view, { onCancelled: () => setLoading(false) });
  const {
    state: tournament,
    game: tournamentGame,
    setGame: setTournamentGame,
    result: lastResult,
    level: tournamentLevel,
    play: handlePlayTournament,
    finish: handleTournamentGameEnd,
    spend: handleSpendPoints,
    capture: handleCapturePoints,
    exit: handleExitTournamentGame,
    reset: handleResetTournament,
  } = useTournamentFlow({
    launch: gameLaunch,
    navigate: navigateTo,
    back: goBack,
    loading: setLoading,
    error: setError,
    rating: setRating,
    history: setHistoryList,
    saved: setHasSavedGame,
  });
  const {
    result: casualResult,
    clearResult: clearCasualResult,
    finish: handleCasualGameEnd,
  } = useCasualResultFlow({
    activeSeries,
    setActiveSeries,
    gameContext,
    learningMode,
    activeTimeControl,
    rating,
    setRating,
    setHistoryList,
    activeContract,
    setActiveContract,
    specialRun,
    setSpecialRun,
  });
  const {
    startGame: handleNewGame,
    nextSeriesGame: handleNextSeriesGame,
    playFromHere: handlePlayFromHere,
    startRun: handleStartRun,
    continueRun: handleContinueRun,
  } = useGameStartFlow({
    launch: gameLaunch,
    navigate: navigateTo,
    loading: setLoading,
    error: setError,
    rating,
    currentGame: game,
    currentSeries: activeSeries,
    currentRun: specialRun,
    gameCount: statisticalHistoryRecords(historyList).length,
    setGame,
    saved: setHasSavedGame,
    learning: setLearningMode,
    timeControl: setActiveTimeControl,
    context: setGameContext,
    contract: setActiveContract,
    series: setActiveSeries,
    run: setSpecialRun,
    resetResult: () => { setExitNotice(null); clearCasualResult(); },
  });
  const handleExitGame = useGameExitFlow({
    game,
    casualResult,
    gameContext,
    learningMode,
    finish: handleCasualGameEnd,
    notice: setExitNotice,
    saved: setHasSavedGame,
    setGame,
    learning: setLearningMode,
    contract: setActiveContract,
    context: setGameContext,
    series: setActiveSeries,
    back: goBack,
  });
  useProfileSyncLifecycle(view);

  // V15.1: usuarios veteranos pueden tener decenas de partidas anteriores a
  // Centro de Operaciones. Reconciliamos los contadores demostrables desde
  // Historial una sola vez cuando éste cambia; las funciones sólo escriben si
  // detectan que el historial contiene más datos que el expediente nuevo.
  useEffect(() => {
    const statisticalHistory = statisticalHistoryRecords(historyList);
    reconcileCareerHistory(statisticalHistory);
    reconcileRivalryHistory(statisticalHistory);
  }, [historyList]);

  useEffect(() => {
    if (game) setStorageItem(STORAGE_LOCAL, STORAGE_KEY, game.id);
  }, [game]);

  useEffect(() => {
    setStorageItem(STORAGE_LOCAL, LEARNING_STORAGE_KEY, learningMode ? '1' : '0');
  }, [learningMode]);

  // Snapshot local de la sesión activa. Mongo confirma el tablero y el hook
  // conserva el contexto cliente necesario para sobrevivir a F5/deploy.
  useActiveGameSessionPersistence({
    view,
    game,
    tournamentGame,
    learningMode,
    gameContext,
    timeControlId: activeTimeControl?.id || null,
    onPersistenceState: setGameSaveState,
  });

  // Reconciliación conservadora tras offline → online. El hook mantiene Mongo
  // como autoridad y descarta respuestas tardías si el usuario cambia de partida.
  useGameReconnect({
    route: view,
    game,
    tournamentGame,
    saveState: gameSaveState,
    getGame: api.getGame,
    onGame: setGame,
    onTournamentGame: setTournamentGame,
    onPersistenceState: setGameSaveState,
    onError: setError,
  });

  // Restauración de F5/deploy, Continuar partida y recovery del ErrorBoundary.
  // El hook concentra la rehidratación de contrato/run/serie/reloj sin hacer
  // que App conozca otra vez todos los detalles de persistencia.
  const { continueActiveSession, discardActiveSession, recoverSessionFromBoundary } = useActiveSessionRestore({
    currentView: view,
    game,
    tournamentGame,
    learningMode,
    gameContext,
    activeTimeControl,
    replaceView,
    setGame,
    setTournamentGame,
    setLearningMode,
    setActiveContract,
    setSpecialRun,
    setGameContext,
    setActiveSeries,
    setActiveTimeControl,
    setHasSavedGame,
    setGameSaveState,
    setLoading,
    setError,
  });

  function handleGameChatUpdate(gameId, transcript) {
    const updated = updateGameRecordChat(gameId, transcript);
    // Evita renders extra mientras la partida sigue viva: solo hay que
    // refrescar History si ya existe un registro archivado para este gameId.
    if (updated.some((record) => record?.sourceGameId === gameId || record?.id === gameId)) {
      setHistoryList(updated);
    }
  }

  useEffect(() => {
    setFrontendTelemetryContext(view);
  }, [view]);

  const statisticalHistoryList = statisticalHistoryRecords(historyList);

  const isBoardGameView = view === 'game' || view === 'tournamentGame' || view === 'pvpGame' || combatBattleUiActive;

  return (
    <>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      {!isBoardGameView && <React.Suspense fallback={null}><GlobalMusicDock isAdminUser={isAdminUser} onAdmin={() => navigateTo('admin')} /></React.Suspense>}
      <ReleaseUpdateNotice deferReload={isBoardGameView} />
      <ErrorBoundary
        view={view}
        onReset={resetNavigation}
        onRecover={recoverSessionFromBoundary}
        canRecover={Boolean(game?.id || tournamentGame?.id || loadActiveGameSession()?.gameId || hasRecoverableCombatState(view))}
      >
      <div className={`app-shell ${isBoardGameView ? 'app-shell-board-game' : ''} ${view === 'menu' ? 'app-shell-home' : ''}`} id="main-content" tabIndex={-1}>
        <div className={`masthead ${isBoardGameView ? 'masthead-game-compact' : ''}`}>
          <div className="masthead-top-row">
            <div className="masthead-text">
              {!isBoardGameView && <span className="masthead-kicker">JUEGA · APRENDE · COMPITE</span>}
              {isBoardGameView ? <span className="game-wordmark">Chess Studio</span> : <h1>Chess Studio</h1>}
            </div>
            <div className="masthead-actions">
              {((view === 'game' || view === 'tournamentGame') && (game?.id || tournamentGame?.id) || combatBattleUiActive) && (
                <SaveStatusBadge state={gameSaveState} />
              )}
              <button
                type="button"
                className="masthead-feedback-trigger"
                onClick={openGlobalFeedback}
                aria-label="Enviar feedback"
                title="Enviar feedback"
              >
                <span aria-hidden="true">✦</span>
                <span>Feedback</span>
              </button>
              {isAdminUser && view === 'menu' && <AdminFeedbackInboxButton count={adminFeedbackNewCount} onOpen={() => navigateTo('admin')} />}
              <div className="masthead-account-stack">
                <div className="masthead-account-menu" ref={accountMenuRef}>
                  <button
                    ref={accountMenuButtonRef}
                    type="button"
                    className="masthead-account-trigger"
                    onClick={toggleAccountMenu}
                    aria-label="Abrir menú de cuenta"
                    aria-haspopup="menu"
                    aria-expanded={showAccountMenu}
                  >
                    <span className="masthead-account-avatar" aria-hidden="true">♙</span>
                    <span>Mi cuenta</span>
                    <span className="masthead-account-chevron" aria-hidden="true">⌄</span>
                  </button>
                  {showAccountMenu && (
                    <div className="masthead-account-popover" role="menu" aria-label="Cuenta">
                      <button type="button" role="menuitem" onClick={openGlobalAccount}>
                        <span aria-hidden="true">♙</span><span><b>Mi cuenta</b><small>Perfil y preferencias</small></span>
                      </button>
                    {isAdminUser && (
                      <button type="button" role="menuitem" className="masthead-account-menu-admin" onClick={() => { closeAccountMenu(); navigateTo('admin'); }}>
                        <span aria-hidden="true">◉</span><span><b>Administración</b><small>Usuarios y operación</small></span>
                      </button>
                    )}
                    <button type="button" role="menuitem" onClick={() => { closeAccountMenu(); openInsights('diagnosis'); }}>
                      <span aria-hidden="true">◫</span><span><b>Mi progreso</b><small>Diagnóstico y siguiente mejora</small></span>
                    </button>
                    <button type="button" role="menuitem" onClick={openSettings}>
                      <span aria-hidden="true">⚙</span><span><b>Personalizar</b><small>Tablero, piezas y sonido</small></span>
                    </button>
                    <div className="masthead-account-menu-separator" role="separator" />
                    <button type="button" role="menuitem" className="masthead-account-menu-logout" onClick={() => { closeAccountMenu(); void handleGlobalLogout(); }} disabled={loggingOut}>
                      <span aria-hidden="true">↪</span><span><b>{loggingOut ? 'Guardando…' : 'Cerrar sesión'}</b><small>Guarda antes de salir</small></span>
                    </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`masthead-release-trigger ${releaseNotesSeen ? '' : 'is-new'}`}
                  onClick={openReleaseNotes}
                  aria-label={releaseNotesSeen ? 'Abrir novedades' : 'Abrir novedades nuevas'}
                >
                  <span aria-hidden="true">✦</span>
                  <span>Novedades{releaseNotesSeen ? '' : ' · Nuevo'}</span>
                </button>
              </div>
            </div>
          </div>
          {logoutError && <p className="error-text masthead-session-error" role="alert">{logoutError}</p>}
          {!isBoardGameView && (
            <PlayerStatusBar
              tournament={tournament}
              combatOverview={combatOverview}
              rating={rating}
              onTournamentClick={() => navigateTo('tournament')}
              onCombatClick={openCombatSummary}
              onRatingClick={openRatingDetail}
            />
          )}
          {!isBoardGameView && view !== 'menu' && view !== 'insights' && (
            <div className="navigation-back-hint">ESC o clic derecho · volver / cerrar</div>
          )}
        </div>

        {!isBoardGameView && exitNotice && (
          <div className={`session-result-notice outcome-${exitNotice.outcome}`} role="status" aria-live="polite">
            <div><strong>{exitNotice.title}</strong><span>{exitNotice.detail}</span></div>
            <button type="button" aria-label="Cerrar resumen de la partida" onClick={() => setExitNotice(null)}>×</button>
          </div>
        )}

        {(showRatingDetail || showCombatSummary || showSettings || showGlobalAccount || showGlobalReleaseNotes || showGlobalFeedback) && (
          <React.Suspense fallback={<div className="modal-backdrop" />}>
            <GlobalOverlayLayer
              shellUi={shellUi}
              rating={rating} tournament={tournament} combatOverview={combatOverview}
              isAdminUser={isAdminUser} navigateTo={navigateTo} openInsights={openInsights}
              onLogout={handleGlobalLogout} loggingOut={loggingOut} view={view}
            />
          </React.Suspense>
        )}

        <React.Suspense fallback={<div className="route-loading" role="status">Cargando…</div>}>
        <PvpAppSurface view={view} replaceView={replaceView} />
        {((view === 'game' && !game) || (view === 'tournamentGame' && !tournamentGame)) && (
          <div className="route-loading active-session-recovery" role="status">
            {error ? (
              <>
                <strong>La partida sigue guardada.</strong>
                <span>{error}</span>
                <div className="active-session-recovery-actions">
                  <button type="button" className="primary-btn" onClick={continueActiveSession} disabled={loading}>
                    {loading ? 'Reintentando…' : 'Reintentar recuperación'}
                  </button>
                  <button type="button" className="secondary-btn" onClick={resetNavigation}>Volver al menú</button>
                  <button type="button" className="secondary-btn" onClick={discardActiveSession}>Descartar sesión sin derrota</button>
                </div>
              </>
            ) : 'Restaurando partida en curso…'}
          </div>
        )}
        {view === 'menu' && (
          <Menu
            onNewGame={handleNewGame}
            onContinue={continueActiveSession}
            onTournament={() => navigateTo('tournament')}
            onTutorial={() => navigateTo('tutorial')}
            onOpenings={() => navigateTo('openings')}
            onPuzzle={() => openPuzzleMode('curated', false)}
            onDailyChallenge={(slot) => slot ? openDailyChallengeSlot(slot) : navigateTo('dailyChallenges')}
            onTrainPersonal={openPersonalTraining}
            onSpectator={() => navigateTo('spectator')}
            onCombat={() => navigateTo('combat')}
            onCombatRoguelike={() => navigateTo('roguelike')} onContinueRun={() => handleContinueRun()}
            onHistory={() => navigateTo('history')}
            onInsights={() => openInsights('diagnosis')}
            onProgress={() => openInsights('career')}
            onLab={() => navigateTo('lab')}
            hasSavedGame={hasSavedGame}
            loading={loading}
            error={error}
            tournament={tournament}
            rating={rating}
            combatProgress={combatOverview}
            suppressHomeNudge={suppressHomeNudge}
            features={featureFlags}
            quickMatchLaunchNonce={quickMatchLaunchNonce}
          />
        )}

        {view === 'game' && game && (
          <GameScreen
            game={game}
            setGame={setGame}
            onExit={handleExitGame}
            onError={setError}
            onPersistenceState={setGameSaveState}
            onCustomize={openSettings}
            onGameEnd={handleCasualGameEnd}
            resultSummary={casualResult?.gameId === game.id ? casualResult : null}
            abandonRatingPreview={!learningMode && !gameContext.lab && !gameContext.rescue && !gameContext.suddenDeath ? (() => { const preview = ratingChangeDetails(rating, game.difficulty, 0); return { delta: preview.delta, before: rating.rating, after: preview.next.rating }; })() : null}
            onChatUpdate={handleGameChatUpdate}
            hintMode={learningMode ? 'free' : 'off'}
            timeControl={activeTimeControl}
            seriesState={activeSeries}
            onNextSeriesGame={handleNextSeriesGame}
            onShareResult={(outcome) => setShareRecord(buildLiveShareRecord(game, outcome, learningMode ? 'practice' : 'casual', activeSeries, activeTimeControl))}
            onShareIncident={(moveReport, _report, outcome) => setShareRecord({ ...buildLiveShareRecord(game, outcome, learningMode ? 'practice' : 'casual', activeSeries, activeTimeControl), incident: { moveNumber: moveReport.moveNumber, played: moveReport.played, suggested: moveReport.suggested, loss: moveReport.loss } })}
            onOpenCrimeScene={(moveReport, _report, meta) => openGameCrimeScene(game, moveReport, gameContext.rescue ? 'rescue' : gameContext.lab ? 'lab' : learningMode ? 'practice' : 'casual', meta?.outcome)}
            activeContract={activeContract}
            runState={specialRun && gameContext.runMode ? specialRun : null}
            onNextRunGame={() => handleContinueRun(specialRun)}
            memoryContext={gameContext}
            onTrainPersonal={openPersonalTraining}
            onPlayAgain={(!learningMode && !activeSeries && !gameContext.lab && !gameContext.rescue && !gameContext.runMode) ? async () => { const { quickMatchRematchPlan } = await import('./quickMatchRematch.js'); const plan = quickMatchRematchPlan({ game, gameContext, learningMode, activeSeries, rating, timeControlId: activeTimeControl?.id }); if (plan) await handleNewGame(plan.difficulty, plan.color, plan.options); } : null}
            postGameFeedbackEnabled={featureFlags.postGameFeedback}
          />
        )}

        {view === 'tutorial' && <Tutorial onExit={goBack} />}
        {view === 'openings' && <OpeningsScreen onExit={goBack} />}

        {view === 'dailyChallenges' && (
          <DailyChallengesScreen onExit={goBack} onPlay={openDailyChallengeSlot} />
        )}

        {view === 'puzzle' && (
          <PuzzleScreen key={`${puzzleLaunch.source}-${puzzleLaunch.rush}-${puzzleLaunch.filter?.opening || 'all'}-${puzzleLaunch.dailySlot || 'tactic'}-${puzzleLaunch.origin || 'direct'}`} initialSource={puzzleLaunch.source} rushMode={puzzleLaunch.rush} initialFilter={puzzleLaunch.filter} dailySlot={puzzleLaunch.dailySlot} trainingOrigin={puzzleLaunch.origin} onExit={goBack} onPlayAgain={puzzleLaunch.source === 'personal' ? returnToQuickMatchFromPersonalTraining : null} points={tournament.points} onSpendPoints={handleSpendPoints} />
        )}

        {view === 'spectator' && <SpectatorScreen onExit={goBack} />}

        {view === 'lab' && (
          <LabScreen onExit={goBack} onStart={(fen, color, difficulty, meta) => handlePlayFromHere(fen, color, difficulty, meta)} />
        )}

        {view === 'board3d' && <Board3DExperiment onExit={goBack} />}

        {view === 'combat' && (
          <CombatScreen
            onExit={goBack}
            onError={setError}
            onHistory={() => navigateTo('history')}
            onViewBattle={openHistoryRecord}
            combatSessionId="free"
            onBattleUiActive={setCombatBattleUiActive}
            onPersistenceState={setGameSaveState}
            onCustomize={openSettings}
            onBattleStart={(meta = {}) => {
              if (meta.gameId) recordGameActivity({ gameId: meta.gameId, state: 'started', mode: 'combat', modeRecord: meta.modeRecord, difficulty: meta.difficulty });
            }}
            onBattleResult={(outcome, _debrief, meta = {}) => {
              if (meta.gameId) recordGameActivity({
                gameId: meta.gameId,
                state: outcome === 'retired' ? 'cancelled' : 'finished',
                mode: 'combat',
                modeRecord: meta.battleRecord || { variant: 'combat' },
                outcome: outcome === 'retired' ? null : outcome, difficulty: meta.difficulty ?? meta.battleRecord?.difficulty,
              });
            }}
          />
        )}

        {view === 'roguelike' && (
          <RoguelikeScreen
            onExit={goBack}
            onError={setError}
            onHistory={() => navigateTo('history')}
            onViewBattle={openHistoryRecord}
            onBattleUiActive={setCombatBattleUiActive}
            onPersistenceState={setGameSaveState}
          />
        )}

        {view === 'admin' && <AdminScreen onExit={goBack} />}

        {view === 'tournament' && (
          <TournamentScreen
            tournament={tournament}
            isAdminUser={isAdminUser}
            onPlay={handlePlayTournament}
            onExit={goBack}
            onReset={handleResetTournament}
            onHistory={() => navigateTo('history')}
            loading={loading}
            lastResult={lastResult}
          />
        )}

        {view === 'insights' && (
          <InsightsScreen
            initialSection={insightsLandingSection}
            insights={insights}
            gameHistory={statisticalHistoryList}
            combatHistory={combatHistoryList}
            ratingHistory={loadRatingHistory()}
            onExit={goBack}
            onJumpToMove={jumpToMove}
            onOpenRecord={openHistoryRecord}
            onMovie={openMovie}
            onPlayFromHere={handlePlayFromHere}
            onOpenPuzzles={openPuzzleMode}
            onStartRun={handleStartRun}
            onContinueRun={handleContinueRun}
            isAdminUser={isAdminUser}
          />
        )}

        {view === 'history' && (
          <HistoryScreen
            records={allHistory}
            onOpen={openHistoryRecord}
            onExit={goBack}
            onClear={clearAllHistory}
            onShare={(record) => setShareRecord(record)}
            onMovie={openMovie}
            title="Historial de partidas"
            emptyText='Todavía no jugaste ninguna partida. Normal, Torneo, Partida de práctica y Combat Chess quedan todas acá juntas, con "pista inversa" para revisar dónde te equivocaste.'
          />
        )}

        {view === 'replay' && replayRecord && (
          <ReplayScreen record={replayRecord} initialStep={replayInitialStep} pinnedReport={pinnedReport} crimeMode={replayCrimeMode} movieMode={replayMovieMode} onPlayFromHere={handlePlayFromHere} onExit={goBack} />
        )}

        {view === 'combatReplay' && combatReplayRecord && (
          <CombatReplayScreen record={combatReplayRecord} initialStep={replayInitialStep} pinnedReport={pinnedReport} onExit={goBack} />
        )}

        {view === 'tournamentGame' && tournamentGame && (
          <GameScreen
            game={tournamentGame}
            setGame={setTournamentGame}
            onExit={handleExitTournamentGame}
            onError={setError}
            onPersistenceState={setGameSaveState}
            onGameEnd={handleTournamentGameEnd}
            abandonRatingPreview={(() => { const preview = ratingChangeDetails(rating, tournamentGame.difficulty, 0); return { delta: preview.delta, before: rating.rating, after: preview.next.rating }; })()}
            onChatUpdate={handleGameChatUpdate}
            hintMode="paid"
            tournamentLevel={tournamentLevel}
            points={tournament.points}
            onSpendPoints={handleSpendPoints}
            onCapturePoints={handleCapturePoints}
            onShareResult={(outcome) => setShareRecord(buildLiveShareRecord(tournamentGame, outcome, 'tournament', null, activeTimeControl))}
            onShareIncident={(moveReport, _report, outcome) => setShareRecord({ ...buildLiveShareRecord(tournamentGame, outcome, 'tournament', null, activeTimeControl), incident: { moveNumber: moveReport.moveNumber, played: moveReport.played, suggested: moveReport.suggested, loss: moveReport.loss } })}
            onOpenCrimeScene={(moveReport, _report, meta) => openGameCrimeScene(tournamentGame, moveReport, 'tournament', meta?.outcome)}
            postGameFeedbackEnabled={featureFlags.postGameFeedback}
          />
        )}

        {shareRecord && <ShareResultModal record={shareRecord} onClose={() => setShareRecord(null)} />}
        </React.Suspense>
      </div>
      </ErrorBoundary>
    </>
  );
}

// Envuelve AppInner con la sincronización inicial. Mongo se lee ANTES de
// montar AppInner, porque sus useState(() => loadX()) solo leen localStorage
// una vez. Si la API/Mongo no está disponible no montamos la aplicación con
// una caché potencialmente perteneciente a otra identidad.
function App() {
  const sharedRecord = shareRecordFromHash();
  const { loggedIn, setLoggedIn, ready, isAdminUser, syncError, retryBootstrap } = useAuthenticatedApp();
  useAuthenticatedAudio(loggedIn, ready);

  if (sharedRecord) {
    return (
      <React.Suspense fallback={<div className="route-loading" role="status">Cargando resultado compartido…</div>}>
        <SharedResultScreen record={sharedRecord} onOpenApp={() => {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
          window.location.reload();
        }} />
      </React.Suspense>
    );
  }

  if (!loggedIn) {
    return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;
  }

  if (!ready) {
    return (
      <>
        <div className="app-shell">
          <div className="menu" style={{ maxWidth: 560, margin: '3rem auto' }}>
            <div className="menu-section">
              <span className="eyebrow">Chess Studio</span>
              <h2>{syncError ? 'No se pudo sincronizar' : 'Sincronizando tu perfil…'}</h2>
              {syncError ? (
                <>
                  <p className="error-text" role="alert">{syncError}</p>
                  <button type="button" className="primary-btn" onClick={retryBootstrap}>
                    Reintentar
                  </button>
                </>
              ) : (
                <p className="hint-text" role="status">Cargando tu progreso antes de abrir la aplicación.</p>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return <AppInner isAdminUser={isAdminUser} />;
}

export default App;
