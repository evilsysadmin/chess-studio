import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHRONICLES_DIRECTIONS,
  chroniclesObjective,
  chroniclesReduce,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './ChroniclesOfMatthias.css';

const KEY_ACTIONS = Object.freeze({
  ArrowUp: 'forward',
  w: 'forward',
  W: 'forward',
  ArrowDown: 'backward',
  s: 'backward',
  S: 'backward',
  ArrowLeft: 'turn-left',
  a: 'turn-left',
  A: 'turn-left',
  ArrowRight: 'turn-right',
  d: 'turn-right',
  D: 'turn-right',
  ' ': 'attack',
});

export default function ChroniclesOfMatthias({ onExit }) {
  useEscapeToClose(onExit);
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const stateRef = useRef(createChroniclesState());
  const [state, setState] = useState(stateRef.current);
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');

  const dispatch = useCallback((action) => {
    setState((current) => {
      const next = chroniclesReduce(current, action);
      stateRef.current = next;
      return next;
    });
  }, []);

  const restart = useCallback(() => {
    const next = createChroniclesState();
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let engine = null;
    const host = hostRef.current;
    if (!host) return undefined;

    void import('../chroniclesOfMatthiasThree.js')
      .then(({ createChroniclesOfMatthiasGame }) => {
        if (cancelled) return;
        engine = createChroniclesOfMatthiasGame(host, {
          onReady: (backend) => {
            if (!cancelled) setRendererName(backend);
          },
        });
        engineRef.current = engine;
        engine.renderState(stateRef.current);
      })
      .catch((error) => {
        console.error('Chronicles of Matthias Three.js boot failed', error);
        if (!cancelled) {
          setRendererName('THREE.JS · ERROR');
          setRendererError('La cripta se ha negado a materializarse. El motor 3D no ha arrancado.');
        }
      });

    return () => {
      cancelled = true;
      engine?.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.renderState(state);
  }, [state]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const action = KEY_ACTIONS[event.key];
      if (!action) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  const direction = CHRONICLES_DIRECTIONS[state.direction];
  const objective = chroniclesObjective(state);

  return (
    <div className="chronicles" data-chronicles="true" data-chronicles-phase={state.phase}>
      <header className="chronicles-head">
        <div>
          <span className="section-label">EXPERIMENTO RPG · THREE.JS · BOOK I</span>
          <h2>Chronicles of Matthias</h2>
          <p>Dungeon crawler en primera persona. El grupo avanza por casillas; las piezas siguen siendo piezas y la arquitectura tiene memoria de tablero.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </header>

      <div className="chronicles-shell">
        <aside className="chronicles-party" aria-label="Grupo de Matthias">
          <span className="chronicles-panel-kicker">GRUPO</span>
          {state.party.map((member) => (
            <div key={member.id} className={`chronicles-party-member ${member.id === 'matthias' ? 'is-leader' : ''}`}>
              <span className="chronicles-party-glyph" aria-hidden="true">{member.glyph}</span>
              <span><strong>{member.name}</strong><small>{member.role}</small></span>
              <b>{member.hp}/{member.maxHp}</b>
            </div>
          ))}
        </aside>

        <main className="chronicles-stage-wrap">
          <div className="chronicles-statusbar" aria-live="polite">
            <span>CRIPTA <b>01</b></span>
            <span>RUMBO <b>{direction.label}</b></span>
            <span>TURNOS <b>{state.turns}</b></span>
            <span>OBJETIVO <b>{objective}</b></span>
          </div>

          <div className="chronicles-stage">
            <div ref={hostRef} className="chronicles-three" data-chronicles-renderer="three" aria-label="Mazmorra 3D en primera persona de Chronicles of Matthias" />
            <div className="chronicles-vignette" aria-hidden="true" />
            <div className="chronicles-crosshair" aria-hidden="true">·</div>

            {rendererError && <div className="chronicles-renderer-error" role="alert">{rendererError}</div>}

            {state.phase === 'escaped' && (
              <div className="chronicles-finish" role="status">
                <span>BOOK I · VERTICAL SLICE</span>
                <strong>La Cripta de las Ocho Casillas</strong>
                <p>Has salido con el grupo razonablemente entero. Inaceptable nivel de competencia para una primera expedición.</p>
                <button type="button" className="primary-btn" onClick={restart}>Entrar otra vez</button>
              </div>
            )}
          </div>

          <div className="chronicles-narration" aria-live="polite">
            <span className="chronicles-avatar" aria-hidden="true">♟</span>
            <p><strong>Matthias</strong>{state.message}</p>
          </div>

          <div className="chronicles-touch" aria-label="Controles de la mazmorra">
            <button type="button" onClick={() => dispatch('turn-left')} aria-label="Girar a la izquierda">↶<small>GIRAR</small></button>
            <button type="button" onClick={() => dispatch('forward')} aria-label="Avanzar">↑<small>AVANZAR</small></button>
            <button type="button" className="is-attack" onClick={() => dispatch('attack')} aria-label="Atacar">⚔<small>ATACAR</small></button>
            <button type="button" onClick={() => dispatch('backward')} aria-label="Retroceder">↓<small>ATRÁS</small></button>
            <button type="button" onClick={() => dispatch('turn-right')} aria-label="Girar a la derecha">↷<small>GIRAR</small></button>
          </div>

          <div className="chronicles-keyboard-help">
            <span><kbd>W</kbd>/<kbd>↑</kbd> avanzar</span>
            <span><kbd>S</kbd>/<kbd>↓</kbd> retroceder</span>
            <span><kbd>A</kbd><kbd>D</kbd> girar</span>
            <span><kbd>ESPACIO</kbd> atacar</span>
          </div>
        </main>
      </div>

      <p className="chronicles-tech-note">Motor {rendererName}. Primer vertical slice deliberadamente pequeño: exploración por cuadrícula, grupo persistente dentro de la expedición, combate frontal, sello y salida. Sin rating, sin economía y sin tocar el ajedrez estándar.</p>
    </div>
  );
}
