import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHRONICLES_MAP,
  chroniclesObjective,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import { chroniclesResolveEnemyTurn } from '../chroniclesOfMatthiasTurns.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './ChroniclesOfMatthiasTactics.css';

const PARTY_ORDER = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);
const TILE_LABEL = Object.freeze({
  '#': 'Muro',
  '.': 'Suelo',
  P: 'Entrada',
  E: 'Enemigo',
  S: 'Sello',
  X: 'Salida',
});

function createTacticsState() {
  return {
    ...createChroniclesState(),
    round: 1,
    turnPhase: 'party',
    enemyPositions: {},
    enemyTurnEvents: [],
  };
}

function TacticsMap({ state }) {
  return (
    <div className="chronicles-tactics-map" role="img" aria-label="Mapa táctico de la cripta">
      {CHRONICLES_MAP.flatMap((row, y) => [...row].map((tile, x) => {
        const party = state.x === x && state.y === y;
        const className = [
          'chronicles-tactics-map__cell',
          tile === '#' ? 'is-wall' : 'is-floor',
          tile === 'X' ? 'is-exit' : '',
          tile === 'S' ? 'is-sigil' : '',
          party ? 'is-party' : '',
        ].filter(Boolean).join(' ');
        return (
          <span
            key={`${x}-${y}`}
            className={className}
            title={party ? 'Compañía' : TILE_LABEL[tile] || 'Cripta'}
            aria-hidden="true"
          >
            {party ? '◆' : tile === 'X' ? 'H' : tile === 'S' ? '✦' : ''}
          </span>
        );
      }))}
    </div>
  );
}

export default function ChroniclesOfMatthiasTactics({ onExit }) {
  useEscapeToClose(onExit);
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const stateRef = useRef(createTacticsState());
  const [state, setState] = useState(stateRef.current);
  const [selectedMemberId, setSelectedMemberId] = useState('matthias');
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let engine = null;
    const host = hostRef.current;
    if (!host) return undefined;

    void import('../chroniclesOfMatthiasIsometric.js')
      .then(({ createChroniclesIsometricGame }) => {
        if (cancelled) return;
        engine = createChroniclesIsometricGame(host, {
          onReady: (backend) => { if (!cancelled) setRendererName(backend); },
        });
        engineRef.current = engine;
        engine.renderState(stateRef.current, selectedMemberId);
      })
      .catch((error) => {
        console.error('Chronicles of Matthias Tactics renderer failed', error);
        if (!cancelled) {
          setRendererName('THREE.JS · ERROR');
          setRendererError('La cripta táctica se ha negado a materializarse.');
        }
      });

    return () => {
      cancelled = true;
      engine?.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.renderState(state, selectedMemberId);
  }, [selectedMemberId, state]);

  const selectedMember = state.party.find((member) => member.id === selectedMemberId) || state.party[0];
  const objective = chroniclesObjective(state);
  const activeParty = useMemo(
    () => PARTY_ORDER.map((id) => state.party.find((member) => member.id === id)).filter(Boolean),
    [state.party],
  );

  const commitState = (next) => {
    stateRef.current = next;
    setState(next);
  };

  const waitTurn = () => {
    if (state.phase === 'defeated' || state.phase === 'escaped') return;
    const next = chroniclesResolveEnemyTurn({
      ...stateRef.current,
      message: `${selectedMember?.name || 'La compañía'} mantiene posición. La cripta aprovecha la cortesía.`,
    });
    commitState(next);
  };

  const restart = () => {
    const next = createTacticsState();
    setSelectedMemberId('matthias');
    commitState(next);
  };

  return (
    <div className="chronicles-tactics" data-chronicles-tactics="true" data-phase={state.phase}>
      <header className="chronicles-tactics__head">
        <div>
          <span className="section-label">EXPERIMENTO TÁCTICO · THREE.JS · TURNO ALTERNADO</span>
          <h2>Chronicles of Matthias Tactics</h2>
          <p>La misma compañía, otra guerra: cripta isométrica, casillas visibles y criaturas que reciben su propio turno.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </header>

      <div className="chronicles-tactics__frame">
        <aside className="chronicles-tactics__mission" aria-label="Misión táctica">
          <span className="chronicles-tactics__kicker">CRIPTA 01</span>
          <strong>{objective}</strong>
          <TacticsMap state={state} />
          <small>La geometría es información. Las paredes, también cuando se empeñan en serlo.</small>
        </aside>

        <main className="chronicles-tactics__battlefield">
          <div className="chronicles-tactics__turn" aria-live="polite">
            <span>{state.phase === 'defeated' ? 'EXPEDICIÓN DERROTADA' : 'TURNO DEL JUGADOR'}</span>
            <b>RONDA {Math.max(1, Number(state.round || 1))}</b>
          </div>

          <div className="chronicles-tactics__viewport">
            <div ref={hostRef} className="chronicles-tactics__three" data-chronicles-tactics-renderer="three" />
            <div className="chronicles-tactics__cinema" aria-hidden="true" />
            <div className="chronicles-tactics__narrator" aria-live="polite">
              <span>CRÓNICA</span>
              <p>{state.message}</p>
            </div>
            {rendererError && <div className="chronicles-tactics__error" role="alert">{rendererError}</div>}
          </div>

          <div className="chronicles-tactics__actions" aria-label="Acciones tácticas">
            <button type="button" disabled title="Se activa en la siguiente iteración"><i aria-hidden="true">↑</i><span>Mover</span></button>
            <button type="button" disabled title="Se activa en la siguiente iteración"><i aria-hidden="true">⚔</i><span>Atacar</span></button>
            <button type="button" disabled title="Se activa en una iteración posterior"><i aria-hidden="true">✦</i><span>Habilidad</span></button>
            <button type="button" disabled title="Se activa en una iteración posterior"><i aria-hidden="true">⚗</i><span>Objeto</span></button>
            <button type="button" className="is-ready" onClick={waitTurn}><i aria-hidden="true">⌛</i><span>Esperar</span></button>
          </div>
        </main>

        <aside className="chronicles-tactics__party" aria-label="Compañía">
          <span className="chronicles-tactics__kicker">GRUPO 1–4</span>
          {activeParty.map((member, index) => {
            const ratio = Math.max(0, member.hp / member.maxHp);
            return (
              <button
                type="button"
                key={member.id}
                className={member.id === selectedMemberId ? 'is-selected' : ''}
                onClick={() => setSelectedMemberId(member.id)}
                aria-pressed={member.id === selectedMemberId}
              >
                <i aria-hidden="true">{member.glyph}</i>
                <span><b>{index + 1}. {member.name}</b><small>{member.role}</small><em><u style={{ width: `${ratio * 100}%` }} /></em></span>
                <strong>{member.hp}/{member.maxHp}</strong>
              </button>
            );
          })}
          <div className="chronicles-tactics__party-note">
            <span>ACTIVO</span>
            <b>{selectedMember?.name}</b>
            <small>{selectedMember?.attackName} · alcance {selectedMember?.reach}</small>
          </div>
        </aside>
      </div>

      <footer className="chronicles-tactics__footer">
        <span>Motor {rendererName}</span>
        <span>Referencia visual: viewport canónico de Chronicles of Matthias Tactics</span>
        <button type="button" onClick={restart}>Reiniciar incursión</button>
      </footer>
    </div>
  );
}
