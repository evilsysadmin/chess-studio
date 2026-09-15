import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chroniclesObjective,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import {
  chroniclesTacticsAbility,
  chroniclesTacticsAbilityStatus,
  chroniclesTacticsAttack,
  chroniclesTacticsInteractions,
  chroniclesTacticsLegalMoves,
  chroniclesTacticsMove,
  chroniclesTacticsProfile,
  chroniclesTacticsTargets,
  chroniclesTacticsUse,
} from '../chroniclesOfMatthiasTactics.js';
import { chroniclesResolveEnemyTurn } from '../chroniclesOfMatthiasTurns.js';
import {
  loadChroniclesTacticsProgress,
  persistChroniclesXpAwards,
} from '../chroniclesTacticsProgress.js';
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
    xpAwards: [],
    classAbilityCharges: {
      matthias: 1,
      rook: 1,
      bishop: 1,
      knight: 1,
    },
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
  const [progress, setProgress] = useState(() => loadChroniclesTacticsProgress());
  const [selectedMemberId, setSelectedMemberId] = useState('matthias');
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');

  const selectedMember = state.party.find((member) => member.id === selectedMemberId) || state.party[0];
  const selectedProfile = chroniclesTacticsProfile(selectedMemberId);
  const selectedAbility = useMemo(
    () => chroniclesTacticsAbilityStatus(state, selectedMemberId),
    [selectedMemberId, state],
  );
  const objective = chroniclesObjective(state);
  const activeParty = useMemo(
    () => PARTY_ORDER.map((id) => state.party.find((member) => member.id === id)).filter(Boolean),
    [state.party],
  );
  const contextualAction = useMemo(() => chroniclesTacticsInteractions(state)[0] || null, [state]);
  const canAttack = useMemo(
    () => chroniclesTacticsTargets(state, selectedMemberId).length > 0,
    [selectedMemberId, state],
  );
  const canAct = state.phase !== 'defeated' && state.phase !== 'escaped';

  const commitState = useCallback((next) => {
    if (!next || next === stateRef.current) return false;
    const xpResult = persistChroniclesXpAwards(next.xpAwards);
    if (xpResult.applied.length > 0) setProgress(xpResult.progress);
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

  const useClassAbility = useCallback(() => {
    const current = stateRef.current;
    if (current.phase === 'defeated' || current.phase === 'escaped') return;
    commitState(chroniclesTacticsAbility(current, selectedMemberRef.current));
  }, [commitState]);

  const useContextualAction = useCallback(() => {
    const current = stateRef.current;
    if (current.phase === 'defeated' || current.phase === 'escaped') return;
    commitState(chroniclesTacticsUse(current, null, selectedMemberRef.current));
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
        if (event.repeat) return;
        event.preventDefault();
        useContextualAction();
        return;
      }
      if (event.key === 'Shift') {
        if (event.repeat) return;
        event.preventDefault();
        attackEnemy();
        return;
      }
      if (event.key === 'e' || event.key === 'E') {
        if (event.repeat) return;
        event.preventDefault();
        useClassAbility();
        return;
      }
      const vector = MOVEMENT[event.key];
      if (!vector) return;
      event.preventDefault();
      moveParty(vector.dx, vector.dy);
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [attackEnemy, moveParty, selectMember, useClassAbility, useContextualAction]);

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
          <p>Action RPG isométrico: cuatro clases, cuatro geometrías de combate y una cripta con una opinión pésima de todas ellas.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </header>

      <div className="chronicles-tactics__frame">
        <aside className="chronicles-tactics__mission" aria-label="Misión">
          <span className="chronicles-tactics__kicker">CRIPTA 01</span>
          <strong>{objective}</strong>
          <small>WASD/flechas mueve · 1–4 cambia de héroe · espacio usa · Shift ataca · E habilidad.</small>
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
            <button
              type="button"
              className={contextualAction ? 'is-ready' : ''}
              disabled={!canAct || !contextualAction}
              aria-label="Usar"
              title={contextualAction?.label || 'No hay nada que usar aquí'}
              onClick={useContextualAction}
            ><i aria-hidden="true">◎</i><span>ESPACIO · USAR</span></button>
            <button type="button" className={canAttack ? 'is-ready' : ''} disabled={!canAct || !canAttack} aria-label="Atacar" onClick={() => attackEnemy()}><i aria-hidden="true">⚔</i><span>SHIFT · ATAQUE</span></button>
            <button
              type="button"
              className={selectedAbility.ready ? 'is-ready' : ''}
              disabled={!canAct || !selectedAbility.ready}
              aria-label="Habilidad de clase"
              title={selectedAbility.ready ? selectedProfile.abilityName : selectedAbility.reason}
              onClick={useClassAbility}
            ><i aria-hidden="true">✦</i><span>E · HABILIDAD</span></button>
          </div>
        </main>

        <aside className="chronicles-tactics__party" aria-label="Compañía">
          <span className="chronicles-tactics__kicker">GRUPO · 1–4</span>
          {activeParty.map((member, index) => {
            const ratio = Math.max(0, member.hp / member.maxHp);
            const profile = chroniclesTacticsProfile(member.id);
            const heroXp = progress.heroes?.[member.id]?.xp || 0;
            return (
              <button
                type="button"
                key={member.id}
                className={member.id === selectedMemberId ? 'is-selected' : ''}
                onClick={() => selectMember(member.id)}
                aria-pressed={member.id === selectedMemberId}
              >
                <i aria-hidden="true">{member.glyph}</i>
                <span><b>{index + 1}. {member.name}</b><small>{profile.className} · XP {heroXp}</small><em><u style={{ width: `${ratio * 100}%` }} /></em></span>
                <strong>{member.hp}/{member.maxHp}</strong>
              </button>
            );
          })}
          <div className="chronicles-tactics__party-note">
            <span>ACTIVO · {selectedProfile.className.toUpperCase()}</span>
            <b>{selectedMember?.name}</b>
            <small>{selectedMember?.hp > 0 ? `${selectedProfile.weaponName} · ${selectedProfile.attackName} · ${selectedProfile.kindLabel} · alcance ${selectedProfile.reach}` : 'Fuera de combate'}</small>
            <small>Habilidad: {selectedProfile.abilityName} · {selectedAbility.charges > 0 ? '1 carga' : 'agotada'}</small>
          </div>
        </aside>
      </div>

      <footer className="chronicles-tactics__footer">
        <span>Motor {rendererName}</span>
        <span>{contextualAction ? `Espacio · ${contextualAction.label}` : 'Espacio · Usar'} · Shift · {selectedProfile.attackName} · E · {selectedProfile.abilityName}</span>
        <button type="button" onClick={restart}>Reiniciar incursión</button>
      </footer>
    </div>
  );
}
