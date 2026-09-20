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
import {
  chroniclesTacticsCombatActive,
  chroniclesTacticsResolvePlayerAction,
} from '../chroniclesTacticsTurnMode.js';
import {
  chroniclesForecastBadge,
  chroniclesForecastDescription,
  chroniclesForecastMoves,
} from '../chronicles/chroniclesActionForecast.js';
import { chroniclesProjectSceneModel } from '../chronicles/chroniclesSceneModel.js';
import { chroniclesTacticsLocationLabel } from '../chronicles/chroniclesTacticsPresentation.js';
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

function chroniclesBattlefieldInteraction(state, memberId) {
  if (!state || state.turnPhase === 'enemy' || state.phase === 'defeated' || state.phase === 'escaped') return null;
  return {
    mode: 'hybrid',
    legalMoves: chroniclesTacticsLegalMoves(state),
    legalTargets: chroniclesTacticsTargets(state, memberId),
  };
}

function createActionState(progression) {
  return applyChroniclesProgressionToTacticsState({
    ...createChroniclesState(),
    round: 1,
    turnPhase: 'party',
    enemyPositions: {},
    enemyTurnEvents: [],
  }, progression);
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
  const locationLabel = chroniclesTacticsLocationLabel(state);
  const contextualAction = useMemo(() => chroniclesTacticsInteractions(state)[0] || null, [state]);
  const canAttack = useMemo(
    () => chroniclesTacticsTargets(state, selectedMemberId).length > 0,
    [selectedMemberId, state],
  );
  const inCombat = useMemo(() => chroniclesTacticsCombatActive(state), [state]);
  const canAct = state.turnPhase !== 'enemy' && state.phase !== 'defeated' && state.phase !== 'escaped';
  const battlefieldInteraction = useMemo(
    () => chroniclesBattlefieldInteraction(state, selectedMemberId),
    [selectedMemberId, state],
  );
  const sceneModel = useMemo(
    () => chroniclesProjectSceneModel(state, {
      selectedMemberId,
      interaction: battlefieldInteraction,
    }),
    [battlefieldInteraction, selectedMemberId, state],
  );
  const forecastView = useMemo(() => {
    if (!canAct) return {};
    return Object.fromEntries(
      Object.entries(chroniclesForecastMoves(state)).map(([key, forecast]) => [key, {
        level: forecast.level,
        badge: chroniclesForecastBadge(forecast),
        text: chroniclesForecastDescription(state, forecast),
      }]),
    );
  }, [canAct, state]);
  const forecastProps = (key) => ({
    'data-forecast': forecastView[key]?.level,
    'aria-describedby': forecastView[key]?.text ? `chronicles-forecast-${key}` : undefined,
    title: forecastView[key]?.text || undefined,
  });
  const forecastBadge = (key) => (forecastView[key]?.badge
    ? <b className="chronicles-tactics__forecast" aria-hidden="true">{forecastView[key].badge}</b>
    : null);

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
    if (current.phase === 'defeated' || current.phase === 'escaped' || current.turnPhase === 'enemy') return;
    const legal = chroniclesTacticsLegalMoves(current).find((move) => (
      move.x === current.x + dx && move.y === current.y + dy
    ));
    if (!legal) return;
    const next = chroniclesTacticsMove(current, legal);
    const resolved = chroniclesTacticsResolvePlayerAction(current, next);
    if (commitState(resolved)) lastMoveAtRef.current = now;
  }, [commitState]);

  const attackEnemy = useCallback((enemyId = null) => {
    const now = performance.now();
    if (now - lastAttackAtRef.current < 260) return;
    const current = stateRef.current;
    if (current.phase === 'defeated' || current.phase === 'escaped' || current.turnPhase === 'enemy') return;
    const memberId = selectedMemberRef.current;
    const targets = chroniclesTacticsTargets(current, memberId);
    const target = enemyId
      ? targets.find((candidate) => candidate.enemyId === enemyId)
      : targets[0];
    if (!target) return;
    const next = chroniclesTacticsAttack(current, memberId, target.enemyId);
    const resolved = chroniclesTacticsResolvePlayerAction(current, next, { forceCombat: true });
    if (commitState(resolved, { actorMemberId: memberId, actionKind: 'attack' })) lastAttackAtRef.current = now;
  }, [commitState]);

  const useClassAbility = useCallback(() => {
    const current = stateRef.current;
    if (current.phase === 'defeated' || current.phase === 'escaped' || current.turnPhase === 'enemy') return;
    const memberId = selectedMemberRef.current;
    const profile = chroniclesTacticsProfile(memberId);
    const next = chroniclesTacticsAbility(current, memberId);
    const resolved = chroniclesTacticsResolvePlayerAction(current, next, {
      forceCombat: profile.abilityKind !== 'heal',
    });
    commitState(resolved, { actorMemberId: memberId, actionKind: 'ability' });
  }, [commitState]);

  const useContextualAction = useCallback(() => {
    const current = stateRef.current;
    if (current.phase === 'defeated' || current.phase === 'escaped' || current.turnPhase === 'enemy') return;
    const memberId = selectedMemberRef.current;
    const next = chroniclesTacticsUse(current);
    const resolved = chroniclesTacticsResolvePlayerAction(current, next);
    commitState(resolved, { actorMemberId: memberId, actionKind: 'use' });
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
      .then(({ createChroniclesIsometricRenderer }) => {
        if (cancelled) return;
        const initialSceneModel = chroniclesProjectSceneModel(stateRef.current, {
          selectedMemberId: selectedMemberRef.current,
          interaction: chroniclesBattlefieldInteraction(stateRef.current, selectedMemberRef.current),
        });
        engine = createChroniclesIsometricRenderer(host, {
          initialSceneModel,
          onReady: (backend) => { if (!cancelled) setRendererName(backend); },
          onCellClick: (cell) => {
            const current = stateRef.current;
            moveParty(cell.x - current.x, cell.y - current.y);
          },
          onEnemyClick: (enemyId) => attackEnemy(enemyId),
          onMemberClick: (memberId) => openMemberSheet(memberId),
        });
        engineRef.current = engine;
        engine.renderSceneModel(initialSceneModel);
      })
      .catch((error) => {
        console.error('Chronicles of Matthias Tactics renderer failed', error);
        if (!cancelled) {
          setRendererName('THREE.JS · ERROR');
          setRendererError('El escenario isométrico se ha negado a materializarse.');
        }
      });

    return () => {
      cancelled = true;
      engine?.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [attackEnemy, moveParty, openMemberSheet, state.mapId]);

  useEffect(() => {
    engineRef.current?.renderSceneModel(sceneModel);
  }, [sceneModel]);

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

  return (
    <div
      className="chronicles-tactics"
      data-chronicles-tactics="true"
      data-camera="isometric-behind-party"
      data-combat="turn-based"
      data-engagement={inCombat ? 'combat' : 'exploration'}
      data-map={state.mapId}
      data-phase={state.phase}
      data-turn-phase={state.turnPhase || 'party'}
    >
      <header className="chronicles-tactics__head">
        <div>
          <span className="section-label">EXPERIMENTO RPG · THREE.JS · ISOMÉTRICO</span>
          <h2>Chronicles of Matthias Tactics</h2>
          <p>RPG táctico isométrico: exploración libre, cuatro clases y combate por turnos cuando el tablero decide ponerse desagradable.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </header>

      <div className="chronicles-tactics__frame">
        <aside className="chronicles-tactics__mission" aria-label="Misión">
          <span className="chronicles-tactics__kicker">{locationLabel}</span>
          <strong>{objective}</strong>
          <small>WASD/flechas mueve · 1–4 cambia de héroe · espacio usa · Shift ataca · E habilidad. En combate: una acción tuya, una respuesta enemiga.</small>
        </aside>

        <main className="chronicles-tactics__battlefield">
          <div className="chronicles-tactics__viewport">
            <div ref={hostRef} className="chronicles-tactics__three" data-chronicles-tactics-renderer="three" />
            <div className="chronicles-tactics__cinema" aria-hidden="true" />
            <div className="chronicles-tactics__narrator" aria-live="polite">
              <span>{inCombat ? `RONDA ${state.round || 1} · TU TURNO` : 'CRÓNICA'}</span>
              <p>{state.message}</p>
            </div>
            {rendererError && <div className="chronicles-tactics__error" role="alert">{rendererError}</div>}
          </div>

          <div className="chronicles-tactics__actions" aria-label="Controles de acción">
            <button type="button" className="is-ready" disabled={!canAct} aria-label="Mover al oeste" {...forecastProps('west')} onClick={() => moveParty(-1, 0)}><i aria-hidden="true">←</i><span>A</span>{forecastBadge('west')}</button>
            <button type="button" className="is-ready" disabled={!canAct} aria-label="Mover al norte" {...forecastProps('north')} onClick={() => moveParty(0, -1)}><i aria-hidden="true">↑</i><span>W</span>{forecastBadge('north')}</button>
            <button type="button" className="is-ready" disabled={!canAct} aria-label="Mover al sur" {...forecastProps('south')} onClick={() => moveParty(0, 1)}><i aria-hidden="true">↓</i><span>S</span>{forecastBadge('south')}</button>
            <button type="button" className="is-ready" disabled={!canAct} aria-label="Mover al este" {...forecastProps('east')} onClick={() => moveParty(1, 0)}><i aria-hidden="true">→</i><span>D</span>{forecastBadge('east')}</button>
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
            {Object.entries(forecastView).map(([key, view]) => (view.text
              ? <span key={key} id={`chronicles-forecast-${key}`} className="sr-only">{view.text}</span>
              : null))}
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
        <span>Motor {rendererName} · {inCombat ? `Combate por turnos · ronda ${state.round || 1}` : 'Exploración libre'}</span>
        <span>{contextualAction ? `Espacio · ${contextualAction.label}` : 'Espacio · Usar'} · Shift · {selectedProfile.attackName} · E · {selectedProfile.abilityName}</span>
        <button type="button" onClick={restart}>Reiniciar incursión</button>
      </footer>
    </div>
  );
}
