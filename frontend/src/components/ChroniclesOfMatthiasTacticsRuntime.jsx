import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chroniclesActiveEnemies,
  chroniclesObjective,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import {
  applyChroniclesProgressionToTacticsState,
  applyChroniclesTacticsProgression,
  reconcileChroniclesProgressionInTacticsState,
  beginChroniclesTacticsRun,
  ensureChroniclesTacticsRun,
  finishChroniclesTacticsRun,
  chroniclesHeroProgress,
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
  chroniclesTacticsRefillAbilityCharges,
  chroniclesTacticsTargets,
  chroniclesTacticsUse,
  chroniclesTacticsWait,
} from '../chroniclesOfMatthiasTactics.js';
import {
  chroniclesTacticsCombatActive,
  chroniclesTacticsCurrentActor,
  chroniclesTacticsPartyCanAct,
  chroniclesTacticsResolvePlayerAction,
} from '../chroniclesTacticsTurnMode.js';
import { chroniclesAdvanceCombatInitiative } from '../chronicles/chroniclesInitiative.js';
import { chroniclesResolveEnemyActor } from '../chroniclesOfMatthiasTurns.js';
import {
  chroniclesForecastBadge,
  chroniclesForecastDescription,
  chroniclesForecastMoves,
} from '../chronicles/chroniclesActionForecast.js';
import { chroniclesProjectSceneModel } from '../chronicles/chroniclesSceneModel.js';
import {
  chroniclesResolvedDifficultyBand,
  chroniclesRunDepth,
} from '../chronicles/chroniclesDifficultyPolicy.js';
import {
  chroniclesApplyRewardChoice,
  chroniclesRewardDraft,
} from '../chronicles/chroniclesRewardDraft.js';
import { chroniclesCheckpointState } from '../chronicles/chroniclesRunClient.js';
import {
  chroniclesApplyRunCheckpoint,
  chroniclesRunCheckpointFingerprint,
} from '../chronicles/chroniclesRunCheckpoint.js';
import {
  chroniclesProgressionFeedback,
  chroniclesProgressionFeedbackLabel,
} from '../chronicles/chroniclesProgressionFeedback.js';
import {
  chroniclesTacticsLocationLabel,
  chroniclesTacticsMoveAvailability,
} from '../chronicles/chroniclesTacticsPresentation.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import ChroniclesTacticsPartyHud from './ChroniclesTacticsPartyHud.jsx';
import './ChroniclesOfMatthiasTactics.css';
import './ChroniclesOfMatthiasProgression.css';
import './ChroniclesActionForecast.css';

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
  if (!chroniclesTacticsPartyCanAct(state, memberId)) return null;
  return {
    mode: 'hybrid',
    legalMoves: chroniclesTacticsLegalMoves(state),
    legalTargets: chroniclesTacticsTargets(state, memberId),
  };
}

function createActionState(progression, authoritativeRun = null) {
  const progressed = applyChroniclesProgressionToTacticsState({
    ...createChroniclesState(null, progression.characterBuild),
    round: 1,
    turnPhase: 'party',
    enemyPositions: {},
    enemyTurnEvents: [],
  }, progression);
  return {
    ...chroniclesApplyRunCheckpoint(progressed, authoritativeRun),
    enemyTurnEvents: [],
  };
}

export default function ChroniclesOfMatthiasTactics({
  authoritativeRun = null,
  onExit,
  onFinishRun = null,
  onRestartRun = null,
}) {
  useEscapeToClose(onExit);
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const [progression, setProgression] = useState(() => loadChroniclesProgression());
  const progressionRef = useRef(progression);
  const [state, setState] = useState(() => createActionState(progression, authoritativeRun));
  const stateRef = useRef(state);
  const authoritativeRunRef = useRef(authoritativeRun);
  const checkpointFingerprintRef = useRef(chroniclesRunCheckpointFingerprint(state));
  const checkpointQueueRef = useRef(Promise.resolve());
  const selectedMemberRef = useRef('matthias');
  const lastMoveAtRef = useRef(0);
  const lastAttackAtRef = useRef(0);
  const [runId, setRunId] = useState(() => authoritativeRun?.runId || ensureChroniclesTacticsRun());
  const [selectedMemberId, setSelectedMemberId] = useState('matthias');
  const [sheetRequest, setSheetRequest] = useState(null);
  const [rendererName, setRendererName] = useState('CARGANDO');
  const [rendererError, setRendererError] = useState('');
  const [progressionFeedback, setProgressionFeedback] = useState('');

  const selectedProfile = chroniclesTacticsProfile(selectedMemberId);
  const selectedAbility = useMemo(
    () => chroniclesTacticsAbilityStatus(state, selectedMemberId),
    [selectedMemberId, state],
  );
  const objective = chroniclesObjective(state);
  const locationLabel = chroniclesTacticsLocationLabel(state);
  const contextualAction = useMemo(() => chroniclesTacticsInteractions(state)[0] || null, [state]);
  const legalMoves = useMemo(() => chroniclesTacticsLegalMoves(state), [state]);
  const moveAvailability = useMemo(
    () => chroniclesTacticsMoveAvailability(state, legalMoves),
    [legalMoves, state],
  );
  const targetOptions = useMemo(
    () => chroniclesTacticsTargets(state, selectedMemberId),
    [selectedMemberId, state],
  );
  const canAttack = targetOptions.length > 0;
  const targetIntel = targetOptions[0] || null;
  const activeActor = useMemo(() => chroniclesTacticsCurrentActor(state), [state]);
  const inCombat = useMemo(() => chroniclesTacticsCombatActive(state), [state]);
  const canAct = chroniclesTacticsPartyCanAct(state, selectedMemberId);
  const initiativeRound = Number(state.initiative?.round || state.round || 1);
  const canPassTurn = Boolean(state.initiative?.order?.length && canAct && !contextualAction);
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
  const rewardDraft = useMemo(() => {
    if (state.phase !== 'escaped') return [];
    return chroniclesRewardDraft({
      seed: Number(authoritativeRun?.seed),
      milestoneId: `${state.mapId}:escaped`,
      progression,
      claimedRewards: state.claimedRewards,
    });
  }, [authoritativeRun?.seed, progression, state.claimedRewards, state.mapId, state.phase]);
  const difficultyBand = useMemo(() => chroniclesResolvedDifficultyBand(
    authoritativeRun,
    state.mapId,
    {
      progression,
      deployedMemberIds: state.party?.map((member) => member.id),
      depth: chroniclesRunDepth(authoritativeRun, state.mapId),
    },
  ), [authoritativeRun, progression, state.mapId, state.party]);
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

  const partyAgilityBonusesFor = useCallback((current) => Object.fromEntries(
    (current?.party || []).map((member) => [
      member.id,
      Number(chroniclesHeroProgress(progressionRef.current, member.id).attributes?.agility || 0),
    ]),
  ), []);

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
      const feedback = chroniclesProgressionFeedback(progressResult);
      setProgressionFeedback(chroniclesProgressionFeedbackLabel(
        feedback,
        (memberId) => previous.party?.find((member) => member.id === memberId)?.name || memberId,
      ));
    } else {
      setProgressionFeedback('');
    }

    stateRef.current = next;
    setState(next);
    return true;
  }, [runId]);

  const moveParty = useCallback((dx, dy) => {
    const now = performance.now();
    if (now - lastMoveAtRef.current < 120) return;
    const current = stateRef.current;
    if (!chroniclesTacticsPartyCanAct(current)) return;
    const legal = chroniclesTacticsLegalMoves(current).find((move) => (
      move.x === current.x + dx && move.y === current.y + dy
    ));
    if (!legal) return;
    const next = chroniclesTacticsMove(current, legal);
    const resolved = chroniclesTacticsResolvePlayerAction(current, next, {
      partyAgilityBonuses: partyAgilityBonusesFor(current),
    });
    if (commitState(resolved)) lastMoveAtRef.current = now;
  }, [commitState, partyAgilityBonusesFor]);

  const attackEnemy = useCallback((enemyId = null) => {
    const now = performance.now();
    if (now - lastAttackAtRef.current < 260) return;
    const current = stateRef.current;
    if (!chroniclesTacticsPartyCanAct(current)) return;
    const actor = chroniclesTacticsCurrentActor(current);
    const memberId = actor?.kind === 'party' ? actor.id : selectedMemberRef.current;
    const targets = chroniclesTacticsTargets(current, memberId);
    const target = enemyId
      ? targets.find((candidate) => candidate.enemyId === enemyId)
      : targets[0];
    if (!target) return;
    const next = chroniclesTacticsAttack(current, memberId, target.enemyId);
    const resolved = chroniclesTacticsResolvePlayerAction(current, next, {
      forceCombat: !current.initiative,
      forceEnemyIds: [target.enemyId],
      partyAgilityBonuses: partyAgilityBonusesFor(current),
    });
    if (commitState(resolved, { actorMemberId: memberId, actionKind: 'attack' })) lastAttackAtRef.current = now;
  }, [commitState, partyAgilityBonusesFor]);

  const useClassAbility = useCallback(() => {
    const current = stateRef.current;
    if (!chroniclesTacticsPartyCanAct(current)) return;
    const actor = chroniclesTacticsCurrentActor(current);
    const memberId = actor?.kind === 'party' ? actor.id : selectedMemberRef.current;
    const profile = chroniclesTacticsProfile(memberId);
    const targetsBefore = profile.abilityKind === 'heal'
      ? []
      : chroniclesTacticsTargets(current, memberId).map((target) => target.enemyId);
    const next = chroniclesTacticsAbility(current, memberId);
    const resolved = chroniclesTacticsResolvePlayerAction(current, next, {
      forceCombat: !current.initiative && profile.abilityKind !== 'heal' && next !== current,
      forceEnemyIds: targetsBefore,
      partyAgilityBonuses: partyAgilityBonusesFor(current),
    });
    commitState(resolved, { actorMemberId: memberId, actionKind: 'ability' });
  }, [commitState, partyAgilityBonusesFor]);

  const useContextualAction = useCallback(() => {
    const current = stateRef.current;
    if (!chroniclesTacticsPartyCanAct(current)) return;
    const actor = chroniclesTacticsCurrentActor(current);
    const memberId = actor?.kind === 'party' ? actor.id : selectedMemberRef.current;
    const next = chroniclesTacticsUse(current);
    const resolved = chroniclesTacticsResolvePlayerAction(current, next, {
      partyAgilityBonuses: partyAgilityBonusesFor(current),
    });
    commitState(resolved, { actorMemberId: memberId, actionKind: 'use' });
  }, [commitState, partyAgilityBonusesFor]);

  const passTurn = useCallback(() => {
    const current = stateRef.current;
    const actor = chroniclesTacticsCurrentActor(current);
    if (!current?.initiative?.order?.length || actor?.kind !== 'party') return;
    const next = chroniclesTacticsWait(current, actor.id);
    const resolved = chroniclesTacticsResolvePlayerAction(current, next);
    commitState(resolved, { actorMemberId: actor.id, actionKind: 'wait' });
  }, [commitState]);

  const applyLiveProgression = useCallback((nextProgression) => {
    const saved = saveChroniclesProgression(nextProgression);
    progressionRef.current = saved;
    setProgression(saved);
    const reconciled = reconcileChroniclesProgressionInTacticsState(stateRef.current, saved);
    stateRef.current = reconciled;
    setState(reconciled);
  }, []);

  const chooseReward = useCallback((choiceId) => {
    const current = stateRef.current;
    const result = chroniclesApplyRewardChoice({
      seed: Number(authoritativeRun?.seed),
      milestoneId: `${current.mapId}:escaped`,
      state: current,
      progression: progressionRef.current,
      choiceId,
      refillClassAbilities: chroniclesTacticsRefillAbilityCharges,
    });
    if (!result.applied) return;

    let nextState = result.state;
    if (result.progression !== progressionRef.current) {
      const saved = saveChroniclesProgression(result.progression);
      progressionRef.current = saved;
      setProgression(saved);
      nextState = reconcileChroniclesProgressionInTacticsState(nextState, saved);
    }

    stateRef.current = nextState;
    setState(nextState);
    setProgressionFeedback(`RECOMPENSA · ${result.choice.label}`);
  }, [authoritativeRun?.seed]);

  const allocateAttribute = useCallback((memberId, attributeKey) => {
    const result = spendChroniclesAttributePoint(progressionRef.current, memberId, attributeKey);
    if (!result.spent) return;
    applyLiveProgression(result.progression);
  }, [applyLiveProgression]);

  const learnSkill = useCallback((memberId, skillId) => {
    const result = unlockChroniclesSkill(progressionRef.current, memberId, skillId);
    if (!result.unlocked) return;
    applyLiveProgression(result.progression);
  }, [applyLiveProgression]);

  const selectMember = useCallback((memberId) => {
    const actor = chroniclesTacticsCurrentActor(stateRef.current);
    if (actor?.kind === 'enemy') return;
    if (actor?.kind === 'party' && actor.id !== memberId) return;
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

    if (typeof onRestartRun === 'function') {
      onRestartRun();
      return;
    }

    const next = createActionState(progressionRef.current);
    selectedMemberRef.current = 'matthias';
    lastMoveAtRef.current = 0;
    lastAttackAtRef.current = 0;
    setRunId(nextRunId);
    setSelectedMemberId('matthias');
    setSheetRequest(null);
    setProgressionFeedback('');
    stateRef.current = next;
    setState(next);
  }, [onRestartRun, runId]);

  useEffect(() => {
    selectedMemberRef.current = selectedMemberId;
  }, [selectedMemberId]);

  useEffect(() => {
    const actor = chroniclesTacticsCurrentActor(state);
    if (actor?.kind !== 'party' || actor.id === selectedMemberRef.current) return;
    selectedMemberRef.current = actor.id;
    setSelectedMemberId(actor.id);
  }, [state]);

  useEffect(() => {
    const actor = chroniclesTacticsCurrentActor(state);
    if (!state.initiative?.order?.length || actor?.kind !== 'enemy' || state.phase === 'defeated') return undefined;

    const timer = window.setTimeout(() => {
      const latest = stateRef.current;
      const latestActor = chroniclesTacticsCurrentActor(latest);
      if (!latest?.initiative?.order?.length || latestActor?.kind !== 'enemy' || latestActor.id !== actor.id) return;

      const acted = chroniclesResolveEnemyActor(latest, actor.id);
      const advanced = acted.phase === 'defeated'
        ? acted
        : chroniclesAdvanceCombatInitiative(acted, chroniclesActiveEnemies(acted));
      stateRef.current = advanced;
      setState(advanced);
    }, 280);

    return () => window.clearTimeout(timer);
  }, [state]);

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
    const fingerprint = chroniclesRunCheckpointFingerprint(state);
    if (!fingerprint || fingerprint === checkpointFingerprintRef.current) return;
    checkpointFingerprintRef.current = fingerprint;
    const snapshot = state;

    checkpointQueueRef.current = checkpointQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const currentRun = authoritativeRunRef.current;
        if (!currentRun?.runId) return;
        const completesRun = snapshot.phase === 'escaped' && rewardDraft.length === 0;
        const updated = await chroniclesCheckpointState(
          currentRun.runId,
          snapshot,
          currentRun.worldVersion,
          { terminalStatus: completesRun ? 'completed' : null },
        );
        authoritativeRunRef.current = { ...currentRun, ...updated };
        if (updated?.status === 'completed') onFinishRun?.();
      })
      .catch((error) => {
        console.error('Chronicles Tactics checkpoint failed', error);
        if (error?.status === 409) setRendererError('La expedición cambió en otra sesión. Sal y vuelve a entrar para sincronizar.');
      });
  }, [onFinishRun, rewardDraft.length, state]);

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
        const current = stateRef.current;
        const contextual = chroniclesTacticsInteractions(current)[0] || null;
        if (contextual) useContextualAction();
        else passTurn();
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
  }, [attackEnemy, moveParty, passTurn, selectMember, useClassAbility, useContextualAction]);

  return (
    <div
      className="chronicles-tactics"
      data-chronicles-tactics="true"
      data-camera="isometric-behind-party"
      data-combat="turn-based"
      data-engagement={inCombat ? 'combat' : 'exploration'}
      data-difficulty-target={difficultyBand.targetLevel}
      data-difficulty-min={difficultyBand.minLevel}
      data-difficulty-max={difficultyBand.maxLevel}
      data-map={state.mapId}
      data-phase={state.phase}
      data-reward-draft-ready={rewardDraft.length > 0 ? 'true' : 'false'}
      data-reward-draft-count={rewardDraft.length}
      data-turn-phase={activeActor?.kind || (state.turnPhase || 'party')}
      data-initiative-actor={activeActor?.id || ''}
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
          <small>WASD/flechas mueve · 1–4 cambia de héroe · espacio usa/pasa turno · Shift ataca · E habilidad. En combate manda AGI + 1d8: una acción por actor.</small>
          {targetIntel ? (
            <div className="chronicles-tactics__enemy-intel" aria-label="Intel enemigo">
              <span>OBJETIVO · NIVEL {targetIntel.enemyBuild.level}</span>
              <strong>{targetIntel.name}</strong>
              <small className="chronicles-tactics__enemy-archetype">
                {String(targetIntel.enemyBuild.archetype).replaceAll('-', ' ')}
              </small>
              <small>
                VIG {targetIntel.enemyBuild.attributes.vigor || 0} · POT {targetIntel.enemyBuild.attributes.power || 0}
                {' · '}PRE {targetIntel.enemyBuild.attributes.precision || 0} · VOL {targetIntel.enemyBuild.attributes.will || 0}
              </small>
              {targetIntel.enemyBuild.skills.length ? (
                <div className="chronicles-tactics__enemy-skills">
                  {targetIntel.enemyBuild.skills.map((skill) => (
                    <span key={skill.id} title={skill.description}>{skill.label}</span>
                  ))}
                </div>
              ) : (
                <small>Sin técnicas conocidas.</small>
              )}
            </div>
          ) : null}
        </aside>

        <main className="chronicles-tactics__battlefield">
          <div className="chronicles-tactics__viewport">
            <div ref={hostRef} className="chronicles-tactics__three" data-chronicles-tactics-renderer="three" />
            <div className="chronicles-tactics__cinema" aria-hidden="true" />
            <div className="chronicles-tactics__narrator" aria-live="polite">
              <span>{activeActor
                ? `RONDA ${initiativeRound} · ${activeActor.kind === 'party' ? 'TURNO' : 'ENEMIGO'} · ${String(activeActor.name || activeActor.id).toUpperCase()}`
                : 'CRÓNICA'}</span>
              <p>{state.message}</p>
              {progressionFeedback ? (
                <strong data-chronicles-progression-feedback="true">{progressionFeedback}</strong>
              ) : null}
            </div>
            {rewardDraft.length > 0 ? (
              <section className="chronicles-tactics__reward" aria-label="Recompensa de extracción">
                <span>EXTRACCIÓN · UNA ELECCIÓN</span>
                <strong>Elige qué se lleva la compañía</strong>
                <small>Una sola recompensa. Lo demás vuelve a la oscuridad con una eficiencia administrativa envidiable.</small>
                <div>
                  {rewardDraft.map((choice) => (
                    <button
                      key={choice.choiceId}
                      type="button"
                      data-reward-kind={choice.kind}
                      onClick={() => chooseReward(choice.choiceId)}
                    >
                      <b>{choice.label}</b>
                      <small>{choice.description}</small>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {rendererError && <div className="chronicles-tactics__error" role="alert">{rendererError}</div>}
          </div>

          <div className="chronicles-tactics__actions" aria-label="Controles de acción">
            <button type="button" className={moveAvailability.west ? 'is-ready' : ''} disabled={!canAct || !moveAvailability.west} aria-label="Mover al oeste" {...forecastProps('west')} onClick={() => moveParty(-1, 0)}><i aria-hidden="true">←</i><span>A</span>{forecastBadge('west')}</button>
            <button type="button" className={moveAvailability.north ? 'is-ready' : ''} disabled={!canAct || !moveAvailability.north} aria-label="Mover al norte" {...forecastProps('north')} onClick={() => moveParty(0, -1)}><i aria-hidden="true">↑</i><span>W</span>{forecastBadge('north')}</button>
            <button type="button" className={moveAvailability.south ? 'is-ready' : ''} disabled={!canAct || !moveAvailability.south} aria-label="Mover al sur" {...forecastProps('south')} onClick={() => moveParty(0, 1)}><i aria-hidden="true">↓</i><span>S</span>{forecastBadge('south')}</button>
            <button type="button" className={moveAvailability.east ? 'is-ready' : ''} disabled={!canAct || !moveAvailability.east} aria-label="Mover al este" {...forecastProps('east')} onClick={() => moveParty(1, 0)}><i aria-hidden="true">→</i><span>D</span>{forecastBadge('east')}</button>
            <button
              type="button"
              className={(contextualAction || canPassTurn) ? 'is-ready' : ''}
              disabled={!canAct || (!contextualAction && !canPassTurn)}
              aria-label={contextualAction ? 'Usar' : 'Pasar turno'}
              title={contextualAction?.label || (canPassTurn ? 'Pasar turno' : 'No hay nada que usar aquí')}
              onClick={contextualAction ? useContextualAction : passTurn}
            ><i aria-hidden="true">◎</i><span>{contextualAction ? 'ESPACIO · USAR' : canPassTurn ? 'ESPACIO · PASAR TURNO' : 'ESPACIO · USAR'}</span></button>
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
        <span>Motor {rendererName} · {activeActor ? `Combate por turnos · ronda ${initiativeRound} · ${activeActor.name || activeActor.id}` : 'Exploración libre'}</span>
        <span>{contextualAction ? `Espacio · ${contextualAction.label}` : canPassTurn ? 'Espacio · Pasar turno' : 'Espacio · Usar'} · Shift · {selectedProfile.attackName} · E · {selectedProfile.abilityName}</span>
        <button type="button" onClick={restart}>Reiniciar incursión</button>
      </footer>
    </div>
  );
}
