#!/usr/bin/env python3
"""Normalize changed paths into their real app-visual ownership inputs.

The visual classifiers intentionally fail safe on unknown paths. Generated art can
have source files outside their normal trigger surface, though, and those source
paths should inherit the ownership of the runtime asset they produce rather than
expanding one focused art change to every visual producer.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

MATTHIAS_MODEL = "frontend/public/models/matthias-home-canonical.glb"
MATTHIAS_BLEND = "frontend/art-source/matthias-home-canonical.blend"
CHRONICLES_PARTY_MODEL = "frontend/public/models/chronicles-tactics-party.glb"
CHRONICLES_PARTY_BUILDER = "scripts/blender/build_chronicles_tactics_party.py"
PAWN_SLUG_OWNER = "frontend/src/components/PawnSlugGodotHost.jsx"
CHESS_FOOTBALL_OWNER = "frontend/src/components/ChessFootballGodotHost.jsx"
CHESS_FOOTBALL_GAME_ROOT = "games/chess-football-godot/"
PAWN_SLUG_POW_MODEL = "frontend/public/models/pawn-slug/pawn_slug_pow_squad_v1.glb"
PAWN_SLUG_POW_BLEND = "art/blender/pawn-slug/pawn_slug_pow_squad_v1.blend"
PAWN_SLUG_POW_BUILDER = "scripts/blender/build_pawn_slug_pows.py"
R2_MANIFEST = "frontend/src/assets/r2-assets-manifest.json"
PVP_DUEL_MANIFEST_ASSET = "pvp.duelRoom.runtime"
PVP_DUEL_VISUAL_OWNER = "frontend/src/components/PvpDuelRoomShell.js"

APP_SHELL = "frontend/src/App.jsx"
LEARNING_JOURNEY_OWNER = "frontend/src/useLearningJourneyFlow.js"
GLOBAL_SHELL_OWNER = "frontend/src/useGlobalShellUi.js"
TOURNAMENT_FLOW_OWNER = "frontend/src/useTournamentFlow.js"
GLOBAL_OVERLAY_OWNER = "frontend/src/components/GlobalOverlayLayer.jsx"
GAME_START_FLOW_OWNER = "frontend/src/useGameStartFlow.js"
CASUAL_RESULT_FLOW_OWNER = "frontend/src/useCasualResultFlow.js"
LOGOUT_FLOW_OWNER = "frontend/src/useLogoutFlow.js"
FEATURE_FLAGS_OWNER = "frontend/src/usePublicFeatureFlags.js"

GAME_SCREEN = "frontend/src/components/GameScreen.jsx"
PUZZLE_SCREEN_OWNER = "frontend/src/components/PuzzleScreen.jsx"

# These are routing-only handoffs into an already-owned PuzzleScreen surface.
# Keep the allowlists exact and fail closed: any extra App/GameScreen line wakes
# the normal full visual ownership again.
TRAINING_ROUTE_APP_LINES = {
    "<PuzzleScreen key={`${puzzleLaunch.source}-${puzzleLaunch.rush}-${puzzleLaunch.filter?.opening || 'all'}-${puzzleLaunch.dailySlot || 'tactic'}`} initialSource={puzzleLaunch.source} rushMode={puzzleLaunch.rush} initialFilter={puzzleLaunch.filter} dailySlot={puzzleLaunch.dailySlot} onExit={goBack} onPlayAgain={puzzleLaunch.source === 'personal' ? returnToQuickMatchFromPersonalTraining : null} points={tournament.points} onSpendPoints={handleSpendPoints} />",
    "<PuzzleScreen key={`${puzzleLaunch.source}-${puzzleLaunch.rush}-${puzzleLaunch.filter?.opening || 'all'}-${puzzleLaunch.dailySlot || 'tactic'}-${puzzleLaunch.origin || 'direct'}`} initialSource={puzzleLaunch.source} rushMode={puzzleLaunch.rush} initialFilter={puzzleLaunch.filter} dailySlot={puzzleLaunch.dailySlot} trainingOrigin={puzzleLaunch.origin} onExit={goBack} onPlayAgain={puzzleLaunch.source === 'personal' ? returnToQuickMatchFromPersonalTraining : null} points={tournament.points} onSpendPoints={handleSpendPoints} />",
}
POSTGAME_TRAINING_GAME_LINES = {
    "onTrainPersonal?.();",
    "onTrainPersonal?.(null, 'postgame-error');",
}

# Exact App.jsx lines touched by the non-visual learning-journey ownership
# extraction. This is intentionally exact and fail-closed: formatting changes,
# JSX structure changes or any additional App line immediately wake the normal
# full visual classifier again.
NONVISUAL_LEARNING_APP_LINES = {
    "import { usePuzzleLaunchFlow } from './usePuzzleLaunchFlow.js';",
    "import { useLearningJourneyFlow } from './useLearningJourneyFlow.js';",
    "const [insightsLandingSection, setInsightsLandingSection] = useState('diagnosis');",
    "const { puzzleLaunch, quickMatchLaunchNonce, openPuzzleMode, openDailyChallengeSlot, returnToQuickMatchFromPersonalTraining } = usePuzzleLaunchFlow({ navigateTo, resetNavigation });",
    "const { puzzleLaunch, quickMatchLaunchNonce, insightsLandingSection, openPuzzleMode, openPersonalTraining, openDailyChallengeSlot, openInsights, returnToQuickMatchFromPersonalTraining } = useLearningJourneyFlow({ navigateTo, resetNavigation });",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { setShowAccountMenu(false); setInsightsLandingSection('diagnosis'); navigateTo('insights'); }}>",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { setShowAccountMenu(false); openInsights('diagnosis'); }}>",
    "{showGlobalReleaseNotes && <React.Suspense fallback={null}><UserReleaseNotesModal onClose={() => setShowGlobalReleaseNotes(false)} onAction={(to) => { setShowGlobalReleaseNotes(false); openReleaseNoteTarget(to, { navigateTo, setInsightsLandingSection }); }} /></React.Suspense>}",
    "{showGlobalReleaseNotes && <React.Suspense fallback={null}><UserReleaseNotesModal onClose={() => setShowGlobalReleaseNotes(false)} onAction={(to) => { setShowGlobalReleaseNotes(false); openReleaseNoteTarget(to, { navigateTo, openInsights }); }} /></React.Suspense>}",
    "onTrainPersonal={() => openPuzzleMode('personal', false)}",
    "onTrainPersonal={openPersonalTraining}",
    "onInsights={() => { setInsightsLandingSection('diagnosis'); navigateTo('insights'); }}",
    "onInsights={() => openInsights('diagnosis')}",
    "onProgress={() => { setInsightsLandingSection('career'); navigateTo('insights'); }}",
    "onProgress={() => openInsights('career')}",
}

NONVISUAL_APP_DECOMPOSITION_LINES = {
    "import RatingDetailModal from './components/RatingDetailModal.jsx';",
    "import CombatArmySummaryModal from './components/CombatArmySummaryModal.jsx';",
    "import { loadTournament, saveTournament, resetTournament, applyResult, applyCaptureReward, difficultyForLevel, levelForPoints } from './tournament.js';",
    "const GlobalOverlayLayer = React.lazy(() => import('./components/GlobalOverlayLayer.jsx'));",
    "import UserSettingsPanel from './components/UserSettingsPanel.jsx';",
    "import AccountModal from './components/AccountModal.jsx';",
    "const UserReleaseNotesModal = React.lazy(() => import('./components/UserReleaseNotesModal.jsx'));",
    "import FeedbackModal from './components/FeedbackModal.jsx';",
    "import { openReleaseNoteTarget } from './userReleaseNotes.js';",
    "import { useTournamentFlow } from './useTournamentFlow.js';",
    "const [tournament, setTournament] = useState(() => loadTournament());",
    "const [tournamentGame, setTournamentGame] = useState(null);",
    "const [lastResult, setLastResult] = useState(null);",
    "const {", "state: tournament,", "game: tournamentGame,", "setGame: setTournamentGame,",
    "result: lastResult,", "level: tournamentLevel,", "play: handlePlayTournament,",
    "finish: handleTournamentGameEnd,", "spend: handleSpendPoints,", "capture: handleCapturePoints,",
    "exit: handleExitTournamentGame,", "reset: handleResetTournament,", "} = useTournamentFlow({",
    "launch: gameLaunch,", "navigate: navigateTo,", "back: goBack,", "loading: setLoading,",
    "error: setError,", "rating: setRating,", "history: setHistoryList,", "saved: setHasSavedGame,", "});",
    "// --- Modo torneo ---", "", "async function handlePlayTournament(color) {",
    "const launch = gameLaunch.begin();", "if (!launch) return;", "setLoading(true);", "setError(null);", "try {",
    "const level = levelForPoints(tournament.progressPoints || 0);",
    "const cpuDifficulty = difficultyForLevel(level);",
    "const operationId = gameLaunch.operationId(launch, [cpuDifficulty, color, null, null, null]);",
    "const created = await api.createGame(cpuDifficulty, color, null, null, { signal: launch.controller.signal, operationId });",
    "if (!gameLaunch.isCurrent(launch)) { void api.deleteGame(created.id).catch(() => {}); return; }",
    "gameLaunch.confirmCreated(launch);",
    "recordGameActivity({ gameId: created.id, state: 'started', mode: 'tournament', difficulty: created.difficulty });",
    "setTournamentGame(created);", "navigateTo('tournamentGame');", "} catch (e) {",
    "if (gameLaunch.isCurrent(launch) && !isAbortError(e)) setError(userFacingError(e, 'No se pudo iniciar la partida.'));",
    "} finally {", "if (gameLaunch.owns(launch)) setLoading(false);", "gameLaunch.end(launch);", "}",
    "function handleTournamentGameEnd(outcome, finishedGame, endMeta = {}) {",
    "if (!isCompletedGameOutcome(outcome)) return;", "if (finishedGame) {",
    "const moveSans = (finishedGame.history || []).map((m) => m.san).filter(Boolean);",
    "recordRivalryResult(outcome, {", "difficulty: finishedGame.difficulty,", "humanColor: finishedGame.humanColor,",
    "opening: identifyOpening(moveSans),", "moves: finishedGame.history?.length || 0,", "timeControlId: null,",
    "setTournament((prev) => {", "const { state, gained, leveledUp, newLevel } = applyResult(prev, outcome);",
    "saveTournament(state);", "setLastResult({ outcome, gained, leveledUp, newLevel });", "return state;",
    "// Actualizamos también el rating tipo ELO: cuenta como una partida",
    "// más contra una CPU de dificultad conocida.", "const score = ratingScoreForOutcome(outcome);",
    "setRating((prev) => {", "const details = ratingChangeDetails(prev, finishedGame.difficulty, score);",
    "saveRating(details.next);", "recordRatingHistory(details.next.rating);", "setLastResult((current) => ({",
    "...(current || { outcome }),", "eloDelta: details.delta,", "eloBefore: prev.rating,", "eloAfter: details.next.rating,",
    "cpuRating: details.cpuRating,", "expectedScore: details.expectedScore,", "}));", "return details.next;",
    "const record = {", "id: `${finishedGame.id}-${Date.now()}`,", "sourceGameId: finishedGame.id,",
    "date: new Date().toISOString(),", "outcome,", "moves: finishedGame.history,", "finalFen: finishedGame.fen,",
    "mode: 'tournament',", "opening: identifyOpening((finishedGame.history || []).map((m) => m.san).filter(Boolean)),",
    "timeControl: null,", "gameChat: Array.isArray(endMeta.gameChat) ? endMeta.gameChat : loadActiveGameChat(finishedGame.id),",
    "series: null,", "};", "setHistoryList(saveGameRecord(record));",
    "recordGameActivity({ gameId: finishedGame.id, state: 'finished', mode: 'tournament', outcome, difficulty: finishedGame.difficulty });",
    "recordCareerGame(record, {});", "function handleSpendPoints(cost) {",
    "const next = { ...prev, points: Math.max(0, prev.points - cost) };", "saveTournament(next);", "return next;",
    "function handleCapturePoints(gained) {", "// Moneda de pistas exclusivamente. No altera progreso de torneo ni ELO.",
    "const next = applyCaptureReward(prev, gained);", "function handleExitTournamentGame() {", "if (tournamentGame?.id) {",
    "const exitDisposition = chessGameExitDisposition(tournamentGame, { explicitAction: true });",
    "if (exitDisposition === 'forfeit') handleTournamentGameEnd('loss', tournamentGame, { endReason: 'resignation' });",
    "else recordGameActivity({ gameId: tournamentGame.id, state: 'cancelled', mode: 'tournament', difficulty: tournamentGame.difficulty });",
    "clearActiveGameSession();", "setHasSavedGame(!!getStorageItem(STORAGE_LOCAL, STORAGE_KEY));",
    "setTournamentGame(null);", "goBack();", "function handleResetTournament() {", "setTournament(resetTournament());",
    "setLastResult(null);", "{showRatingDetail && (", "<RatingDetailModal rating={rating} onClose={closeRatingDetail} />",
    ")}", "{showCombatSummary && (", "<CombatArmySummaryModal", "roster={loadCombatRoster()}",
    "onClose={closeCombatSummary}", "onOpenCombat={() => { closeCombatSummary(); navigateTo('roguelike'); }}", "/>",
    "{(showRatingDetail || showCombatSummary || showSettings || showGlobalAccount || showGlobalReleaseNotes || showGlobalFeedback) && (",
    "<React.Suspense fallback={<div className=\"modal-backdrop\" />}>", "<GlobalOverlayLayer", "shellUi={shellUi}",
    "rating={rating} tournament={tournament} combatOverview={combatOverview}",
    "isAdminUser={isAdminUser} navigateTo={navigateTo} openInsights={openInsights}",
    "onLogout={handleGlobalLogout} loggingOut={loggingOut} view={view}", "</React.Suspense>",
    "{showSettings && <UserSettingsPanel isAdminUser={isAdminUser} onClose={closeSettings} onBoard3D={() => { closeSettings(); navigateTo('board3d'); }} />}",
    "{showGlobalAccount && <AccountModal rating={rating} tournament={tournament} combatOverview={combatOverview} onClose={closeGlobalAccount} onLogout={() => void handleGlobalLogout()} loggingOut={loggingOut} />}",
    "{showGlobalReleaseNotes && <React.Suspense fallback={null}><UserReleaseNotesModal onClose={closeReleaseNotes} onAction={(to) => { closeReleaseNotes(); openReleaseNoteTarget(to, { navigateTo, openInsights }); }} /></React.Suspense>}",
    "{showGlobalFeedback && <FeedbackModal context={view === 'menu' ? 'Home' : `Global · ${view}`} onClose={closeGlobalFeedback} />}",
    "tournamentLevel={levelForPoints(tournament.progressPoints || 0)}", "tournamentLevel={tournamentLevel}",
}

NONVISUAL_GAME_START_APP_LINES = {
    "import { handicapForGap } from './handicap.js';",
    "import { timeControlById } from './clock.js';",
    "import { loadRivalry, recordRivalryResult, reconcileRivalryHistory } from './rivalry.js';",
    "import { recordRivalryResult, reconcileRivalryHistory } from './rivalry.js';",
    "import { createSeries, loadActiveSeries, saveActiveSeries, clearActiveSeries, recordSeriesGame } from './series.js';",
    "import { attachSeriesGame } from './seriesFlow.js';",
    "import { loadActiveSeries, clearActiveSeries, recordSeriesGame } from './series.js';",
    "import { chooseContract, clearActiveContract, loadActiveContract, loadSpecialRun, recordCareerGame, recordSpecialRunResult, reconcileCareerHistory, saveActiveContract, saveSpecialRun, startSpecialRun } from './career.js';",
    "import { clearActiveContract, loadActiveContract, loadSpecialRun, recordCareerGame, recordSpecialRunResult, reconcileCareerHistory } from './career.js';",
    "import { userFacingError } from './userFacingError.js';",
    "import { isAbortError } from './asyncControl.js';",
    "import { useGameStartFlow } from './useGameStartFlow.js';",
    "const {",
    "startGame: handleNewGame,",
    "nextSeriesGame: handleNextSeriesGame,",
    "playFromHere: handlePlayFromHere,",
    "startRun: handleStartRun,",
    "continueRun: handleContinueRun,",
    "} = useGameStartFlow({",
    "launch: gameLaunch,",
    "navigate: navigateTo,",
    "loading: setLoading,",
    "error: setError,",
    "rating,",
    "currentGame: game,",
    "currentSeries: activeSeries,",
    "currentRun: specialRun,",
    "gameCount: statisticalHistoryRecords(historyList).length,",
    "setGame,",
    "saved: setHasSavedGame,",
    "learning: setLearningMode,",
    "timeControl: setActiveTimeControl,",
    "context: setGameContext,",
    "contract: setActiveContract,",
    "series: setActiveSeries,",
    "run: setSpecialRun,",
    "resetResult: () => { setExitNotice(null); setCasualResult(null); },",
    "});",
    "async function handleNewGame(difficulty, color, opts) {",
    "const launch = gameLaunch.begin();",
    "if (!launch) return false;",
    "setExitNotice(null);",
    "setCasualResult(null);",
    "setLoading(true);",
    "setError(null);",
    "try {",
    "const handicap = handicapForGap(rating.rating, difficulty);",
    "const operationId = gameLaunch.operationId(launch, [difficulty, color, handicap?.id ?? null, null]);",
    "const created = await api.createGame(difficulty, color, handicap?.id ?? null, null, { signal: launch.controller.signal, operationId });",
    "if (!gameLaunch.isCurrent(launch)) { void api.deleteGame(created.id).catch(() => {}); return false; }",
    "gameLaunch.confirmCreated(launch);",
    "const isLearning = !!opts?.learning;",
    "const nextContext = { rematch: !!opts?.rematch, adaptiveDifficulty: !!opts?.adaptiveDifficulty, runMode: opts?.runMode || null, lab: !!opts?.lab, rescue: !!opts?.rescue, suddenDeath: !!opts?.suddenDeath, threatCheck: !!opts?.threatCheck };",
    "setLearningMode(isLearning);",
    "setActiveTimeControl(timeControlById(opts?.timeControlId));",
    "setGameContext(nextContext);",
    "recordGameActivity({ gameId: created.id, state: 'started', mode: gameModeFromContext({ learningMode: isLearning, gameContext: nextContext }), difficulty: created.difficulty, detail: nextContext.adaptiveDifficulty ? 'adaptive-difficulty' : null });",
    "const shouldOfferContract = !isLearning && !opts?.runMode && !opts?.lab && !opts?.rescue && Number(opts?.seriesBestOf || 1) <= 1;",
    "const contract = shouldOfferContract ? chooseContract({ gameCount: statisticalHistoryList.length, incidents: loadRivalry().incidents }) : null;",
    "if (contract) saveActiveContract(contract); else clearActiveContract();",
    "setActiveContract(contract);",
    "",
    "if (!isLearning && Number(opts?.seriesBestOf) > 1) {",
    "const series = createSeries({",
    "bestOf: Number(opts.seriesBestOf),",
    "difficulty,",
    "firstColor: created.humanColor,",
    "timeControlId: opts?.timeControlId || 'none', adaptiveDifficulty: nextContext.adaptiveDifficulty,",
    "const withGame = attachSeriesGame(series, created.id);",
    "saveActiveSeries(withGame);",
    "setActiveSeries(withGame);",
    "} else {",
    "clearActiveSeries();",
    "setActiveSeries(null);",
    "}",
    "setGame(created);",
    "setHasSavedGame(true);",
    "navigateTo('game');",
    "return true;",
    "} catch (e) {",
    "if (gameLaunch.isCurrent(launch) && !isAbortError(e)) setError(userFacingError(e, 'No se pudo iniciar la partida.'));",
    "return false;",
    "} finally {",
    "if (gameLaunch.owns(launch)) setLoading(false);",
    "gameLaunch.end(launch);",
    "async function handleNextSeriesGame() {",
    "if (!activeSeries || activeSeries.winner) return;",
    "if (!launch) return;",
    "if (game?.id) clearClockSnapshot(game.id);",
    "// La limpieza de la partida anterior no es una precondición para crear",
    "// la siguiente. Si DELETE se atasca, la serie no debe parecer congelada.",
    "if (game?.id) void api.deleteGame(game.id).catch(() => {});",
    "const handicap = handicapForGap(rating.rating, activeSeries.difficulty);",
    "const operationId = gameLaunch.operationId(launch, [activeSeries.difficulty, activeSeries.nextColor, handicap?.id ?? null, null, null]);",
    "const created = await api.createGame(activeSeries.difficulty, activeSeries.nextColor, handicap?.id ?? null, null, { signal: launch.controller.signal, operationId });",
    "if (!gameLaunch.isCurrent(launch)) { void api.deleteGame(created.id).catch(() => {}); return; }",
    "recordGameActivity({ gameId: created.id, state: 'started', mode: 'casual', difficulty: created.difficulty, detail: activeSeries.adaptiveDifficulty ? 'adaptive-difficulty' : null });",
    "const updatedSeries = attachSeriesGame(activeSeries, created.id);",
    "saveActiveSeries(updatedSeries);",
    "setActiveSeries(updatedSeries);",
    "setLearningMode(false);",
    "setActiveTimeControl(timeControlById(updatedSeries.timeControlId));",
    "if (gameLaunch.isCurrent(launch) && !isAbortError(e)) setError(userFacingError(e, 'No se pudo crear la siguiente partida de la serie.'));",
    "async function handlePlayFromHere(fen, humanColor, difficulty, meta = {}) {",
    "const operationId = gameLaunch.operationId(launch, [difficulty || 50, humanColor || 'w', null, fen, null]);",
    "const created = await api.createGame(difficulty || 50, humanColor || 'w', null, fen, { signal: launch.controller.signal, operationId });",
    "const nextContext = { lab: true, rescue: !!meta.rescue, nemesis: !!meta.nemesis, nemesisLabel: meta.nemesisLabel || null, nemesisOpening: meta.nemesisOpening || null, sourceRecordId: meta.sourceRecord?.id || null };",
    "recordGameActivity({ gameId: created.id, state: 'started', mode: gameModeFromContext({ learningMode: true, gameContext: nextContext }), difficulty: created.difficulty });",
    "clearActiveContract();",
    "setActiveContract(null);",
    "setSpecialRun(loadSpecialRun());",
    "setLearningMode(true);",
    "setActiveTimeControl(null);",
    "if (gameLaunch.isCurrent(launch) && !isAbortError(e)) setError(userFacingError(e, 'No se pudo arrancar la posición del laboratorio.'));",
    "} finally { if (gameLaunch.owns(launch)) setLoading(false); gameLaunch.end(launch); }",
    "async function launchRun(run) {",
    "const operationId = gameLaunch.operationId(launch, [run.difficulty, 'random', null, null, null]);",
    "const created = await api.createGame(run.difficulty, 'random', null, null, { signal: launch.controller.signal, operationId });",
    "recordGameActivity({ gameId: created.id, state: 'started', mode: run.mode || 'streak', difficulty: created.difficulty });",
    "const withGame = saveSpecialRun({ ...run, currentGameId: created.id });",
    "setSpecialRun(withGame);",
    "setGameContext({ runMode: run.mode });",
    "setActiveTimeControl(timeControlById('5+0'));",
    "if (gameLaunch.isCurrent(launch) && !isAbortError(e)) setError(userFacingError(e, 'No se pudo iniciar el desafío.'));",
    "function handleStartRun(mode) {",
    "if (gameLaunch.busy()) return;",
    "const run = startSpecialRun(mode);",
    "void launchRun(run);",
    "function handleContinueRun(run = specialRun) {",
    "if (run?.active && !gameLaunch.busy()) void launchRun(run);",
}

NONVISUAL_CASUAL_RESULT_APP_LINES = {
    "import { updateGameRecordChat, statisticalHistoryRecords } from './gameHistory.js';",
    "import { recordGameActivity } from './gameActivity.js';",
    "import { chessGameExitDisposition } from './gameOutcome.js';",
    "import { saveGameRecord, updateGameRecordChat, statisticalHistoryRecords } from './gameHistory.js';",
    "import { recordGameActivity, recordCompletedAdaptiveMatchmakingTelemetry } from './gameActivity.js';",
    "import { chessGameExitDisposition, isCompletedGameOutcome, shouldApplyCompetitiveProgress } from './gameOutcome.js';",
    "import { loadRating, ratingChangeDetails, loadRatingHistory } from './playerRating.js';",
    "import { loadRating, saveRating, ratingChangeDetails, ratingScoreForOutcome, recordRatingHistory, loadRatingHistory } from './playerRating.js';",
    "import { reconcileRivalryHistory } from './rivalry.js';",
    "import { recordRivalryResult, reconcileRivalryHistory } from './rivalry.js';",
    "import { loadActiveSeries, clearActiveSeries } from './series.js';",
    "import { loadActiveSeries, clearActiveSeries, recordSeriesGame } from './series.js';",
    "import { clearActiveContract, loadActiveContract, loadSpecialRun, reconcileCareerHistory } from './career.js';",
    "import { clearActiveContract, loadActiveContract, loadSpecialRun, recordCareerGame, recordSpecialRunResult, reconcileCareerHistory } from './career.js';",
    "import { useCasualResultFlow } from './useCasualResultFlow.js';",
    "const [casualResult, setCasualResult] = useState(null);",
    "result: casualResult,",
    "clearResult: clearCasualResult,",
    "finish: handleCasualGameEnd,",
    "} = useCasualResultFlow({",
    "activeSeries,",
    "setActiveSeries,",
    "gameContext,",
    "learningMode,",
    "activeTimeControl,",
    "rating,",
    "setRating,",
    "setHistoryList,",
    "activeContract,",
    "setActiveContract,",
    "specialRun,",
    "setSpecialRun,",
    "});",
    "const {",
    "resetResult: () => { setExitNotice(null); clearCasualResult(); },",
    "resetResult: () => { setExitNotice(null); setCasualResult(null); },",
    "// Las partidas normales (menú \"Nueva partida\") también cuentan para el",
    "// rating tipo ELO — cualquier partida contra una CPU de dificultad",
    "// conocida, no hace falta que sea de torneo. \"Partida de práctica\" queda",
    "// afuera a propósito: ahí las pistas son gratis e ilimitadas, así que",
    "// ganar no dice mucho de tu nivel jugando sin ayuda.",
    "//",
    "// También se guardan en el historial (igual que las de torneo), para que",
    "// la \"pista inversa\" del Historial funcione acá también, no solo en",
    "// Torneo — con una etiqueta de modo para distinguirlas al navegar la lista.",
    "function handleCasualGameEnd(outcome, finishedGame, endMeta = {}) {",
    "if (!finishedGame || !isCompletedGameOutcome(outcome)) return null;",
    "clearClockSnapshot(finishedGame.id);",
    "const moveSans = (finishedGame.history || []).map((m) => m.san).filter(Boolean);",
    "const opening = identifyOpening(moveSans);",
    "let seriesSnapshot = activeSeries;",
    "const trainingPosition = !!(gameContext.lab || gameContext.rescue || gameContext.suddenDeath);",
    "",
    "let ratingSummary = { ratingApplied: false };",
    "if (shouldApplyCompetitiveProgress(outcome, { learningMode, trainingPosition })) {",
    "if (activeSeries && !activeSeries.winner) {",
    "seriesSnapshot = recordSeriesGame(activeSeries, outcome, {",
    "gameId: finishedGame.id,",
    "humanColor: finishedGame.humanColor,",
    "moves: finishedGame.history?.length || 0,",
    "opening,",
    "setActiveSeries(seriesSnapshot);",
    "}",
    "recordRivalryResult(outcome, {",
    "difficulty: finishedGame.difficulty,",
    "timeControlId: activeTimeControl?.id || 'none',",
    "seriesId: seriesSnapshot?.id || null,",
    "rematch: !!gameContext.rematch,",
    "runMode: gameContext.runMode || null,",
    "suddenDeath: !!gameContext.suddenDeath,",
    "pressureMoves: Number(endMeta.pressureMoves || 0),",
    "pressureIncidents: Number(endMeta.pressureIncidents || 0),",
    "const score = ratingScoreForOutcome(outcome);",
    "const details = ratingChangeDetails(rating, finishedGame.difficulty, score);",
    "saveRating(details.next);",
    "recordRatingHistory(details.next.rating);",
    "setRating(details.next);",
    "ratingSummary = {",
    "ratingApplied: true,",
    "eloDelta: details.delta,",
    "eloBefore: rating.rating,",
    "eloAfter: details.next.rating, ratingGames: details.next.games,",
    "};",
    "const record = {",
    "id: `${finishedGame.id}-${Date.now()}`,",
    "sourceGameId: finishedGame.id,",
    "date: new Date().toISOString(),",
    "outcome,",
    "moves: finishedGame.history,",
    "finalFen: finishedGame.fen,",
    "initialFen: finishedGame.initialFen || null,",
    "mode: gameContext.suddenDeath ? 'sudden' : gameContext.rescue ? 'rescue' : gameContext.nemesis ? 'nemesis-training' : gameContext.lab ? 'lab' : gameContext.runMode === 'cup' ? 'cup' : gameContext.runMode === 'boss' ? 'boss' : gameContext.runMode === 'streak' ? 'streak' : learningMode ? 'practice' : 'casual',",
    "timeControl: activeTimeControl ? { id: activeTimeControl.id, label: activeTimeControl.label } : null,",
    "gameChat: Array.isArray(endMeta.gameChat) ? endMeta.gameChat : loadActiveGameChat(finishedGame.id),",
    "series: seriesSnapshot ? {",
    "id: seriesSnapshot.id,",
    "bestOf: seriesSnapshot.bestOf,",
    "humanWins: seriesSnapshot.humanWins,",
    "cpuWins: seriesSnapshot.cpuWins,",
    "draws: seriesSnapshot.draws,",
    "winner: seriesSnapshot.winner,",
    "} : null,",
    "setHistoryList(saveGameRecord(record));",
    "recordGameActivity({ gameId: finishedGame.id, state: 'finished', mode: record.mode, outcome, difficulty: finishedGame.difficulty });",
    "recordCompletedAdaptiveMatchmakingTelemetry({ gameContext, finishedGame, outcome, endMeta });",
    "recordCareerGame(record, { ...endMeta, contract: activeContract });",
    "clearActiveContract();",
    "setActiveContract(null);",
    "const title = endMeta.endReason === 'resignation'",
    "? 'Abandono registrado como derrota'",
    ": outcome === 'win' ? 'Victoria' : outcome === 'draw' ? 'Tablas' : 'Derrota';",
    "const detail = ratingSummary.ratingApplied",
    "? `Rating ${ratingSummary.eloDelta >= 0 ? '+' : ''}${ratingSummary.eloDelta} · ${ratingSummary.eloBefore} → ${ratingSummary.eloAfter}`",
    ": 'Esta modalidad no afecta a tu rating.';",
    "const summary = { gameId: finishedGame.id, outcome, title, detail, endReason: endMeta.endReason || null, adaptiveDifficulty: !!gameContext.adaptiveDifficulty, ...ratingSummary };",
    "setCasualResult(summary);",
    "if (specialRun?.active && gameContext.runMode) {",
    "const nextRun = recordSpecialRunResult(specialRun, outcome);",
    "setSpecialRun(nextRun);",
    "return summary;",
}

NONVISUAL_SESSION_SHELL_APP_LINES = {
    "import { activityForView, usePresenceHeartbeat } from './usePresenceHeartbeat.js';",
    "import { usePresenceHeartbeat } from './usePresenceHeartbeat.js';",
    "import { logout, reportLogoutPresence, touchActivity } from './auth.js';",
    "import { pushProfileToServer } from './profileBackup.js';",
    "import { DEFAULT_FEATURE_FLAGS, normalizeFeatureFlags } from './featureFlags.js';",
    "import { runLogoutLifecycle } from './logoutLifecycle.js';",
    "import { useLogoutFlow } from './useLogoutFlow.js';",
    "import { usePublicFeatureFlags } from './usePublicFeatureFlags.js';",
    "const [loggingOut, setLoggingOut] = useState(false);",
    "const [logoutError, setLogoutError] = useState(null);",
    "const [featureFlags, setFeatureFlags] = useState(() => ({ ...DEFAULT_FEATURE_FLAGS }));",
    "const featureFlags = usePublicFeatureFlags();",
    "const { loggingOut, logoutError, logout: handleGlobalLogout } = useLogoutFlow(view);",
    "useEffect(() => {",
    "let active = true;",
    "api.getFeatures()",
    ".then((payload) => { if (active) setFeatureFlags(normalizeFeatureFlags(payload)); })",
    ".catch(() => { /* defaults mantienen el producto operativo con backend antiguo/offline */ });",
    "return () => { active = false; };",
    "}, []);",
    "",
    "async function handleGlobalLogout() {",
    "setLogoutError(null);",
    "setLoggingOut(true);",
    "try {",
    "await runLogoutLifecycle({",
    "saveProfile: () => pushProfileToServer({ throwOnError: true }),",
    "closePresence: () => reportLogoutPresence(),",
    "restorePresence: () => touchActivity(activityForView(view), document.visibilityState === 'visible'),",
    "clearSession: logout,",
    "});",
    "window.location.reload();",
    "} catch {",
    "setLogoutError('No se pudo guardar tu progreso. Reintenta cuando vuelva la conexión.');",
    "setLoggingOut(false);",
    "}",
}

NONVISUAL_GLOBAL_SHELL_APP_LINES = {
    "const {",
    "useEffect(() => {",
    "}",
    "};",
    "",
    "import React, { useEffect, useRef, useState } from 'react';",
    "import { LATEST_USER_NOTE_ID, USER_RELEASE_NOTES_KEY, openReleaseNoteTarget } from './userReleaseNotes.js';",
    "import { setProfileStorageItem } from './profileKeys.js';",
    "const [showRatingDetail, setShowRatingDetail] = useState(false);",
    "const [showCombatSummary, setShowCombatSummary] = useState(false);",
    "const [showSettings, setShowSettings] = useState(false);",
    "const [showGlobalAccount, setShowGlobalAccount] = useState(false);",
    "const [showGlobalReleaseNotes, setShowGlobalReleaseNotes] = useState(false);",
    "const [releaseNotesSeen, setReleaseNotesSeen] = useState(() => getStorageItem(STORAGE_LOCAL, USER_RELEASE_NOTES_KEY) === LATEST_USER_NOTE_ID);",
    "const [showGlobalFeedback, setShowGlobalFeedback] = useState(false);",
    "const [showAccountMenu, setShowAccountMenu] = useState(false);",
    "const accountMenuRef = useRef(null);",
    "const accountMenuButtonRef = useRef(null);",
    "if (!showAccountMenu) return undefined;",
    "function closeOnOutsidePointer(event) {",
    "if (!accountMenuRef.current?.contains(event.target)) setShowAccountMenu(false);",
    "function closeOnEscape(event) {",
    "if (event.key !== 'Escape') return;",
    "setShowAccountMenu(false);",
    "accountMenuButtonRef.current?.focus();",
    "document.addEventListener('pointerdown', closeOnOutsidePointer);",
    "document.addEventListener('keydown', closeOnEscape);",
    "return () => {",
    "document.removeEventListener('pointerdown', closeOnOutsidePointer);",
    "document.removeEventListener('keydown', closeOnEscape);",
    "}, [showAccountMenu]);",
    "onClick={() => setShowGlobalFeedback(true)}",
    "onClick={() => setShowAccountMenu((open) => !open)}",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { setShowAccountMenu(false); setShowGlobalAccount(true); }}>",
    "<button type=\"button\" role=\"menuitem\" className=\"masthead-account-menu-admin\" onClick={() => { setShowAccountMenu(false); navigateTo('admin'); }}>",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { setShowAccountMenu(false); openInsights('diagnosis'); }}>",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { setShowAccountMenu(false); setShowSettings(true); }}>",
    "<button type=\"button\" role=\"menuitem\" className=\"masthead-account-menu-logout\" onClick={() => { setShowAccountMenu(false); void handleGlobalLogout(); }} disabled={loggingOut}>",
    "onClick={() => { setProfileStorageItem(USER_RELEASE_NOTES_KEY, LATEST_USER_NOTE_ID); setReleaseNotesSeen(true); setShowGlobalReleaseNotes(true); }}",
    "onCombatClick={() => setShowCombatSummary(true)}",
    "onRatingClick={() => setShowRatingDetail(true)}",
    "<RatingDetailModal rating={rating} onClose={() => setShowRatingDetail(false)} />",
    "onClose={() => setShowCombatSummary(false)}",
    "onOpenCombat={() => { setShowCombatSummary(false); navigateTo('roguelike'); }}",
    "{showSettings && <UserSettingsPanel isAdminUser={isAdminUser} onClose={() => setShowSettings(false)} onBoard3D={() => { setShowSettings(false); navigateTo('board3d'); }} />}",
    "{showGlobalAccount && <AccountModal rating={rating} tournament={tournament} combatOverview={combatOverview} onClose={() => setShowGlobalAccount(false)} onLogout={() => void handleGlobalLogout()} loggingOut={loggingOut} />}",
    "{showGlobalReleaseNotes && <React.Suspense fallback={null}><UserReleaseNotesModal onClose={() => setShowGlobalReleaseNotes(false)} onAction={(to) => { setShowGlobalReleaseNotes(false); openReleaseNoteTarget(to, { navigateTo, openInsights }); }} /></React.Suspense>}",
    "{showGlobalFeedback && <FeedbackModal context={view === 'menu' ? 'Home' : `Global · ${view}`} onClose={() => setShowGlobalFeedback(false)} />}",
    "suppressHomeNudge={showSettings || showGlobalAccount || showGlobalReleaseNotes || showGlobalFeedback}",
    "onCustomize={() => setShowSettings(true)}",
    "import React, { useEffect, useState } from 'react';",
    "import { openReleaseNoteTarget } from './userReleaseNotes.js';",
    "import { useGlobalShellUi } from './useGlobalShellUi.js';",
    "const shellUi = useGlobalShellUi();",
    "showRatingDetail, openRatingDetail, closeRatingDetail, showCombatSummary, openCombatSummary, closeCombatSummary,",
    "showSettings, openSettings, closeSettings, showGlobalAccount, openGlobalAccount, closeGlobalAccount,",
    "showGlobalReleaseNotes, releaseNotesSeen, openReleaseNotes, closeReleaseNotes, showGlobalFeedback,",
    "openGlobalFeedback, closeGlobalFeedback, showAccountMenu, toggleAccountMenu, closeAccountMenu,",
    "accountMenuRef, accountMenuButtonRef, suppressHomeNudge,",
    "} = shellUi;",
    "onClick={openGlobalFeedback}",
    "onClick={toggleAccountMenu}",
    "<button type=\"button\" role=\"menuitem\" onClick={openGlobalAccount}>",
    "<button type=\"button\" role=\"menuitem\" className=\"masthead-account-menu-admin\" onClick={() => { closeAccountMenu(); navigateTo('admin'); }}>",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { closeAccountMenu(); openInsights('diagnosis'); }}>",
    "<button type=\"button\" role=\"menuitem\" onClick={openSettings}>",
    "<button type=\"button\" role=\"menuitem\" className=\"masthead-account-menu-logout\" onClick={() => { closeAccountMenu(); void handleGlobalLogout(); }} disabled={loggingOut}>",
    "onClick={openReleaseNotes}",
    "onCombatClick={openCombatSummary}",
    "onRatingClick={openRatingDetail}",
    "<RatingDetailModal rating={rating} onClose={closeRatingDetail} />",
    "onClose={closeCombatSummary}",
    "onOpenCombat={() => { closeCombatSummary(); navigateTo('roguelike'); }}",
    "{showSettings && <UserSettingsPanel isAdminUser={isAdminUser} onClose={closeSettings} onBoard3D={() => { closeSettings(); navigateTo('board3d'); }} />}",
    "{showGlobalAccount && <AccountModal rating={rating} tournament={tournament} combatOverview={combatOverview} onClose={closeGlobalAccount} onLogout={() => void handleGlobalLogout()} loggingOut={loggingOut} />}",
    "{showGlobalReleaseNotes && <React.Suspense fallback={null}><UserReleaseNotesModal onClose={closeReleaseNotes} onAction={(to) => { closeReleaseNotes(); openReleaseNoteTarget(to, { navigateTo, openInsights }); }} /></React.Suspense>}",
    "{showGlobalFeedback && <FeedbackModal context={view === 'menu' ? 'Home' : `Global · ${view}`} onClose={closeGlobalFeedback} />}",
    "suppressHomeNudge={suppressHomeNudge}",
    "onCustomize={openSettings}",
}


def _is_matthias_canonical_owner(path: str) -> bool:
    lower = path.lower().replace("\\", "/")
    return (
        lower == MATTHIAS_MODEL
        or lower == MATTHIAS_BLEND
        or lower == "frontend/art-source/matthias-home-canonical-reference.txt"
        or lower == "frontend/art-source/matthias-home-canonical-reference.webp"
        or lower == "scripts/blender/build_home_matthias.py"
        or lower == "scripts/blender/validate_home_matthias_contract.py"
        or lower.startswith("scripts/blender/home_matthias_")
    )


def _manifest_asset_from_text(text: str, logical_id: str):
    try:
        payload = json.loads(text)
    except (TypeError, json.JSONDecodeError):
        return None
    assets = payload.get("assets") if isinstance(payload, dict) else None
    if not isinstance(assets, dict):
        return None
    value = assets.get(logical_id)
    return value if isinstance(value, dict) else None


def _git_show_text(revision: str, path: str) -> str | None:
    if not revision:
        return None
    try:
        return subprocess.check_output(
            ["git", "show", f"{revision}:{path}"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, OSError):
        return None


def _manifest_asset_changed(base_sha: str, head_sha: str, logical_id: str) -> bool:
    before = _git_show_text(base_sha, R2_MANIFEST)
    after = _git_show_text(head_sha, R2_MANIFEST)
    if before is None or after is None:
        return False
    return _manifest_asset_from_text(before, logical_id) != _manifest_asset_from_text(after, logical_id)


def _git_diff_text(base_sha: str, head_sha: str, path: str) -> str | None:
    if not base_sha or not head_sha:
        return None
    try:
        return subprocess.check_output(
            ["git", "diff", "--unified=0", base_sha, head_sha, "--", path],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, OSError):
        return None


def _changed_source_lines(diff_text: str) -> list[str]:
    return [
        line[1:].strip()
        for line in diff_text.splitlines()
        if line[:1] in {"+", "-"} and not line.startswith(("+++", "---"))
    ]


def _is_exact_routing_diff(diff_text: str | None, allowed_lines: set[str]) -> bool:
    if not diff_text:
        return False
    changed_lines = _changed_source_lines(diff_text)
    return bool(changed_lines) and all(line in allowed_lines for line in changed_lines)


def _is_training_route_app_diff(diff_text: str | None) -> bool:
    return _is_exact_routing_diff(diff_text, TRAINING_ROUTE_APP_LINES)


def _is_postgame_training_game_diff(diff_text: str | None) -> bool:
    return _is_exact_routing_diff(diff_text, POSTGAME_TRAINING_GAME_LINES)


def _is_nonvisual_learning_app_diff(diff_text: str | None) -> bool:
    if not diff_text:
        return False
    changed_lines = _changed_source_lines(diff_text)
    return bool(changed_lines) and all(line in NONVISUAL_LEARNING_APP_LINES for line in changed_lines)


def _is_nonvisual_global_shell_app_diff(diff_text: str | None) -> bool:
    if not diff_text:
        return False
    changed_lines = _changed_source_lines(diff_text)
    return bool(changed_lines) and all(line in NONVISUAL_GLOBAL_SHELL_APP_LINES for line in changed_lines)


def _is_nonvisual_app_decomposition_diff(diff_text: str | None) -> bool:
    if not diff_text:
        return False
    changed_lines = _changed_source_lines(diff_text)
    return bool(changed_lines) and all(line in NONVISUAL_APP_DECOMPOSITION_LINES for line in changed_lines)


def _is_nonvisual_game_start_app_diff(diff_text: str | None) -> bool:
    if not diff_text:
        return False
    changed_lines = _changed_source_lines(diff_text)
    return bool(changed_lines) and all(line in NONVISUAL_GAME_START_APP_LINES for line in changed_lines)


def _is_nonvisual_casual_result_app_diff(diff_text: str | None) -> bool:
    if not diff_text:
        return False
    changed_lines = _changed_source_lines(diff_text)
    return bool(changed_lines) and all(line in NONVISUAL_CASUAL_RESULT_APP_LINES for line in changed_lines)


def _is_nonvisual_session_shell_app_diff(diff_text: str | None) -> bool:
    if not diff_text:
        return False
    changed_lines = _changed_source_lines(diff_text)
    return bool(changed_lines) and all(line in NONVISUAL_SESSION_SHELL_APP_LINES for line in changed_lines)


def _is_app_visual_e2e(path: str) -> bool:
    """Keep only E2E files that the app-visual workflow itself owns."""
    lower = path.lower().replace("\\", "/")
    if not lower.startswith("e2e/"):
        return False
    name = lower.rsplit("/", 1)[-1]
    return (
        ("visual" in name and name.endswith(".spec.js"))
        or (name.startswith("browser-") and name.endswith("-health.spec.js"))
    )


def normalize(
    paths: list[str],
    *,
    base_sha: str = "",
    head_sha: str = "",
) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    lower_paths = {raw.strip().replace("\\", "/").lower() for raw in paths if raw.strip()}
    safe_training_route_app = (
        PUZZLE_SCREEN_OWNER.lower() in lower_paths
        and _is_training_route_app_diff(_git_diff_text(base_sha, head_sha, APP_SHELL))
    )
    safe_postgame_training_game = (
        PUZZLE_SCREEN_OWNER.lower() in lower_paths
        and _is_postgame_training_game_diff(_git_diff_text(base_sha, head_sha, GAME_SCREEN))
    )
    safe_learning_app = (
        LEARNING_JOURNEY_OWNER.lower() in lower_paths
        and _is_nonvisual_learning_app_diff(_git_diff_text(base_sha, head_sha, APP_SHELL))
    )
    safe_global_shell_app = (
        GLOBAL_SHELL_OWNER.lower() in lower_paths
        and _is_nonvisual_global_shell_app_diff(_git_diff_text(base_sha, head_sha, APP_SHELL))
    )
    safe_app_decomposition = (
        TOURNAMENT_FLOW_OWNER.lower() in lower_paths
        and GLOBAL_OVERLAY_OWNER.lower() in lower_paths
        and _is_nonvisual_app_decomposition_diff(_git_diff_text(base_sha, head_sha, APP_SHELL))
    )
    safe_game_start_app = (
        GAME_START_FLOW_OWNER.lower() in lower_paths
        and _is_nonvisual_game_start_app_diff(_git_diff_text(base_sha, head_sha, APP_SHELL))
    )
    safe_casual_result_app = (
        CASUAL_RESULT_FLOW_OWNER.lower() in lower_paths
        and _is_nonvisual_casual_result_app_diff(_git_diff_text(base_sha, head_sha, APP_SHELL))
    )
    safe_session_shell_app = (
        LOGOUT_FLOW_OWNER.lower() in lower_paths
        and FEATURE_FLAGS_OWNER.lower() in lower_paths
        and _is_nonvisual_session_shell_app_diff(_git_diff_text(base_sha, head_sha, APP_SHELL))
    )

    def add(path: str) -> None:
        if path not in seen:
            seen.add(path)
            normalized.append(path)

    for raw in paths:
        path = raw.strip().replace("\\", "/")
        if not path:
            continue
        lower = path.lower()
        if lower == APP_SHELL.lower() and safe_training_route_app:
            add(PUZZLE_SCREEN_OWNER)
            continue
        if lower == GAME_SCREEN.lower() and safe_postgame_training_game:
            add(PUZZLE_SCREEN_OWNER)
            continue
        if lower == APP_SHELL.lower() and (safe_learning_app or safe_global_shell_app or safe_app_decomposition or safe_game_start_app or safe_casual_result_app or safe_session_shell_app):
            # App.jsx is normally a global visual owner. Suppress it only for
            # the exact, audited navigation extraction above; any extra changed
            # App line fails closed and restores the canonical visual sweep.
            continue
        if lower == R2_MANIFEST and _manifest_asset_changed(base_sha, head_sha, PVP_DUEL_MANIFEST_ASSET):
            # Manifest promotions normally own no pixels. Duel Room is different:
            # runtime consumption is pinned to the promoted immutable object, so
            # changing this logical asset must wake the PvP Duel Room browser proof.
            add(PVP_DUEL_VISUAL_OWNER)
            continue
        # A push may contain functional E2E changes alongside one real visual
        # owner. Those functional specs are not part of this workflow's trigger
        # surface and must not turn a focused capture into the fail-closed full
        # visual suite. Visual/health E2E files remain explicit owners.
        if lower.startswith("e2e/") and not _is_app_visual_e2e(path):
            continue
        if lower.startswith(CHESS_FOOTBALL_GAME_ROOT):
            # Godot owns its own parse/smoke/PNG evidence. App visual only needs
            # the experiments host surface, never Home/Training/War Room.
            add(CHESS_FOOTBALL_OWNER)
            continue
        if _is_matthias_canonical_owner(path):
            # Canonical Home Matthias changes are validated by the dedicated
            # Home Matthias visual producer. Chronicles owns its authored avatar
            # separately and must not wake for Home-only pawn geometry changes.
            add(MATTHIAS_MODEL)
            continue
        if lower in {CHRONICLES_PARTY_MODEL, CHRONICLES_PARTY_BUILDER}:
            add(CHRONICLES_PARTY_MODEL)
            continue
        if lower in {
            PAWN_SLUG_POW_MODEL,
            PAWN_SLUG_POW_BLEND,
            PAWN_SLUG_POW_BUILDER,
        }:
            # The POW GLB is rendered only by Pawn Slug. Use a stable runtime
            # owner already understood by both visual classifiers.
            add(PAWN_SLUG_OWNER)
            continue
        add(path)
    return normalized


def self_test() -> None:
    matthias_sources = [
        MATTHIAS_BLEND,
        MATTHIAS_MODEL,
        "scripts/blender/build_home_matthias.py",
        "scripts/blender/home_matthias_parts.py",
        "scripts/blender/home_matthias_animations.py",
        "scripts/blender/validate_home_matthias_contract.py",
        "frontend/art-source/matthias-home-canonical-reference.txt",
        "frontend/art-source/matthias-home-canonical-reference.webp",
    ]
    assert normalize(matthias_sources) == [MATTHIAS_MODEL]
    assert normalize(["frontend/src/App.css", *matthias_sources]) == [
        "frontend/src/App.css",
        MATTHIAS_MODEL,
    ]
    chronicles_party_sources = [CHRONICLES_PARTY_BUILDER, CHRONICLES_PARTY_MODEL]
    assert normalize(chronicles_party_sources) == [CHRONICLES_PARTY_MODEL]
    pawn_slug_pow_sources = [PAWN_SLUG_POW_BLEND, PAWN_SLUG_POW_MODEL, PAWN_SLUG_POW_BUILDER]
    assert normalize(pawn_slug_pow_sources) == [PAWN_SLUG_OWNER]
    assert normalize(["scripts/unknown_visual_owner.py"]) == ["scripts/unknown_visual_owner.py"]

    safe_learning_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import { usePuzzleLaunchFlow } from './usePuzzleLaunchFlow.js';\n+import { useLearningJourneyFlow } from './useLearningJourneyFlow.js';\n@@ -2 +1,0 @@\n-const [insightsLandingSection, setInsightsLandingSection] = useState('diagnosis');\n"
    unsafe_learning_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import { usePuzzleLaunchFlow } from './usePuzzleLaunchFlow.js';\n+import { useLearningJourneyFlow } from './useLearningJourneyFlow.js';\n@@ -2 +1,0 @@\n-const [insightsLandingSection, setInsightsLandingSection] = useState('diagnosis');\n@@ -10 +10 @@\n-<main className=\"old-shell\">\n+<main className=\"new-shell\">\n"
    assert _is_nonvisual_learning_app_diff(safe_learning_diff)
    assert not _is_nonvisual_learning_app_diff(unsafe_learning_diff)
    assert not _is_nonvisual_learning_app_diff(None)

    safe_training_route_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-<PuzzleScreen key={`old`} initialSource={puzzleLaunch.source} />\n+<PuzzleScreen key={`new`} initialSource={puzzleLaunch.source} trainingOrigin={puzzleLaunch.origin} />\n"
    assert not _is_training_route_app_diff(safe_training_route_diff)
    exact_app_lines = list(TRAINING_ROUTE_APP_LINES)
    exact_training_route_diff = f"--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-{exact_app_lines[0]}\n+{exact_app_lines[1]}\n"
    assert _is_training_route_app_diff(exact_training_route_diff)
    unsafe_training_route_diff = exact_training_route_diff + "@@ -10 +10 @@\n-<main className=\\\"old\\\">\n+<main className=\\\"new\\\">\n"
    assert not _is_training_route_app_diff(unsafe_training_route_diff)

    exact_game_lines = list(POSTGAME_TRAINING_GAME_LINES)
    exact_postgame_diff = f"--- a/frontend/src/components/GameScreen.jsx\n+++ b/frontend/src/components/GameScreen.jsx\n@@ -1 +1 @@\n-{exact_game_lines[0]}\n+{exact_game_lines[1]}\n"
    assert _is_postgame_training_game_diff(exact_postgame_diff)
    assert not _is_postgame_training_game_diff(exact_postgame_diff + "@@ -2 +2 @@\n-old visual\n+new visual\n")

    safe_shell_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import React, { useEffect, useRef, useState } from 'react';\n+import React, { useEffect, useState } from 'react';\n@@ -2,0 +2 @@\n+import { useGlobalShellUi } from './useGlobalShellUi.js';\n"
    unsafe_shell_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import React, { useEffect, useRef, useState } from 'react';\n+import React, { useEffect, useState } from 'react';\n@@ -2,0 +2 @@\n+import { useGlobalShellUi } from './useGlobalShellUi.js';\n@@ -10 +10 @@\n-<main className=\"old-shell\">\n+<main className=\"new-shell\">\n"
    assert _is_nonvisual_global_shell_app_diff(safe_shell_diff)
    assert not _is_nonvisual_global_shell_app_diff(unsafe_shell_diff)
    assert not _is_nonvisual_global_shell_app_diff(None)

    safe_decomposition_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import RatingDetailModal from './components/RatingDetailModal.jsx';\n+const GlobalOverlayLayer = React.lazy(() => import('./components/GlobalOverlayLayer.jsx'));\n"
    unsafe_decomposition_diff = safe_decomposition_diff + "@@ -20 +20 @@\n-<main className=\"old\">\n+<main className=\"new\">\n"
    assert _is_nonvisual_app_decomposition_diff(safe_decomposition_diff)
    assert not _is_nonvisual_app_decomposition_diff(unsafe_decomposition_diff)
    assert not _is_nonvisual_app_decomposition_diff(None)

    safe_game_start_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import { handicapForGap } from './handicap.js';\n+import { useGameStartFlow } from './useGameStartFlow.js';\n"
    unsafe_game_start_diff = safe_game_start_diff + "@@ -20 +20 @@\n-<main className=\"old\">\n+<main className=\"new\">\n"
    assert _is_nonvisual_game_start_app_diff(safe_game_start_diff)
    assert not _is_nonvisual_game_start_app_diff(unsafe_game_start_diff)
    assert not _is_nonvisual_game_start_app_diff(None)

    safe_casual_result_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import { recordRivalryResult, reconcileRivalryHistory } from './rivalry.js';\n+import { reconcileRivalryHistory } from './rivalry.js';\n"
    unsafe_casual_result_diff = safe_casual_result_diff + "@@ -20 +20 @@\n-<main className=\"old\">\n+<main className=\"new\">\n"
    assert _is_nonvisual_casual_result_app_diff(safe_casual_result_diff)
    assert not _is_nonvisual_casual_result_app_diff(unsafe_casual_result_diff)
    assert not _is_nonvisual_casual_result_app_diff(None)

    safe_session_shell_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import { activityForView, usePresenceHeartbeat } from './usePresenceHeartbeat.js';\n+import { usePresenceHeartbeat } from './usePresenceHeartbeat.js';\n"
    unsafe_session_shell_diff = safe_session_shell_diff + "@@ -20 +20 @@\n-<main className=\"old\">\n+<main className=\"new\">\n"
    assert _is_nonvisual_session_shell_app_diff(safe_session_shell_diff)
    assert not _is_nonvisual_session_shell_app_diff(unsafe_session_shell_diff)
    assert not _is_nonvisual_session_shell_app_diff(None)

    manifest_before = json.dumps({
        "assets": {
            PVP_DUEL_MANIFEST_ASSET: {"sha256": "old", "bytes": 1},
            "home.scene.runtime": {"sha256": "same"},
        }
    })
    manifest_after = json.dumps({
        "assets": {
            PVP_DUEL_MANIFEST_ASSET: {"sha256": "new", "bytes": 2},
            "home.scene.runtime": {"sha256": "same"},
        }
    })
    assert _manifest_asset_from_text(manifest_before, PVP_DUEL_MANIFEST_ASSET)["sha256"] == "old"
    assert _manifest_asset_from_text(manifest_after, PVP_DUEL_MANIFEST_ASSET)["sha256"] == "new"
    assert _manifest_asset_from_text("not-json", PVP_DUEL_MANIFEST_ASSET) is None

    # Functional browser tests can travel in the same commit as a visual owner,
    # but app-visual does not own them and must not fail closed to every surface.
    assert normalize([
        "e2e/chronicles-of-matthias-tactics.spec.js",
        "frontend/src/chroniclesTacticsTurnMode.js",
    ]) == ["frontend/src/chroniclesTacticsTurnMode.js"]
    assert normalize(["e2e/regression-journeys.spec.js"]) == []
    assert normalize([
        "games/chess-football-godot/scripts/match.gd",
        "games/chess-football-godot/scripts/football_3d_presenter.gd",
        "games/chess-football-godot/tests/match_smoke.gd",
    ]) == [CHESS_FOOTBALL_OWNER]

    # Visual artifacts and browser-health specs are explicit workflow owners and
    # therefore must survive normalization unchanged.
    for owned_e2e in (
        "e2e/chronicles-tactics-visual-artifact.spec.js",
        "e2e/app-visual-artifact.spec.js",
        "e2e/browser-runtime-health.spec.js",
        "e2e/browser-storage-health.spec.js",
    ):
        assert normalize([owned_e2e]) == [owned_e2e]

    print("app visual changed-file normalization self-test: OK")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    base_sha = os.environ.get("APP_VISUAL_BASE_SHA", "")
    head_sha = os.environ.get("APP_VISUAL_HEAD_SHA", "")
    for path in normalize(
        sys.stdin.read().splitlines(),
        base_sha=base_sha,
        head_sha=head_sha,
    ):
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
