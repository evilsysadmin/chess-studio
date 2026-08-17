import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import CombatScreen from './CombatScreen.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { ROGUELIKE_MODIFIERS, applyModifierToFen, modifierForFloor } from '../roguelikeModifiers.js';
import { loadRun, startNewRun, advanceFloor, endRun, loadBestFloor, difficultyForFloor } from '../roguelikeRun.js';

const HUMAN_COLOR = 'w'; // fijo en roguelike — así siempre se sabe de qué lado va el modificador de la CPU
const CPU_COLOR = 'b';

export default function RoguelikeScreen({ onExit, onError, onHistory, onViewBattle }) {
  useEscapeToClose(onExit);
  const [run, setRun] = useState(() => loadRun());
  const [bestFloor, setBestFloor] = useState(() => loadBestFloor());
  const [floorResult, setFloorResult] = useState(null); // 'win' | { type, reached } | null — entre batallas

  // El modificador se calcula UNA vez por piso, no en cada render — si no,
  // cada vez que React vuelva a renderizar cambiaría el rival a mitad de camino.
  const modifier = useMemo(() => (run.inRun ? modifierForFloor(run.floor) : null), [run.inRun, run.floor]);
  const initialFen = useMemo(() => {
    if (!modifier) return null;
    return applyModifierToFen(new Chess().fen(), modifier.id, CPU_COLOR);
  }, [modifier]);

  function handleStartRun() {
    setRun(startNewRun());
    setFloorResult(null);
  }

  function handleBattleResult(outcome) {
    if (outcome === 'win') {
      setFloorResult('win');
    } else {
      // perdiste o tablas -- la corrida termina acá, cuenta el piso en el que estabas
      const reached = endRun(run);
      setBestFloor(loadBestFloor());
      setRun(loadRun());
      setFloorResult({ type: 'over', reached });
    }
  }

  function handleContinue() {
    const next = advanceFloor(run);
    setRun(next);
    setFloorResult(null);
  }

  function handleRetire() {
    const reached = endRun(run);
    setBestFloor(loadBestFloor());
    setRun(loadRun());
    setFloorResult({ type: 'retired', reached });
  }

  // Batalla en curso: le pasamos el control entero a CombatScreen, con el
  // material del piso ya aplicado y la dificultad calibrada por piso (no
  // por rating, como en Combate normal).
  if (run.inRun && !floorResult) {
    return (
      <CombatScreen
        key={run.floor /* fuerza remount al cambiar de piso, para que no arrastre estado de la batalla anterior */}
        onExit={onExit}
        onError={onError}
        onHistory={onHistory}
        onViewBattle={onViewBattle}
        initialFen={initialFen}
        forcedHumanColor={HUMAN_COLOR}
        difficultyOverride={difficultyForFloor(run.floor)}
        onBattleResult={handleBattleResult}
      />
    );
  }

  return (
    <div className="menu">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section">
        <span className="section-label">Combate</span>
        <h2>Roguelike</h2>
        <p className="hero-scope-note">
          Una escalera de rivales cada vez más raros — cada piso le suma material extra a la CPU
          (no solo sube el nivel del motor). Pierdes o te retiras, la corrida termina; tu mejor
          piso alcanzado queda guardado para siempre.
        </p>

        {bestFloor > 0 && (
          <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
            Mejor piso alcanzado: <b>{bestFloor}</b>
          </p>
        )}

        {!run.inRun && !floorResult && (
          <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>
            Comenzar corrida
          </button>
        )}

        {floorResult === 'win' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>¡Piso {run.floor} superado!</h3>
            <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
              El próximo piso: <b>{modifierForFloor(run.floor + 1).label}</b> — o te retiras acá y
              guardas este piso como tu marca de la corrida.
            </p>
            <div className="game-controls">
              <button type="button" className="primary-btn" onClick={handleContinue}>
                Seguir al piso {run.floor + 1}
              </button>
              <button type="button" className="secondary-btn" onClick={handleRetire}>
                Retirarme acá
              </button>
            </div>
          </div>
        )}

        {floorResult?.type === 'over' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>Corrida terminada — llegaste al piso {floorResult.reached}</h3>
            <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
              {floorResult.reached > bestFloor
                ? '¡Nueva marca!'
                : `Tu mejor marca sigue siendo el piso ${bestFloor}.`}
            </p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>
              Intentar de nuevo
            </button>
          </div>
        )}

        {floorResult?.type === 'retired' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>Te retiraste en el piso {floorResult.reached}</h3>
            <p className="hint-text" style={{ marginBottom: '0.8rem' }}>
              {floorResult.reached > bestFloor
                ? '¡Nueva marca!'
                : `Tu mejor marca sigue siendo el piso ${bestFloor}.`}
            </p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>
              Empezar otra corrida
            </button>
          </div>
        )}

        {!run.inRun && !floorResult && (
          <div className="menu-section" style={{ marginTop: '1.2rem' }}>
            <h3 style={{ fontSize: '0.95rem' }}>Modificadores posibles</h3>
            <ul className="hint-text" style={{ paddingLeft: '1.2rem' }}>
              {ROGUELIKE_MODIFIERS.filter((m) => m.id !== 'none').map((m) => (
                <li key={m.id}>
                  <b>{m.label}</b> — {m.description}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
