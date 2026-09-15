import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chroniclesObjective,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import {
  chroniclesTacticsAttack,
  chroniclesTacticsLegalMoves,
  chroniclesTacticsMove,
  chroniclesTacticsTargets,
} from '../chroniclesOfMatthiasTactics.js';
import { chroniclesResolveEnemyTurn } from '../chroniclesOfMatthiasTurns.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './ChroniclesOfMatthiasTactics.css';

const PARTY_ORDER = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);
const MOVEMENT = Object.freeze({
  ArrowUp: Object.freeze({ dx: 0, dy: -1 }),
  w: Object.freeze({ dx: 0, dy: -1 }),
  W: Object.freeze({ dx: 0, dy: -1 }),
  ArrowDown: Object.freeze({ dx: 0, dy: 1 }),
  s: Object.freeze({ dx: 0, dy: 1 }),
  S: Object.freeze({ dx: 0, dy: 1 }),
  ArrowLeft: Object.freeze({ dx: -1, dy: 0 }),
  a: Object.freeze({ dx: -1, dy: 0 }),
  A: Object.freeze({ dx: -1, dy: 0 }),
  ArrowRight: Object.freeze({ dx: 1, dy: 0 }),
  d: Object.freeze({ dx: 1, dy: 0 }),
  D: Object.freeze({ dx: 1, dy: 0 }),
});

function createActionState() {
  return {
    ...createChroniclesState(),
    round: 1,
    turnPhase: 'party',
    enemyPositions: {},
    enemyTurnEvents: [],
  };
}

function enemyPulseMessage(previousMessage, next) {
  const events = Array.isArray(next.enemyTurnEvents) ? next.enemyTurnEvents : [];
  const attacks = events.filter((event) => event.type === 'attack');
  const moves = events.filter((event) => event.type === 'move');
  if (next.phase === 'defeated') return next.message;
  if (attacks.length === 1) return 'La cripta contraataca. Un golpe alcanza a la formación.';
  if (attacks.length > 1) return `La cripta contraataca. ${attacks.length} golpes sacuden a la compañía.`;
  if (moves.length) return 'Algo se mueve entre la piedra y las antorchas. No parece amistoso.';
  return previousMessage;
}

export default function ChroniclesOfMatthiasTactics({ onExit }) {
  useEscapeToClose(onExit);
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const stateRef = useRef(createActionState());
  const selectedMemberRef = useRef('matthias');
  const lastMoveAtRef = useRef(0);
  const lastAttackAtRef = useRef(0);
  const [state, setState] = useState(stateRef.current);
  const [selectedMemberId, setSelectedMemberId] = useState('matthias');
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');

  const selectedMember = state.party.find((member) => member.id === selectedMemberId) || state.party[0];
  const objective = chroniclesObjective(state);
  const activeParty = useMemo(
    () => PARTY_ORDER.map((id) => state.party.find((member) => member.id === id)).filter(Boolean),
    [state.party],
  );
  const canAct = state.phase !== 'defeated' && state.phase !== 'escaped';

  const commitState = useCallback((next) => {
    if (!next || next === stateRef.current) return false;
    stateRef.current = next;
    setState(next);
    return true;
  }, []);

  const moveParty = useCallback((dx, dy) => {
    const now = performance.now();
    if (now - lastMoveAtRef.current < 120) return;
    const current = stateRef.current;
    if (current.phase === 'defeated' || current.phase === 'escaped') return;
    const legal = chroniclesTacticsLegalMoves(current).find((move) => (
      move.x === current.x + dx && move.y === current.y + dy
    ));
    if (!legal) return;
    const next = chroniclesTacticsMove(current, legal);
    if (commitState(next)) lastMoveAtRef.current = now;
  }, [commitState]);

  const attackEnemy = useCallback((enemyId = null) => {
    const now = performance.now();
    if (now - lastAttackAtRef.current < 260) return;
    const current = stateRef.current;
    if (current.phase === 'defeated' || current.phase === 'escaped') return;
    const memberId = selectedMemberRef.current;
    const targets = chroniclesTacticsTargets(current, memberId);
    const target = enemyId
      ? targets.find((candidate) => candidate.enemyId === enemyId)
      : targets[0];
    if (!target) return;
    const next = chroniclesTacticsAttack(current, memberId, target.enemyId);
    if (commitState(next)) lastAttackAtRef.current = now;
  }, [commitState]);

  const selectMember = useCallback((memberId) => {
    selectedMemberRef.current = memberId;
    setSelectedMemberId(memberId);
  }, []);

  const restart = useCallback(() => {
    const next = createActionState();
    selectedMemberRef.current = 'matthias';
    lastMoveAtRef.current = 0;
    lastAttackAtRef.current = 0;
    setSelectedMemberId('matthias');
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    selectedMemberRef.current = selectedMemberId;
  }, [selectedMemberId]);

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
            const current = stateRef.current;
            moveParty(cell.x - current.x, cell.y - current.y);
          },
          onEnemyClick: (enemyId) => attackEnemy(enemyId),
        });
        engineRef.current = engine;
        engine.renderState(stateRef.current, selectedMemberRef.current, null);
      })
      .catch((error) => {
        console.error('Chronicles of Matthias Tactics renderer failed', error);
        if (!cancelled) {
          setRendererName('THREE.JS · ERROR');
          setRendererError('La cripta isométrica se ha negado a materializarse.');
        }
      });

    return () => {
      cancelled = true;
      engine?.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [attackEnemy, moveParty]);

  useEffect(() => {
    engineRef.current?.renderState(state, selectedMemberId, null);
  }, [selectedMemberId, state]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (/^[1-4]$/.test(event.key)) {
        const member = stateRef.current.party[Number(event.key) - 1];
        if (member) {
          event.preventDefault();
          selectMember(member.id);
        }
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        attackEnemy();
        return;
      }
      const vector = MOVEMENT[event.key];
      if (!vector) return;
      event.preventDefault();
      moveParty(vector.dx, vector.dy);
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [attackEnemy, moveParty, selectMember]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const current = stateRef.current;
      if (current.phase === 'defeated' || current.phase === 'escaped') return;
      const resolved = chroniclesResolveEnemyTurn(current);
      if (resolved === current) return;
      commitState({
        ...resolved,
        message: enemyPulseMessage(current.message, resolved),
      });
    }, 1050);
    return () => window.clearInterval(timer);
  }, [commitState]);

  return (
    <div
      className="chronicles-tactics"
      data-chronicles-tactics="true"
      data-camera="isometric-behind-party"
      data-combat="realtime"
      data-phase={state.phase}
    >
      <header className="chronicles-tactics__head">
        <div>
          <span className="section-label">EXPERIMENTO RPG · THREE.JS · ISOMÉTRICO</span>
          <h2>Chronicles of Matthias Tactics</h2>
          <p>Action RPG isométrico: ves a la compañía desde detrás, te mueves en tiempo real y la cripta no espera educadamente su turno.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </header>

      <div className="chronicles-tactics__frame">
        <aside className="chronicles-tactics__mission" aria-label="Misión">
          <span className="chronicles-tactics__kicker">CRIPTA 01</span>
          <strong>{objective}</strong>
          <small>WASD/flechas mueve la formación · 1–4 cambia de héroe · espacio ataca.</small>
        </aside>

        <main className="chronicles-tactics__battlefield">
          <div className="chronicles-tactics__viewport">
            <div ref={hostRef} className="chronicles-tactics__three" data-chronicles-tactics-renderer="three" />
            <div className="chronicles-tactics__cinema" aria-hidden="true" />
            <div className="chronicles-tactics__narrator" aria-live="polite">
              <span>CRÓNICA</span>
              <p>{state.message}</p>
            </div>
            {rendererError && <div className="chronicles-tactics__error" role="alert">{rendererError}</div>}
          </div>

          <div className="chronicles-tactics__actions" aria-label="Controles de acción">
            <button type="button" className="is-ready" disabled={!canAct} aria-label="Mover al oeste" onClick={() => moveParty(-1, 0)}><i aria-hidden="true">←</i><span>A</span></button>
            <button type="button" className="is-ready" disabled={!canAct} aria-label="Mover al norte" onClick={() => moveParty(0, -1)}><i aria-hidden="true">↑</i><span>W</span></button>
            <button type="button" className="is-ready" disabled={!canAct} aria-label="Mover al sur" onClick={() => moveParty(0, 1)}><i aria-hidden="true">↓</i><span>S</span></button>
            <button type="button" className="is-ready" disabled={!canAct} aria-label="Mover al este" onClick={() => moveParty(1, 0)}><i aria-hidden="true">→</i><span>D</span></button>
            <button type="button" className="is-ready" disabled={!canAct} aria-label="Atacar" onClick={() => attackEnemy()}><i aria-hidden="true">⚔</i><span>ESPACIO</span></button>
          </div>
        </main>

        <aside className="chronicles-tactics__party" aria-label="Compañía">
          <span className="chronicles-tactics__kicker">GRUPO · 1–4</span>
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
        <span>Action RPG isométrico · enemigos activos · sin turno de jugador</span>
        <button type="button" onClick={restart}>Reiniciar incursión</button>
      </footer>
    </div>
  );
}
