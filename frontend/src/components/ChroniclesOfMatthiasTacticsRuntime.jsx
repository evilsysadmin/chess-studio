import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chroniclesObjective,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import {
  applyChroniclesProgressionToTacticsState,
  applyChroniclesTacticsProgression,
  beginChroniclesTacticsRun,
  ensureChroniclesTacticsRun,
  finishChroniclesTacticsRun,
  loadChroniclesProgression,
  saveChroniclesProgression,
  spendChroniclesAttributePoint,
  unlockChroniclesSkill,
} from '../chroniclesOfMatthiasProgression.js';
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
import { useEscapeToClose } from '../useEscapeToClose.js';
import ChroniclesTacticsPartyHud from './ChroniclesTacticsPartyHud.jsx';
import './ChroniclesOfMatthiasTactics.css';
import './ChroniclesOfMatthiasProgression.css';

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

function createActionState(progression) {
  return applyChroniclesProgressionToTacticsState({
    ...createChroniclesState(),
    round: 1,
    turnPhase: 'party',
    enemyPositions: {},
    enemyTurnEvents: [],
  }, progression);
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
  const [progression, setProgression] = useState(() => loadChroniclesProgression());
  const progressionRef = useRef(progression);
  const [state, setState] = useState(() => createActionState(progression));
  const stateRef = useRef(state);
  const selectedMemberRef = useRef('matthias');
  const lastMoveAtRef = useRef(0);
  const lastAttackAtRef = useRef(0);
  const [runId, setRunId] = useState(() => ensureChroniclesTacticsRun());
  const [selectedMemberId, setSelectedMemberId] = useState('matthias');
  const [sheetRequest, setSheetRequest] = useState(null);
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');

  const selectedProfile = chroniclesTacticsProfile(selectedMemberId);
  const selectedAbility = useMemo(
    () => chroniclesTacticsAbilityStatus(state, selectedMemberId),
    [selectedMemberId, state],
  );
  const objective = chroniclesObjective(state);
  const contextualAction = useMemo(() => chroniclesTacticsInteractions(state)[0] || null, [state]);
  const canAttack = useMemo(
    () => chroniclesTacticsTargets(state, selectedMemberId).length > 0,
    [selectedMemberId, state],
  );
  const canAct = state.phase !== 'defeated' && state.phase !== 'escaped';

  const commitState = useCallback((next, { actorMemberId = null, actionKind = 'action' } = {}) => {
    const previous = stateRef.current;
    if (!next || next === previous) return false;

    const progressResult = applyChroniclesTacticsProgression(progressionRef.current, previous, next, {
      actorMemberId,
      actionKind,
      runId,
    });
    if (progressResult.awards.length || progressResult.levelUps.length) {
      const saved = saveChroniclesProgression(progressResult.progression);
      progressionRef.current = saved;
      setProgression(saved);
    }

    stateRef.current = next;
    setState(next);
    if (next.phase === 'escaped' || next.phase === 'defeated') finishChroniclesTacticsRun(runId);
    return true;
  }, [runId]);

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
    if (commitState(next, { actorMemberId: memberId, actionKind: 'attack' })) lastAttackAtRef.current = now;
  }, [commitState]);

  const useClassAbility = useCallback(() => {
    const current = stateRef.current;
    if (current.phase === 'defeated' || current.phase === 'escaped') return;
    const memberId = selectedMemberRef.current;
    commitState(chroniclesTacticsAbility(current, memberId), { actorMemberId: memberId, actionKind: 'ability' });
  }, [commitState]);

  const useContextualAction = useCallback(() => {
    const current = stateRef.current;
    if (current.phase === 'defeated' || current.phase === 'escaped') return;
    const memberId = selectedMemberRef.current;
    commitState(chroniclesTacticsUse(current), { actorMemberId: memberId, actionKind: 'use' });
  }, [commitState]);

  const allocateAttribute = useCallback((memberId, attributeKey) => {
    const result = spendChroniclesAttributePoint(progressionRef.current, memberId, attributeKey);
    if (!result.spent) return;
    const saved = saveChroniclesProgression(result.progression);
    progressionRef.current = saved;
    setProgression(saved);
  }, []);

  const learnSkill = useCallback((memberId, skillId) => {
    const result = unlockChroniclesSkill(progressionRef.current, memberId, skillId);
    if (!result.unlocked) return;
    const saved = saveChroniclesProgression(result.progression);
    progressionRef.current = saved;
    setProgression(saved);
  }, []);

  const selectMember = useCallback((memberId) => {
    selectedMemberRef.current = memberId;
    setSelectedMemberId(memberId);
  }, []);

  const openMemberSheet = useCallback((memberId) => {
    selectMember(memberId);
    setSheetRequest({ memberId });
  }, [selectMember]);

  const restart = useCallback(() => {
    finishChroniclesTacticsRun(runId);
    const nextRunId = beginChroniclesTacticsRun();
    const next = createActionState(progressionRef.current);
    selectedMemberRef.current = 'matthias';
    lastMoveAtRef.current = 0;
    lastAttackAtRef.current = 0;
    setRunId(nextRunId);
    setSelectedMemberId('matthias');
    setSheetRequest(null);
    stateRef.current = next;
    setState(next);
  }, [runId]);

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
          onMemberClick: (memberId) => openMemberSheet(memberId),
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
  }, [attackEnemy, moveParty, openMemberSheet]);

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

        <ChroniclesTacticsPartyHud
          state={state}
          progression={progression}
          selectedMemberId={selectedMemberId}
          sheetRequest={sheetRequest}
          onSelectMember={selectMember}
          onAllocateAttribute={allocateAttribute}
          onLearnSkill={learnSkill}
        />
      </div>

      <footer className="chronicles-tactics__footer">
        <span>Motor {rendererName}</span>
        <span>{contextualAction ? `Espacio · ${contextualAction.label}` : 'Espacio · Usar'} · Shift · {selectedProfile.attackName} · E · {selectedProfile.abilityName}</span>
        <button type="button" onClick={restart}>Reiniciar incursión</button>
      </footer>
    </div>
  );
}
