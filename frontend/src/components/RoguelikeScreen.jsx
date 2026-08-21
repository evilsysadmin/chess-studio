import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import CombatScreen from './CombatScreen.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { applyModifierToFen, encounterForRun } from '../roguelikeModifiers.js';
import { rewardOptionsForFloor, perkById } from '../roguelikePerks.js';
import { ROGUELIKE_BOSS, ROGUELIKE_BOSS_FLOOR } from '../roguelikeBoss.js';
import {
  loadRun,
  startNewRun,
  markBattleStarted,
  markFloorCleared,
  chooseRunReward,
  advanceFloor,
  completeTower,
  continueIntoEndless,
  endRun,
  loadBestFloor,
  loadTowerCompleted,
  difficultyForFloor,
  ROGUELIKE_TOWER_FLOORS,
} from '../roguelikeRun.js';

const HUMAN_COLOR = 'w';
const CPU_COLOR = 'b';

export default function RoguelikeScreen({ onExit, onError, onHistory, onViewBattle }) {
  const [run, setRun] = useState(() => loadRun());
  const [bestFloor, setBestFloor] = useState(() => loadBestFloor());
  const [towerCompleted, setTowerCompleted] = useState(() => loadTowerCompleted());
  const [endResult, setEndResult] = useState(null); // { type, reached, newBest }
  const [combatSessionActive, setCombatSessionActive] = useState(false);

  useEscapeToClose(onExit, {
    disabled: run.inRun && (run.phase === 'battle' || (run.phase === 'fighting' && combatSessionActive)),
  });

  const encounter = useMemo(
    () => (run.inRun ? encounterForRun(run.seed, run.floor) : null),
    [run.inRun, run.seed, run.floor],
  );
  const nextEncounter = useMemo(
    () => (run.inRun && run.phase === 'cleared' ? encounterForRun(run.seed, run.floor + 1) : null),
    [run.inRun, run.phase, run.seed, run.floor],
  );
  const rewardOptions = useMemo(
    () => (run.inRun && run.phase === 'cleared' ? rewardOptionsForFloor(run.seed, run.floor) : []),
    [run.inRun, run.phase, run.seed, run.floor],
  );
  const runPerkDetails = useMemo(
    () => (run.perks || []).map(perkById).filter(Boolean),
    [run.perks],
  );

  const initialFen = useMemo(() => {
    if (!encounter) return null;
    return applyModifierToFen(new Chess().fen(), encounter.modifierId, CPU_COLOR);
  }, [encounter]);

  function handleStartRun() {
    setCombatSessionActive(false);
    setRun(startNewRun());
    setEndResult(null);
  }

  function finishRun(type, runToFinish = run) {
    const previousBest = loadBestFloor();
    const reached = endRun(runToFinish);
    const updatedBest = loadBestFloor();
    setBestFloor(updatedBest);
    setTowerCompleted(loadTowerCompleted());
    setCombatSessionActive(false);
    setRun(loadRun());
    setEndResult({ type, reached, newBest: reached > previousBest });
  }

  function handleBattleStarted() {
    setCombatSessionActive(true);
    setRun((current) => markBattleStarted(current));
  }

  function handleBattleResult(outcome) {
    setCombatSessionActive(false);
    if (outcome === 'win') {
      if (run.mode === 'tower' && run.floor === ROGUELIKE_BOSS_FLOOR) {
        setRun((current) => completeTower(current));
        setTowerCompleted(true);
        setBestFloor((current) => Math.max(current, ROGUELIKE_TOWER_FLOORS));
      } else {
        setRun((current) => markFloorCleared(current));
      }
      return;
    }
    finishRun(outcome === 'retired' ? 'retired' : 'over');
  }

  function handleChooseReward(perkId) {
    setRun((current) => chooseRunReward(current, perkId));
  }

  function handleContinue() {
    setCombatSessionActive(false);
    setRun(advanceFloor(run));
    setEndResult(null);
  }

  function handleContinueEndless() {
    setCombatSessionActive(false);
    setRun(continueIntoEndless(run));
    setEndResult(null);
  }

  function handleRetire() {
    finishRun('retired');
  }

  if (run.inRun && run.phase === 'fighting' && !combatSessionActive) {
    return (
      <div className="menu">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section roguelike-interrupted">
          <span className="section-label">Combate · integridad del intento</span>
          <h2>La pelea quedó interrumpida</h2>
          <p className="hero-scope-note">
            Este piso ya había empezado y la sesión desapareció antes de resolverlo. Reiniciarlo desde cero
            permitiría repetir tiradas y posiciones hasta que saliera una buena: save-scum de manual.
          </p>
          <p className="hint-text">
            El intento se considera perdido. Tu ejército guardado conserva el último estado que llegó a persistirse;
            no se inventan bajas que el juego no llegó a registrar.
          </p>
          <button type="button" className="primary-btn" style={{ width: '100%', marginTop: '0.8rem' }} onClick={() => finishRun('interrupted')}>
            Cerrar el intento interrumpido
          </button>
        </div>
      </div>
    );
  }

  if (run.inRun && (run.phase === 'battle' || (run.phase === 'fighting' && combatSessionActive))) {
    const isBoss = run.mode === 'tower' && run.floor === ROGUELIKE_BOSS_FLOOR;
    return (
      <CombatScreen
        key={`${run.seed}-${run.floor}-${encounter?.id || 'encounter'}`}
        onExit={onExit}
        onError={onError}
        onHistory={onHistory}
        onViewBattle={onViewBattle}
        initialFen={initialFen}
        forcedHumanColor={HUMAN_COLOR}
        difficultyOverride={difficultyForFloor(run.floor)}
        difficultyLabel={isBoss ? `Boss · Piso ${run.floor}` : `${run.mode === 'endless' ? 'Infinito · ' : ''}Piso ${run.floor}`}
        encounterLabel={encounter?.label}
        encounterDescription={encounter?.description}
        encounterTier={encounter?.tier}
        combatVariant="roguelike"
        runPerks={run.perks || []}
        runPerkDetails={runPerkDetails}
        bossConfig={isBoss ? ROGUELIKE_BOSS : null}
        onBattleStart={handleBattleStarted}
        onBattleResult={handleBattleResult}
      />
    );
  }

  return (
    <div className="menu">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section">
        <span className="section-label">Combate</span>
        <h2>Roguelike · La Torre</h2>
        <p className="hero-scope-note">
          Objetivo: superar <b>10 pisos</b> y derrotar al Rey Viejo. Ya no es una escalera infinita sin destino:
          hay encuentros, élites, un miniboss, recompensas temporales entre pisos y un jefe final con HP.
        </p>
        <p className="hint-text" style={{ marginTop: '0.55rem' }}>
          Usas tu <b>ejército real de Combate</b>. Su veteranía persiste fuera del intento; las ventajas que eliges
          dentro de la Torre son temporales y desaparecen cuando el intento termina.
        </p>

        <div className="roguelike-objective-strip">
          <span>1–3 · encuentros</span>
          <span>4 · élite</span>
          <span>5 · miniboss</span>
          <span>9 · élite</span>
          <span>10 · REY BOSS ♥♥♥♥♥</span>
        </div>

        {bestFloor > 0 && <p className="hint-text">Mejor piso alcanzado: <b>{bestFloor}</b></p>}
        {towerCompleted && <p className="hint-text roguelike-completed-mark">✓ Torre completada al menos una vez · infinito desbloqueado</p>}

        {!run.inRun && !endResult && (
          <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>
            Comenzar intento
          </button>
        )}

        {run.inRun && run.phase === 'cleared' && (
          <div className="tournament-result roguelike-reward-screen" style={{ marginTop: '0.8rem' }}>
            <h3>¡Piso {run.floor} superado!</h3>
            <p className="hint-text">Elige <b>una</b> ventaja para el resto de este intento.</p>
            <div className="roguelike-reward-grid">
              {rewardOptions.map((perk) => {
                const selected = run.rewardChosenForFloor === run.floor && (run.perks || []).at(-1) === perk.id;
                return (
                  <button
                    type="button"
                    key={perk.id}
                    className={`roguelike-reward-card ${selected ? 'selected' : ''}`}
                    disabled={run.rewardChosenForFloor === run.floor}
                    onClick={() => handleChooseReward(perk.id)}
                  >
                    <strong>{perk.label}</strong>
                    <span>{perk.description}</span>
                  </button>
                );
              })}
            </div>

            {run.rewardChosenForFloor === run.floor && (
              <>
                <p className="hint-text" style={{ marginTop: '0.8rem' }}>
                  Siguiente encuentro: <b>{nextEncounter?.label || 'desconocido'}</b>. {nextEncounter?.description || ''}
                </p>
                <div className="game-controls">
                  <button type="button" className="primary-btn" onClick={handleContinue}>Seguir al piso {run.floor + 1}</button>
                  <button type="button" className="secondary-btn" onClick={handleRetire}>Retirarme aquí</button>
                </div>
              </>
            )}
          </div>
        )}

        {run.inRun && run.phase === 'completed' && (
          <div className="tournament-result roguelike-boss-victory" style={{ marginTop: '0.8rem' }}>
            <span className="section-label">OBJETIVO CUMPLIDO</span>
            <h3>El Rey Viejo ha caído.</h3>
            <p className="hero-scope-note">Diez pisos. Cinco puntos de vida. Ninguna necesidad de fingir que esto era una partida normal.</p>
            <div className="game-controls">
              <button type="button" className="primary-btn" onClick={handleContinueEndless}>Seguir en modo infinito → piso 11</button>
              <button type="button" className="secondary-btn" onClick={() => finishRun('completed')}>Cerrar el intento victorioso</button>
            </div>
          </div>
        )}

        {endResult?.type === 'over' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>Intento terminado — llegaste al piso {endResult.reached}</h3>
            <p className="hint-text">{endResult.newBest ? '¡Nueva marca!' : `Tu mejor marca sigue siendo el piso ${bestFloor}.`}</p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>Intentar de nuevo</button>
          </div>
        )}

        {endResult?.type === 'interrupted' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>Intento interrumpido en el piso {endResult.reached}</h3>
            <p className="hint-text">{endResult.newBest ? 'Cuenta como piso alcanzado, no superado. Nueva marca de llegada.' : `Tu mejor marca sigue siendo el piso ${bestFloor}.`}</p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>Empezar otro intento</button>
          </div>
        )}

        {endResult?.type === 'retired' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>Te retiraste en el piso {endResult.reached}</h3>
            <p className="hint-text">{endResult.newBest ? '¡Nueva marca!' : `Tu mejor marca sigue siendo el piso ${bestFloor}.`}</p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>Empezar otro intento</button>
          </div>
        )}

        {endResult?.type === 'completed' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>Intento completado.</h3>
            <p className="hint-text">La Torre ya consta en tu expediente. El modo infinito queda desbloqueado.</p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>Subir otra vez</button>
          </div>
        )}
      </div>
    </div>
  );
}
