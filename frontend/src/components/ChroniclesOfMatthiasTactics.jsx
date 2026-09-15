import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHRONICLES_MAP,
  chroniclesObjective,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import {
  chroniclesTacticsAttack,
  chroniclesTacticsFinishTurn,
  chroniclesTacticsLegalMoves,
  chroniclesTacticsMove,
  chroniclesTacticsTargets,
  chroniclesTacticsWait,
} from '../chroniclesOfMatthiasTactics.js';
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
  const selectedMemberRef = useRef('matthias');
  const actionModeRef = useRef(null);
  const [state, setState] = useState(stateRef.current);
  const [selectedMemberId, setSelectedMemberId] = useState('matthias');
  const [actionMode, setActionMode] = useState(null);
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');

  const selectedMember = state.party.find((member) => member.id === selectedMemberId) || state.party[0];
  const objective = chroniclesObjective(state);
  const activeParty = useMemo(
    () => PARTY_ORDER.map((id) => state.party.find((member) => member.id === id)).filter(Boolean),
    [state.party],
  );
  const legalMoves = useMemo(() => chroniclesTacticsLegalMoves(state), [state]);
  const legalTargets = useMemo(
    () => chroniclesTacticsTargets(state, selectedMemberId),
    [selectedMemberId, state],
  );
  const canAct = state.phase !== 'defeated' && state.phase !== 'escaped';

  const commitState = (next) => {
    stateRef.current = next;
    setState(next);
  };

  const clearActionMode = () => {
    actionModeRef.current = null;
    setActionMode(null);
  };

  const finishPlayerAction = (next) => {
    clearActionMode();
    commitState(chroniclesTacticsFinishTurn(next));
  };

  const moveParty = (destination) => {
    const current = stateRef.current;
    const next = chroniclesTacticsMove(current, destination);
    if (next === current) return;
    finishPlayerAction(next);
  };

  const attackEnemy = (enemyId) => {
    const current = stateRef.current;
    const next = chroniclesTacticsAttack(current, selectedMemberRef.current, enemyId);
    if (next === current) return;
    finishPlayerAction(next);
  };

  const setMode = (mode) => {
    const next = actionModeRef.current === mode ? null : mode;
    actionModeRef.current = next;
    setActionMode(next);
  };

  const selectMember = (memberId) => {
    selectedMemberRef.current = memberId;
    setSelectedMemberId(memberId);
  };

  const waitTurn = () => {
    if (!canAct) return;
    clearActionMode();
    commitState(chroniclesTacticsWait(stateRef.current, selectedMemberRef.current));
  };

  const restart = () => {
    const next = createTacticsState();
    selectedMemberRef.current = 'matthias';
    actionModeRef.current = null;
    setSelectedMemberId('matthias');
    setActionMode(null);
    commitState(next);
  };

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
          onCellClick: (cell) => {
            if (actionModeRef.current === 'move') moveParty(cell);
          },
          onEnemyClick: (enemyId) => {
            if (actionModeRef.current === 'attack') attackEnemy(enemyId);
          },
        });
        engineRef.current = engine;
        const current = stateRef.current;
        const mode = actionModeRef.current;
        engine.renderState(current, selectedMemberRef.current, {
          mode,
          legalMoves: mode === 'move' ? chroniclesTacticsLegalMoves(current) : [],
          legalTargets: mode === 'attack' ? chroniclesTacticsTargets(current, selectedMemberRef.current) : [],
        });
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
    selectedMemberRef.current = selectedMemberId;
  }, [selectedMemberId]);

  useEffect(() => {
    actionModeRef.current = actionMode;
    engineRef.current?.renderState(state, selectedMemberId, {
      mode: actionMode,
      legalMoves: actionMode === 'move' ? legalMoves : [],
      legalTargets: actionMode === 'attack' ? legalTargets : [],
    });
  }, [actionMode, legalMoves, legalTargets, selectedMemberId, state]);

  const turnLabel = state.phase === 'defeated'
    ? 'EXPEDICIÓN DERROTADA'
    : state.phase === 'escaped'
      ? 'EXTRACCIÓN COMPLETADA'
      : 'TURNO DEL JUGADOR';

  return (
    <div
      className="chronicles-tactics"
      data-chronicles-tactics="true"
      data-phase={state.phase}
      data-action-mode={actionMode || 'idle'}
    >
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
          <small>Una acción tuya, una respuesta de la cripta. La iniciativa es sencilla; sobrevivir, menos.</small>
        </aside>

        <main className="chronicles-tactics__battlefield">
          <div className="chronicles-tactics__turn" aria-live="polite">
            <span>{turnLabel}</span>
            <b>RONDA {Math.max(1, Number(state.round || 1))}</b>
          </div>

          <div className="chronicles-tactics__viewport">
            <div ref={hostRef} className="chronicles-tactics__three" data-chronicles-tactics-renderer="three" />
            <div className="chronicles-tactics__cinema" aria-hidden="true" />
            <div className="chronicles-tactics__narrator" aria-live="polite">
              <span>CRÓNICA</span>
              <p>{state.message}</p>
            </div>
            {actionMode && (
              <div className="chronicles-tactics__pick-hint" aria-live="polite">
                {actionMode === 'move' ? 'Elige una casilla iluminada' : `Elige el objetivo de ${selectedMember?.name || 'la compañía'}`}
              </div>
            )}
            {rendererError && <div className="chronicles-tactics__error" role="alert">{rendererError}</div>}
          </div>

          <div className="chronicles-tactics__actions" aria-label="Acciones tácticas">
            <button
              type="button"
              className={actionMode === 'move' ? 'is-ready' : ''}
              disabled={!canAct || legalMoves.length === 0}
              aria-pressed={actionMode === 'move'}
              onClick={() => setMode('move')}
            >
              <i aria-hidden="true">↑</i><span>Mover</span>
            </button>
            <button
              type="button"
              className={actionMode === 'attack' ? 'is-ready' : ''}
              disabled={!canAct || legalTargets.length === 0}
              aria-pressed={actionMode === 'attack'}
              onClick={() => setMode('attack')}
            >
              <i aria-hidden="true">⚔</i><span>Atacar</span>
            </button>
            <button type="button" disabled title="Se activa en una iteración posterior"><i aria-hidden="true">✦</i><span>Habilidad</span></button>
            <button type="button" disabled title="Se activa en una iteración posterior"><i aria-hidden="true">⚗</i><span>Objeto</span></button>
            <button type="button" className="is-ready" disabled={!canAct} onClick={waitTurn}><i aria-hidden="true">⌛</i><span>Esperar</span></button>

            {actionMode === 'move' && legalMoves.length > 0 && (
              <div className="chronicles-tactics__choices" role="group" aria-label="Destinos legales">
                <span>MOVER A</span>
                {legalMoves.map((move) => (
                  <button type="button" key={`${move.x}-${move.y}`} onClick={() => moveParty(move)}>
                    <i aria-hidden="true">{move.glyph}</i>
                    <b>{move.label}</b>
                  </button>
                ))}
              </div>
            )}

            {actionMode === 'attack' && legalTargets.length > 0 && (
              <div className="chronicles-tactics__choices" role="group" aria-label={`Objetivos de ${selectedMember?.name || 'la compañía'}`}>
                <span>OBJETIVO</span>
                {legalTargets.map((target) => (
                  <button type="button" key={target.enemyId} onClick={() => attackEnemy(target.enemyId)}>
                    <i aria-hidden="true">⚔</i>
                    <b>{target.name}</b>
                    <small>{target.hp}/{target.maxHp} HP · {target.distance} {target.distance === 1 ? 'casilla' : 'casillas'}</small>
                  </button>
                ))}
              </div>
            )}
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
                onClick={() => selectMember(member.id)}
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
            <small>{selectedMember?.hp > 0 ? `${selectedMember?.attackName} · alcance ${selectedMember?.reach}` : 'Fuera de combate'}</small>
          </div>
        </aside>
      </div>

      <footer className="chronicles-tactics__footer">
        <span>Motor {rendererName}</span>
        <span>Una acción del jugador → turno de criaturas → nueva ronda</span>
        <button type="button" onClick={restart}>Reiniciar incursión</button>
      </footer>
    </div>
  );
}
