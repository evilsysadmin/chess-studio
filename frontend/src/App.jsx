import React, { useEffect, useMemo, useState } from 'react';
import Menu from './components/Menu.jsx';
import GameScreen from './components/GameScreen.jsx';
import Tutorial from './components/Tutorial.jsx';
import OpeningsScreen from './components/OpeningsScreen.jsx';
import TournamentScreen from './components/TournamentScreen.jsx';
import HistoryScreen from './components/HistoryScreen.jsx';
import ReplayScreen from './components/ReplayScreen.jsx';
import CombatReplayScreen from './components/CombatReplayScreen.jsx';
import SpectatorScreen from './components/SpectatorScreen.jsx';
const Board3DExperiment = React.lazy(() => import('./components/Board3DExperiment.jsx'));
import { loadCombatHistory, clearCombatHistory } from './combatHistory.js';
import PuzzleScreen from './components/PuzzleScreen.jsx';
import CombatScreen from './components/CombatScreen.jsx';
import RoguelikeScreen from './components/RoguelikeScreen.jsx';
import PlayerStatusBar from './components/PlayerStatusBar.jsx';
import RatingDetailModal from './components/RatingDetailModal.jsx';
import MuteToggle from './components/MuteToggle.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { startAmbientMusic, stopAmbientMusic } from './sound.js';
import { api, STORAGE_KEY } from './api.js';
import { loadTournament, saveTournament, resetTournament, applyResult, difficultyForLevel, levelForPoints } from './tournament.js';
import { loadGameHistory, saveGameRecord, clearGameHistory } from './gameHistory.js';
import { loadRoster as loadCombatRoster } from './combatRoster.js';
import { loadRating, saveRating, updateRating, recordRatingHistory, loadRatingHistory } from './playerRating.js';
import { handicapForGap } from './handicap.js';
import { computeInsights } from './insights.js';
import InsightsScreen from './components/InsightsScreen.jsx';
import { timeControlById } from './clock.js';
import { checkAchievements } from './achievements.js';
import { pullProfileFromServer, pushProfileToServer } from './profileBackup.js';
import { isLoggedIn, fetchMe } from './auth.js';
import AdminScreen from './components/AdminScreen.jsx';
import LoginScreen from './components/LoginScreen.jsx';

// Guarda si la partida activa es "Partida de práctica" (pistas gratis) por separado del propio
// objeto de partida: ese objeto se reemplaza por completo con cada respuesta
// del servidor (que no sabe nada de esta marca, es solo del cliente), así
// que si viviera ahí se perdería en la primera jugada.
const LEARNING_STORAGE_KEY = 'chess-study-active-game-learning';
const MIRROR_STORAGE_KEY = 'chess-study-active-game-mirror';

// 'menu' | 'game' | 'tutorial' | 'openings' | 'tournament' | 'tournamentGame' | 'puzzle' | 'combat' | 'history' | 'replay'
function AppInner({ isAdminUser }) {
  const [view, setView] = useState('menu');
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSavedGame, setHasSavedGame] = useState(!!localStorage.getItem(STORAGE_KEY));
  const [learningMode, setLearningMode] = useState(() => localStorage.getItem(LEARNING_STORAGE_KEY) === '1');
  const [mirrorMode, setMirrorMode] = useState(() => localStorage.getItem(MIRROR_STORAGE_KEY) === '1');

  const [tournament, setTournament] = useState(() => loadTournament());
  const [tournamentGame, setTournamentGame] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [historyList, setHistoryList] = useState(() => loadGameHistory());
  const [combatHistoryList, setCombatHistoryList] = useState(() => loadCombatHistory());
  const [replayRecord, setReplayRecord] = useState(null);
  const [combatReplayRecord, setCombatReplayRecord] = useState(null);
  const [replayInitialStep, setReplayInitialStep] = useState(undefined);
  const [pinnedReport, setPinnedReport] = useState(null);

  // Desde "Así juegas" → "Ver esta jugada": abre el replay que corresponda
  // (normal o de combate, según de dónde vino) parado justo en esa jugada,
  // no en el final de la partida como el resto de los accesos al historial.
  function jumpToMove(record, kind, moveReport) {
    setReplayInitialStep(moveReport.index + 1);
    setPinnedReport(moveReport);
    if (kind === 'combat') {
      setCombatReplayRecord(record);
      setView('combatReplay');
    } else {
      setReplayRecord(record);
      setView('replay');
    }
  }


  // Historial unificado: partidas normales/torneo/práctica (moves) y
  // batallas de combate (log) mezcladas y ordenadas por fecha — una sola
  // sección de "todas mis partidas", en vez de dos listas separadas.
  const allHistory = useMemo(
    () => [...historyList, ...combatHistoryList].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [historyList, combatHistoryList]
  );

  // "Así juegas": estadísticas agregadas, calculadas al instante con lo que
  // ya está guardado (sin volver a llamar al backend) — solo se recalcula
  // si cambia alguno de los historiales de origen.
  const insights = useMemo(
    () => computeInsights(historyList, combatHistoryList, loadRatingHistory()),
    [historyList, combatHistoryList]
  );

  // Cada registro sabe reproducirse solo en la pantalla correcta según su
  // propia forma: `log` = batalla de combate (FENs guardados directo),
  // `moves` = partida normal/torneo/práctica (SAN reproducible). El
  // historial no necesita saber esta distinción, solo abrir lo que le toque.
  function openHistoryRecord(record) {
    setReplayInitialStep(undefined);
    setPinnedReport(null);
    if (record.log) {
      setCombatReplayRecord(record);
      setView('combatReplay');
    } else {
      setReplayRecord(record);
      setView('replay');
    }
  }

  function clearAllHistory() {
    setHistoryList(clearGameHistory());
    setCombatHistoryList(clearCombatHistory());
  }

  // Estos dos viven en localStorage manejados por otras pantallas (el
  // Modo Combate tiene su propio roster, independiente) — los releemos acá
  // cada vez que cambia la vista, así la cabecera se mantiene al día sin
  // tener que levantar ese estado hasta acá arriba.
  const [rating, setRating] = useState(() => loadRating());
  const [combatXp, setCombatXp] = useState(() => loadCombatRoster().combatXp);
  const [activeTimeControl, setActiveTimeControl] = useState(null);
  const [showRatingDetail, setShowRatingDetail] = useState(false);

  useEffect(() => {
    if (game) localStorage.setItem(STORAGE_KEY, game.id);
  }, [game]);

  useEffect(() => {
    localStorage.setItem(LEARNING_STORAGE_KEY, learningMode ? '1' : '0');
  }, [learningMode]);

  useEffect(() => {
    localStorage.setItem(MIRROR_STORAGE_KEY, mirrorMode ? '1' : '0');
  }, [mirrorMode]);

  useEffect(() => {
    setRating(loadRating());
    setCombatXp(loadCombatRoster().combatXp);
    setCombatHistoryList(loadCombatHistory());
    checkAchievements();
    // Subimos el perfil actual al backend en cada cambio de pantalla — de
    // fondo, sin bloquear ni avisar nada. Es la forma de que el progreso
    // sobreviva aunque limpies el navegador o pises la carpeta del proyecto
    // con una versión nueva: la copia de Mongo queda siempre razonablemente
    // al día.
    pushProfileToServer();
  }, [view]);

  async function handleNewGame(difficulty, color, opts) {
    setLoading(true);
    setError(null);
    try {
      // En modo Espejo la dificultad YA está calibrada a propósito (más baja
      // cuanto más te equivocas tú) — aplicar el hándicap dinámico encima
      // compensaría dos veces la misma brecha, dejando una CPU mucho más
      // floja de lo que el propio modo Espejo pretendía.
      const handicap = opts?.mirror ? null : handicapForGap(rating.rating, difficulty);
      const created = await api.createGame(difficulty, color, handicap?.id ?? null);
      setLearningMode(!!opts?.learning);
      setMirrorMode(!!opts?.mirror);
      setActiveTimeControl(timeControlById(opts?.timeControlId));
      setGame(created);
      setHasSavedGame(true);
      setView('game');
    } catch (e) {
      setError('No se pudo conectar con el servidor. ¿Está corriendo el backend?');
    } finally {
      setLoading(false);
    }
  }

  async function handleContinue() {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return;
    setLoading(true);
    setError(null);
    try {
      const found = await api.getGame(savedId);
      setGame(found);
      setLearningMode(localStorage.getItem(LEARNING_STORAGE_KEY) === '1');
      setMirrorMode(localStorage.getItem(MIRROR_STORAGE_KEY) === '1');
      // El reloj vive solo en memoria del navegador (no se guarda en el
      // servidor) — al continuar una partida no hay forma de saber cuánto
      // tiempo quedaba, así que arranca sin reloj.
      setActiveTimeControl(null);
      setView('game');
    } catch (e) {
      setError('No se encontró esa partida en el servidor (puede haberse reiniciado).');
      localStorage.removeItem(STORAGE_KEY);
      setHasSavedGame(false);
    } finally {
      setLoading(false);
    }
  }

  function handleExitGame() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEARNING_STORAGE_KEY);
    localStorage.removeItem(MIRROR_STORAGE_KEY);
    setHasSavedGame(false);
    setGame(null);
    setLearningMode(false);
    setMirrorMode(false);
    setView('menu');
  }

  // Las partidas normales (menú "Nueva partida") también cuentan para el
  // rating tipo ELO — cualquier partida contra una CPU de dificultad
  // conocida, no hace falta que sea de torneo. "Partida de práctica" y
  // "Espejo de ti mismo" quedan afuera a propósito: en Práctica las
  // pistas son gratis e ilimitadas, así que ganar no dice mucho de tu
  // nivel jugando sin ayuda; en Espejo, la CPU está calibrada A PROPÓSITO
  // para jugar peor que un rival "justo" (mientras más te equivocas tú,
  // más floja la CPU) — dejarla subir el rating premiaría ganarle a un
  // rival deliberadamente débil, exactamente lo contrario de lo que un
  // rating debería medir (vencer a alguien mejor, no a alguien peor).
  //
  // También se guardan en el historial (igual que las de torneo), para que
  // la "pista inversa" del Historial funcione acá también, no solo en
  // Torneo — con una etiqueta de modo para distinguirlas al navegar la lista.
  function handleCasualGameEnd(outcome, finishedGame) {
    if (!finishedGame) return;

    if (!learningMode && !mirrorMode) {
      const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
      setRating((prev) => {
        const next = updateRating(prev, finishedGame.difficulty, score);
        saveRating(next);
        recordRatingHistory(next.rating);
        return next;
      });
    }

    const record = {
      id: `${finishedGame.id}-${Date.now()}`,
      date: new Date().toISOString(),
      difficulty: finishedGame.difficulty,
      humanColor: finishedGame.humanColor,
      outcome,
      moves: finishedGame.history,
      finalFen: finishedGame.fen,
      mode: learningMode ? 'practice' : 'casual',
    };
    setHistoryList(saveGameRecord(record));
  }

  // --- Modo torneo ---

  async function handlePlayTournament(color) {
    setLoading(true);
    setError(null);
    try {
      const level = levelForPoints(tournament.points);
      const cpuDifficulty = difficultyForLevel(level);
      const created = await api.createGame(cpuDifficulty, color);
      setTournamentGame(created);
      setView('tournamentGame');
    } catch (e) {
      setError('No se pudo conectar con el servidor. ¿Está corriendo el backend?');
    } finally {
      setLoading(false);
    }
  }

  function handleTournamentGameEnd(outcome, finishedGame) {
    setTournament((prev) => {
      const { state, gained, leveledUp, newLevel } = applyResult(prev, outcome);
      saveTournament(state);
      setLastResult({ outcome, gained, leveledUp, newLevel });
      return state;
    });

    if (finishedGame) {
      // Actualizamos también el rating tipo ELO: cuenta como una partida
      // más contra una CPU de dificultad conocida.
      const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
      setRating((prev) => {
        const next = updateRating(prev, finishedGame.difficulty, score);
        saveRating(next);
        recordRatingHistory(next.rating);
        return next;
      });

      const record = {
        id: `${finishedGame.id}-${Date.now()}`,
        date: new Date().toISOString(),
        difficulty: finishedGame.difficulty,
        humanColor: finishedGame.humanColor,
        outcome,
        moves: finishedGame.history,
        finalFen: finishedGame.fen,
        mode: 'tournament',
      };
      setHistoryList(saveGameRecord(record));
    }
  }

  function handleSpendPoints(cost) {
    setTournament((prev) => {
      const next = { ...prev, points: Math.max(0, prev.points - cost) };
      saveTournament(next);
      return next;
    });
  }

  function handleCapturePoints(gained) {
    setTournament((prev) => {
      const next = { ...prev, points: prev.points + gained };
      saveTournament(next);
      return next;
    });
  }

  function handleExitTournamentGame() {
    setTournamentGame(null);
    setView('tournament');
  }

  function handleResetTournament() {
    setTournament(resetTournament());
    setLastResult(null);
  }

  return (
    <ErrorBoundary onReset={() => setView('menu')}>
      <div className="app-shell">
        <div className="masthead">
          <div className="masthead-top-row">
            <MuteToggle />
            <div className="masthead-text">
              <h1>Escuela de Ajedrez</h1>
            </div>
          </div>
          <PlayerStatusBar
            tournament={tournament}
            combatXp={combatXp}
            rating={rating}
            onTournamentClick={() => setView('tournament')}
            onRatingClick={() => setShowRatingDetail(true)}
          />
        </div>

        {showRatingDetail && (
          <RatingDetailModal rating={rating} onClose={() => setShowRatingDetail(false)} />
        )}

        {view === 'menu' && (
          <Menu
            onNewGame={handleNewGame}
            onContinue={handleContinue}
            onTournament={() => setView('tournament')}
            onTutorial={() => setView('tutorial')}
            onOpenings={() => setView('openings')}
            onPuzzle={() => setView('puzzle')}
            onSpectator={() => setView('spectator')}
            onCombat={() => setView('combat')}
            onCombatRoguelike={() => setView('roguelike')}
            isAdminUser={isAdminUser}
            onAdmin={() => setView('admin')}
            onHistory={() => setView('history')}
            onInsights={() => setView('insights')}
            onBoard3D={() => setView('board3d')}
            hasSavedGame={hasSavedGame}
            loading={loading}
            error={error}
            tournament={tournament}
            rating={rating}
          />
        )}

        {view === 'game' && game && (
          <GameScreen
            game={game}
            setGame={setGame}
            onExit={handleExitGame}
            onError={setError}
            onGameEnd={handleCasualGameEnd}
            hintMode={learningMode ? 'free' : 'off'}
            timeControl={activeTimeControl}
          />
        )}

        {view === 'tutorial' && <Tutorial onExit={() => setView('menu')} />}
        {view === 'openings' && <OpeningsScreen onExit={() => setView('menu')} />}

        {view === 'puzzle' && (
          <PuzzleScreen onExit={() => setView('menu')} points={tournament.points} onSpendPoints={handleSpendPoints} />
        )}

        {view === 'spectator' && <SpectatorScreen onExit={() => setView('menu')} />}

        {view === 'board3d' && (
          <React.Suspense fallback={<p className="hint-text" style={{ textAlign: 'center' }}>Cargando el visor 3D…</p>}>
            <Board3DExperiment onExit={() => setView('menu')} />
          </React.Suspense>
        )}

        {view === 'combat' && (
          <CombatScreen
            onExit={() => setView('menu')}
            onError={setError}
            onHistory={() => setView('history')}
            onViewBattle={openHistoryRecord}
          />
        )}

        {view === 'roguelike' && (
          <RoguelikeScreen
            onExit={() => setView('menu')}
            onError={setError}
            onHistory={() => setView('history')}
            onViewBattle={openHistoryRecord}
          />
        )}

        {view === 'admin' && <AdminScreen onExit={() => setView('menu')} />}

        {view === 'tournament' && (
          <TournamentScreen
            tournament={tournament}
            onPlay={handlePlayTournament}
            onExit={() => setView('menu')}
            onReset={handleResetTournament}
            onHistory={() => setView('history')}
            loading={loading}
            lastResult={lastResult}
          />
        )}

        {view === 'insights' && (
          <InsightsScreen
            insights={insights}
            gameHistory={historyList}
            combatHistory={combatHistoryList}
            ratingHistory={loadRatingHistory()}
            onExit={() => setView('menu')}
            onJumpToMove={jumpToMove}
          />
        )}

        {view === 'history' && (
          <HistoryScreen
            records={allHistory}
            onOpen={openHistoryRecord}
            onExit={() => setView('menu')}
            onClear={clearAllHistory}
            title="Historial de partidas"
            emptyText='Todavía no jugaste ninguna partida. Normal, Torneo, Práctica y Combate quedan todas acá juntas, con "pista inversa" para revisar dónde te equivocaste.'
          />
        )}

        {view === 'replay' && replayRecord && (
          <ReplayScreen record={replayRecord} initialStep={replayInitialStep} pinnedReport={pinnedReport} onExit={() => setView('history')} />
        )}

        {view === 'combatReplay' && combatReplayRecord && (
          <CombatReplayScreen record={combatReplayRecord} initialStep={replayInitialStep} pinnedReport={pinnedReport} onExit={() => setView('history')} />
        )}

        {view === 'tournamentGame' && tournamentGame && (
          <GameScreen
            game={tournamentGame}
            setGame={setTournamentGame}
            onExit={handleExitTournamentGame}
            onError={setError}
            onGameEnd={handleTournamentGameEnd}
            hintMode="paid"
            tournamentLevel={levelForPoints(tournament.points)}
            points={tournament.points}
            onSpendPoints={handleSpendPoints}
            onCapturePoints={handleCapturePoints}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

// Envuelve AppInner con la sincronización inicial: al arrancar, intenta
// bajar el perfil guardado en el backend (Mongo) y pisar localStorage ANTES
// de que AppInner monte y sus `useState(() => loadX())` lean esos valores
// — por eso es un componente aparte, no un simple `if` dentro de AppInner:
// los hooks de useState solo ejecutan su inicializador en el primer render,
// así que hace falta que ese primer render de AppInner ocurra DESPUÉS de la
// sincronización, no antes. Si no hay backend disponible (por ejemplo
// corriendo el frontend solo, sin Docker Compose), sigue con lo que haya
// localmente — no bloquea el uso normal de la app.
function App() {
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [ready, setReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    Promise.all([pullProfileFromServer(), fetchMe()]).then(([, me]) => {
      if (cancelled) return;
      setIsAdminUser(!!me?.isAdmin);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [loggedIn]);

  // Música ambiental a nivel de toda la app, no solo el menú — arranca una
  // sola vez al cargar y sigue sonando en cualquier pantalla, hasta que se
  // mutee con el botón (cada nota individual ya chequea isMuted() por su
  // cuenta en sound.js, así que mutear no necesita parar este efecto,
  // solo silencia lo que sigue sonando de fondo).
  useEffect(() => {
    startAmbientMusic();
    return () => stopAmbientMusic();
  }, []);

  if (!loggedIn) {
    return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;
  }

  if (!ready) {
    return (
      <div className="app-shell">
        <p className="hint-text" style={{ margin: '3rem auto', textAlign: 'center' }}>
          Sincronizando tu perfil…
        </p>
      </div>
    );
  }

  return <AppInner isAdminUser={isAdminUser} />;
}

export default App;
