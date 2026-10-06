import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHRONICLES_DIRECTIONS,
  chroniclesActiveEnemies,
  chroniclesEnemyTargetAhead,
  chroniclesJournalEntries,
  chroniclesObjective,
  chroniclesReduce,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import { chroniclesPartyBark } from '../chroniclesOfMatthiasBarks.js';
import { chroniclesResolveEnemyActor } from '../chroniclesOfMatthiasTurns.js';
import {
  chroniclesAdvanceCombatInitiative,
  chroniclesCurrentInitiativeActor,
  chroniclesStartInitiativeCombat,
} from '../chronicles/chroniclesInitiative.js';
import { chroniclesDeployedPartyLevel } from '../chronicles/chroniclesDifficultyPolicy.js';
import { playChroniclesActionSound } from '../chronicles/chroniclesActionAudio.js';
import { chroniclesPartyPortraitUrl } from '../chronicles/chroniclesPartyPortraitAssets.js';
import { chroniclesClearRuntimeMapDefinitions } from '../chronicles/chroniclesMapCatalog.js';
import { chroniclesCheckpointState } from '../chronicles/chroniclesRunClient.js';
import {
  chroniclesApplyRunCheckpoint,
  chroniclesRunCheckpointFingerprint,
} from '../chronicles/chroniclesRunCheckpoint.js';
import {
  CHRONICLES_BOOTSTRAP_ERROR_CODES,
  chroniclesBootstrapWorld,
} from '../chronicles/chroniclesGameBootstrap.js';
import {
  ensureChroniclesRun,
  finishChroniclesRun,
  renewChroniclesRun,
} from '../chronicles/chroniclesRunIdentity.js';
import { chroniclesPartyCondition } from '../chroniclesOfMatthiasPartyCondition.js';
import { chroniclesPartyRelic } from '../chroniclesOfMatthiasRelics.js';
import { chroniclesRetaliationCue } from '../chroniclesOfMatthiasRetaliation.js';
import { chroniclesTargetAhead } from '../chroniclesOfMatthiasTargeting.js';
import { CHRONICLES_TURN_ENGINE_VERSION } from '../chroniclesOfMatthiasTurns.js';
import {
  chroniclesHeroProgress,
  loadChroniclesProgression,
  saveChroniclesProgression,
  setChroniclesCharacterBuild,
} from '../chroniclesOfMatthiasProgression.js';
import {
  chroniclesAutomapMarkVisited,
  clearChroniclesAutomapVisited,
  loadChroniclesAutomapVisited,
  saveChroniclesAutomapVisited,
} from '../chronicles/chroniclesAutomap.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import ChroniclesAutomap from './ChroniclesAutomap.jsx';
import ChroniclesBookOneEpilogue from './ChroniclesBookOneEpilogue.jsx';
import ChroniclesCharacterSetup from './ChroniclesCharacterSetup.jsx';
import ChroniclesDefeatOverlay from './ChroniclesDefeatOverlay.jsx';
import ChroniclesEnemyRetaliationFx from './ChroniclesEnemyRetaliationFx.jsx';
import ChroniclesNarratorOverlay from './ChroniclesNarratorOverlay.jsx';
import ChroniclesPartyBark from './ChroniclesPartyBark.jsx';
import ChroniclesTacticalMargin from './ChroniclesTacticalMargin.jsx';
import './ChroniclesOfMatthias.css';
import './ChroniclesOfMatthiasArt.css';
import './ChroniclesOfMatthiasJournal.css';
import './ChroniclesPartyCondition.css';
import './ChroniclesPartyThumbnails.css';
import './ChroniclesRecoveredRelic.css';

const KEY_ACTIONS = Object.freeze({
  ArrowUp: 'forward', w: 'forward', W: 'forward',
  ArrowDown: 'backward', s: 'backward', S: 'backward',
  ArrowLeft: 'turn-left', a: 'turn-left', A: 'turn-left',
  ArrowRight: 'turn-right', d: 'turn-right', D: 'turn-right',
});

const FIRST_PERSON_RUN_SCOPE = 'first-person';

function loadChroniclesFirstPersonRenderer() {
  return import('../chroniclesOfMatthiasThree.js');
}

function BootstrapStatus() {
  return (
    <div className="menu chronicles-bootstrap" role="status" aria-live="polite">
      <section className="menu-section">
        <span className="section-label">CHRONICLES OF MATTHIAS</span>
        <h2>Preparando expedición…</h2>
        <p>El Game Director está ensamblando el mundo de esta run.</p>
      </section>
    </div>
  );
}

function BootstrapFailure({ error, onRetry, onExit }) {
  const aborted = error?.code === CHRONICLES_BOOTSTRAP_ERROR_CODES.aborted;
  return (
    <div className="menu chronicles-bootstrap">
      <section className="menu-section" role="alert" aria-live="assertive">
        <span className="section-label">EXPEDICIÓN NO INICIADA</span>
        <h2>No se pudo preparar Chronicles</h2>
        <p>El mundo autoritativo no superó el arranque. No se cargará la cripta local como sustituto.</p>
        <p className="hint-text">Código {error?.code || CHRONICLES_BOOTSTRAP_ERROR_CODES.unknown}{error?.requestId ? ` · ${error.requestId}` : ''}</p>
        {!aborted && (
          <div className="game-controls">
            <button type="button" className="primary-btn" onClick={onRetry}>Reintentar</button>
            <button type="button" className="secondary-btn" onClick={onExit}>Salir de Chronicles</button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ChroniclesOfMatthias({ onExit }) {
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const retaliationTimerRef = useRef(null);
  const retaliationSequenceRef = useRef(0);
  const partyBarkTimerRef = useRef(null);
  const partyBarkSequenceRef = useRef(0);
  const [progression, setProgression] = useState(() => loadChroniclesProgression());
  const [characterSetupDone, setCharacterSetupDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(null);
  const [bootstrapRevision, setBootstrapRevision] = useState(0);
  const staleRunRecoveryAttemptedRef = useRef(false);
  const activeRunIdRef = useRef(null);
  const authoritativeRunRef = useRef(null);
  const checkpointFingerprintRef = useRef('');
  const checkpointQueueRef = useRef(Promise.resolve());
  const stateRef = useRef(null);
  const [state, setState] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState('matthias');
  const selectedMemberIdRef = useRef(selectedMemberId);
  const [rendererError, setRendererError] = useState('');
  const [retaliationCue, setRetaliationCue] = useState(null);
  const [partyBark, setPartyBark] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [automapOpen, setAutomapOpen] = useState(false);
  const [automapVisitedByMap, setAutomapVisitedByMap] = useState({});
  const touchHoldRef = useRef({ delayId: null, repeatId: null });

  useEffect(() => {
    selectedMemberIdRef.current = selectedMemberId;
  }, [selectedMemberId]);

  useEffect(() => {
    if (!state?.mapId) return;
    setAutomapVisitedByMap((visited) => chroniclesAutomapMarkVisited(visited, state));
  }, [state?.mapId, state?.x, state?.y]);

  useEffect(() => {
    const runId = activeRunIdRef.current;
    if (!ready || !runId) return;
    saveChroniclesAutomapVisited(runId, automapVisitedByMap);
  }, [automapVisitedByMap, ready]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const exitChronicles = useCallback(() => {
    const current = stateRef.current;
    const runId = activeRunIdRef.current;
    const terminal = current?.phase === 'defeated' || current?.phase === 'escaped';
    if (terminal && runId) {
      finishChroniclesRun(FIRST_PERSON_RUN_SCOPE, runId);
      clearChroniclesAutomapVisited(runId);
    }
    // Active runs remain resumable across first-person/Tactics. Terminal runs
    // are explicitly retired locally so re-entry starts a fresh expedition.
    activeRunIdRef.current = null;
    onExit?.();
  }, [onExit]);

  useEscapeToClose(() => {
    if (automapOpen) {
      setAutomapOpen(false);
      return;
    }
    setMenuOpen((open) => !open);
  }, { contextMenu: false });

  const confirmCharacterBuild = useCallback((build) => {
    const selected = setChroniclesCharacterBuild(progression, build);
    if (!selected.updated) return;
    const saved = saveChroniclesProgression(selected.progression);
    stateRef.current = null;
    staleRunRecoveryAttemptedRef.current = false;
    setProgression(saved);
    setSelectedMemberId('matthias');
    setState(null);
    setReady(false);
    setBootstrapError(null);
    setRendererError('');
    setAutomapOpen(false);
    setAutomapVisitedByMap({});
    setCharacterSetupDone(true);
    setBootstrapRevision((revision) => revision + 1);
  }, [progression]);

  const retryBootstrap = useCallback(() => {
    staleRunRecoveryAttemptedRef.current = false;
    stateRef.current = null;
    setState(null);
    setReady(false);
    setBootstrapError(null);
    setRendererError('');
    setBootstrapRevision((revision) => revision + 1);
  }, []);

  const dispatch = useCallback((action) => {
    const current = stateRef.current;
    if (!current) return;

    const actionType = typeof action === 'string' ? action : action?.type;
    const activeActor = chroniclesCurrentInitiativeActor(current.initiative);
    if (current.initiative && activeActor?.kind === 'enemy') return;
    if (
      current.initiative
      && actionType === 'attack'
      && activeActor?.kind === 'party'
      && typeof action === 'object'
      && action.memberId !== activeActor.id
    ) return;

    let next;
    if (!current.initiative) {
      const exploratoryNext = actionType === 'attack' ? current : chroniclesReduce(current, action);
      const attackingMember = actionType === 'attack' && typeof action === 'object'
        ? current.party.find((member) => member.id === action.memberId)
        : null;
      const forcedTarget = attackingMember
        ? chroniclesEnemyTargetAhead(current, attackingMember.reach)
        : null;
      const partyAgilityBonuses = Object.fromEntries(
        (current.party || []).map((member) => [
          member.id,
          Number(chroniclesHeroProgress(progression, member.id).attributes?.agility || 0),
        ]),
      );
      const started = chroniclesStartInitiativeCombat(
        exploratoryNext,
        chroniclesActiveEnemies(exploratoryNext),
        {
          forceEnemyIds: forcedTarget ? [forcedTarget.enemy.id] : [],
          partyAgilityBonuses,
        },
      );
      next = started !== exploratoryNext
        ? started
        : actionType === 'attack'
          ? chroniclesReduce(current, action)
          : exploratoryNext;
    } else {
      next = chroniclesReduce(current, action);
      if (next !== current && next.phase !== 'defeated' && next.phase !== 'escaped') {
        next = chroniclesAdvanceCombatInitiative(next, chroniclesActiveEnemies(next));
      }
    }

    playChroniclesActionSound(current, next, action);
    stateRef.current = next;
    setState(next);

    const bark = chroniclesPartyBark(current, next);
    if (bark) {
      const token = partyBarkSequenceRef.current + 1;
      partyBarkSequenceRef.current = token;
      if (partyBarkTimerRef.current) clearTimeout(partyBarkTimerRef.current);
      setPartyBark({ ...bark, token });
      partyBarkTimerRef.current = setTimeout(() => {
        setPartyBark((active) => active?.token === token ? null : active);
      }, 2800);
    }

    const cue = chroniclesRetaliationCue(current, next);
    if (cue) {
      const token = retaliationSequenceRef.current + 1;
      retaliationSequenceRef.current = token;
      if (retaliationTimerRef.current) clearTimeout(retaliationTimerRef.current);
      setRetaliationCue({ ...cue, token });
      retaliationTimerRef.current = setTimeout(() => {
        setRetaliationCue((active) => active?.token === token ? null : active);
      }, 320);
    }
  }, [progression]);

  const clearTouchHold = useCallback(() => {
    const active = touchHoldRef.current;
    if (active.delayId !== null) window.clearTimeout(active.delayId);
    if (active.repeatId !== null) window.clearInterval(active.repeatId);
    touchHoldRef.current = { delayId: null, repeatId: null };
  }, []);

  const startTouchHold = useCallback((action, event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    clearTouchHold();

    const current = stateRef.current;
    if (!current || current.phase === 'defeated' || current.phase === 'escaped') return;

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is a comfort feature only; input remains valid without it.
    }

    dispatch(action);
    if (current.initiative) return;

    touchHoldRef.current.delayId = window.setTimeout(() => {
      const repeat = () => {
        const latest = stateRef.current;
        if (!latest || latest.initiative || latest.phase === 'defeated' || latest.phase === 'escaped') {
          clearTouchHold();
          return false;
        }
        dispatch(action);
        return true;
      };

      if (!repeat()) return;
      touchHoldRef.current.repeatId = window.setInterval(repeat, 150);
    }, 280);
  }, [clearTouchHold, dispatch]);

  const activateTouchAction = useCallback((action, event) => {
    // Pointer input already fires on pointerdown so taps feel immediate. Keyboard
    // and assistive activation arrive as click(detail=0) and still get one action.
    if (event.detail === 0) dispatch(action);
  }, [dispatch]);

  useEffect(() => {
    const current = stateRef.current;
    const actor = chroniclesCurrentInitiativeActor(current?.initiative);
    if (!current?.initiative || actor?.kind !== 'enemy' || current.phase === 'defeated') return undefined;

    const timer = window.setTimeout(() => {
      const latest = stateRef.current;
      const latestActor = chroniclesCurrentInitiativeActor(latest?.initiative);
      if (!latest?.initiative || latestActor?.kind !== 'enemy' || latestActor.id !== actor.id) return;
      const acted = chroniclesResolveEnemyActor(latest, actor.id);
      const advanced = acted.phase === 'defeated'
        ? acted
        : chroniclesAdvanceCombatInitiative(acted, chroniclesActiveEnemies(acted));
      stateRef.current = advanced;
      setState(advanced);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [state?.initiative?.cursor, state?.initiative?.round, state?.phase]);

  useEffect(() => {
    const actor = chroniclesCurrentInitiativeActor(state?.initiative);
    if (actor?.kind !== 'party' || actor.id === selectedMemberIdRef.current) return;
    selectedMemberIdRef.current = actor.id;
    setSelectedMemberId(actor.id);
  }, [state?.initiative?.cursor, state?.initiative?.round]);

  const attackWithSelected = useCallback(() => {
    const current = stateRef.current;
    if (!current || current.phase === 'defeated' || current.phase === 'escaped') return;
    const initiativeActor = chroniclesCurrentInitiativeActor(current.initiative);
    if (initiativeActor?.kind === 'enemy') return;
    const memberId = initiativeActor?.kind === 'party'
      ? initiativeActor.id
      : selectedMemberIdRef.current;
    const member = current.party.find((candidate) => candidate.id === memberId);
    const startsCombat = !current.initiative
      && member
      && chroniclesEnemyTargetAhead(current, member.reach);
    if (!startsCombat) engineRef.current?.playAttack?.(memberId);
    dispatch({ type: 'attack', memberId });
  }, [dispatch]);

  const restart = useCallback(() => {
    if (activeRunIdRef.current) {
      clearChroniclesAutomapVisited(activeRunIdRef.current);
      finishChroniclesRun(FIRST_PERSON_RUN_SCOPE, activeRunIdRef.current);
      activeRunIdRef.current = null;
    }
    stateRef.current = null;
    setState(null);
    setSelectedMemberId('matthias');
    setReady(false);
    setBootstrapError(null);
    setRendererError('');
    setAutomapOpen(false);
    setAutomapVisitedByMap({});
    staleRunRecoveryAttemptedRef.current = false;
    if (retaliationTimerRef.current) clearTimeout(retaliationTimerRef.current);
    retaliationTimerRef.current = null;
    setRetaliationCue(null);
    if (partyBarkTimerRef.current) clearTimeout(partyBarkTimerRef.current);
    partyBarkTimerRef.current = null;
    setPartyBark(null);
    setBootstrapRevision((revision) => revision + 1);
  }, []);

  useEffect(() => () => {
    clearTouchHold();
    if (retaliationTimerRef.current) clearTimeout(retaliationTimerRef.current);
    if (partyBarkTimerRef.current) clearTimeout(partyBarkTimerRef.current);
  }, [clearTouchHold]);

  useEffect(() => {
    if (!characterSetupDone) return undefined;
    const controller = new AbortController();
    let active = true;

    setBootstrapError(null);
    const operationId = ensureChroniclesRun(FIRST_PERSON_RUN_SCOPE);
    activeRunIdRef.current = operationId;

    // Overlap renderer chunk loading with the authoritative world bootstrap.
    // Gameplay still stays fail-closed until the backend bundle validates.
    void loadChroniclesFirstPersonRenderer().catch(() => {});

    chroniclesBootstrapWorld({
      signal: controller.signal,
      operationId,
      partyLevel: chroniclesDeployedPartyLevel(progression),
    })
      .then((world) => {
        if (!active) return;
        const next = chroniclesApplyRunCheckpoint(
          createChroniclesState(null, progression.characterBuild),
          world,
        );
        authoritativeRunRef.current = world;
        checkpointFingerprintRef.current = chroniclesRunCheckpointFingerprint(next);
        setAutomapVisitedByMap(loadChroniclesAutomapVisited(operationId));
        stateRef.current = next;
        staleRunRecoveryAttemptedRef.current = false;
        setSelectedMemberId('matthias');
        setState(next);
        setBootstrapError(null);
        setRendererError('');
        setReady(true);
      })
      .catch((error) => {
        if (!active || error?.code === CHRONICLES_BOOTSTRAP_ERROR_CODES.aborted) return;
        if (error?.status === 409 && !staleRunRecoveryAttemptedRef.current) {
          staleRunRecoveryAttemptedRef.current = true;
          clearChroniclesAutomapVisited(operationId);
          const replacementRunId = renewChroniclesRun(FIRST_PERSON_RUN_SCOPE, operationId);
          activeRunIdRef.current = replacementRunId;
          setReady(false);
          setBootstrapError(null);
          setBootstrapRevision((revision) => revision + 1);
          return;
        }
        stateRef.current = null;
        setState(null);
        setReady(false);
        setBootstrapError(error);
      });

    return () => {
      active = false;
      controller.abort();
      chroniclesClearRuntimeMapDefinitions();
    };
  }, [bootstrapRevision, characterSetupDone, progression]);

  useEffect(() => {
    let cancelled = false;
    let engine = null;
    const host = hostRef.current;
    if (!ready || !stateRef.current || !host) return undefined;

    void loadChroniclesFirstPersonRenderer()
      .then(({ createChroniclesOfMatthiasGame }) => {
        if (cancelled) return;
        engine = createChroniclesOfMatthiasGame(host, { initialState: stateRef.current });
        engineRef.current = engine;
        engine.renderState(stateRef.current);
      })
      .catch((error) => {
        console.error('Chronicles of Matthias Three.js boot failed', error);
        if (!cancelled) {
          setRendererError('La cripta se ha negado a materializarse. La escena no ha podido arrancar.');
        }
      });

    return () => {
      cancelled = true;
      engine?.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [ready, state?.mapId]);

  useEffect(() => { engineRef.current?.renderState(state); }, [state]);

  useEffect(() => {
    const run = authoritativeRunRef.current;
    if (!ready || !state || !run?.runId) return;
    const fingerprint = chroniclesRunCheckpointFingerprint(state);
    if (!fingerprint || fingerprint === checkpointFingerprintRef.current) return;
    checkpointFingerprintRef.current = fingerprint;
    const snapshot = state;

    checkpointQueueRef.current = checkpointQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const currentRun = authoritativeRunRef.current;
        if (!currentRun?.runId) return;
        const updated = await chroniclesCheckpointState(
          currentRun.runId,
          snapshot,
          currentRun.worldVersion,
          { terminalStatus: snapshot.phase === 'escaped' ? 'completed' : null },
        );
        authoritativeRunRef.current = { ...currentRun, ...updated };
      })
      .catch((error) => {
        console.error('Chronicles checkpoint failed', error);
        if (error?.status === 409) {
          setReady(false);
          setBootstrapError(error);
        }
      });
  }, [ready, state]);

  useEffect(() => {
    if (!ready || !stateRef.current) return undefined;
    const onKeyDown = (event) => {
      const current = stateRef.current;
      if (!current) return;
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        clearTouchHold();
        setMenuOpen(false);
        setAutomapOpen((open) => !open);
        return;
      }
      if (automapOpen || current.phase === 'defeated' || current.phase === 'escaped') return;
      if (/^[1-4]$/.test(event.key)) {
        const member = current.party[Number(event.key) - 1];
        if (member) {
          event.preventDefault();
          setSelectedMemberId(member.id);
        }
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        attackWithSelected();
        return;
      }
      const action = KEY_ACTIONS[event.key];
      if (!action) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [attackWithSelected, automapOpen, clearTouchHold, dispatch, ready]);

  if (!characterSetupDone) {
    return (
      <ChroniclesCharacterSetup
        currentBuild={progression.characterBuild}
        recoveryLabMode="chronicles"
        onConfirm={confirmCharacterBuild}
        onExit={exitChronicles}
      />
    );
  }

  if (bootstrapError) {
    return <BootstrapFailure error={bootstrapError} onRetry={retryBootstrap} onExit={exitChronicles} />;
  }
  if (!ready || !state) return <BootstrapStatus />;

  const direction = CHRONICLES_DIRECTIONS[state.direction];
  const objective = chroniclesObjective(state);
  const selectedMember = state.party.find((member) => member.id === selectedMemberId) || state.party[0];
  const selectedCondition = chroniclesPartyCondition(selectedMember);
  const selectedRelic = chroniclesPartyRelic(state, selectedMember?.id);
  const tacticalTarget = chroniclesTargetAhead(state, selectedMember?.reach || 1);
  const journalEntries = chroniclesJournalEntries(state);
  const latestJournalEntry = journalEntries[journalEntries.length - 1];
  const expeditionOver = state.phase === 'defeated' || state.phase === 'escaped';

  return (
    <div
      className="chronicles"
      data-chronicles="true"
      data-chronicles-map-id={state.mapId}
      data-chronicles-turns={state.turns}
      data-chronicles-phase={state.phase}
      data-chronicles-turn-engine={CHRONICLES_TURN_ENGINE_VERSION}
      data-chronicles-initiative-die={state.initiative?.die || undefined}
      role="region"
      aria-label="Chronicles of Matthias"
    >
      <div className="chronicles-shell">
        <aside className="chronicles-party" aria-label="Grupo de Matthias">
          <span className="chronicles-panel-kicker">GRUPO · 1–4 SELECCIONAR</span>
          <div className="chronicles-party-preview" data-condition={selectedCondition} data-relic={selectedRelic || undefined}>
            <img
              className="chronicles-party-preview-image"
              src={chroniclesPartyPortraitUrl(selectedMember.id)}
              alt={`Retrato de ${selectedMember.name}`}
              data-chronicles-party-renderer="authored"
              data-member-id={selectedMember.id}
              draggable="false"
            />
            <div className="chronicles-party-preview-copy">
              <span>{selectedMember?.role}</span>
              <strong>{selectedMember?.name}</strong>
              <small>{selectedMember?.attackName} · alcance {selectedMember?.reach}</small>
            </div>
          </div>
          {state.party.map((member, index) => {
            return (
              <button
                type="button"
                key={member.id}
                className={`chronicles-party-member ${member.id === 'matthias' ? 'is-leader' : ''} ${member.id === selectedMemberId ? 'is-selected' : ''} ${member.hp <= 0 ? 'is-down' : ''}`}
                onClick={() => setSelectedMemberId(member.id)}
                disabled={expeditionOver}
                aria-label={`Seleccionar ${member.name}`}
                aria-pressed={member.id === selectedMemberId}
              >
                <span className="chronicles-party-glyph has-authored-portrait" aria-hidden="true">
                  <img
                    className="chronicles-party-thumbnail"
                    src={chroniclesPartyPortraitUrl(member.id)}
                    alt=""
                    draggable="false"
                    data-chronicles-party-thumbnail={member.id}
                  />
                </span>
                <span><strong>{index + 1}. {member.name}</strong><small>{member.row === 'front' ? 'FRENTE' : 'RETAGUARDIA'} · {member.attackName} · alcance {member.reach}</small></span>
                <b>{member.hp}/{member.maxHp}</b>
              </button>
            );
          })}
        </aside>

        <main className="chronicles-stage-wrap">
          <div className="chronicles-statusbar" aria-live="polite">
            <span>CRIPTA <b>01</b></span>
            <span>RUMBO <b>{direction.label}</b></span>
            <span>ACTIVO <b>{selectedMember?.name}</b></span>
            <span>OBJETIVO <b>{objective}</b></span>
            <button
              type="button"
              className="chronicles-map-trigger"
              aria-label={automapOpen ? 'Cerrar automapa' : 'Abrir automapa'}
              aria-expanded={automapOpen}
              aria-controls="chronicles-automap"
              onClick={() => {
                clearTouchHold();
                setMenuOpen(false);
                setAutomapOpen((open) => !open);
              }}
            >
              <i aria-hidden="true">⌖</i><b>MAPA</b>
            </button>
            <details
              className="chronicles-game-menu"
              open={menuOpen}
              onToggle={(event) => setMenuOpen(event.currentTarget.open)}
            >
              <summary aria-label={menuOpen ? 'Cerrar menú de Chronicles' : 'Abrir menú de Chronicles'}>
                ☰ <b>MENÚ</b>
              </summary>
              <div className="chronicles-game-menu__panel">
                <strong>Chronicles of Matthias</strong>
                <small>La expedición queda guardada.</small>
                <button type="button" onClick={() => setMenuOpen(false)}>Continuar</button>
                <button type="button" onClick={exitChronicles}>Salir</button>
              </div>
            </details>
          </div>

          <div className="chronicles-stage">
            <div ref={hostRef} className="chronicles-three" data-chronicles-renderer="three" aria-label="Mazmorra 3D en primera persona de Chronicles of Matthias" />
            <div className="chronicles-vignette" aria-hidden="true" />
            <div className="chronicles-crosshair" aria-hidden="true">·</div>
            <ChroniclesNarratorOverlay message={state.message} />
            <ChroniclesPartyBark key={partyBark?.token || 'none'} bark={partyBark} />
            <ChroniclesTacticalMargin target={tacticalTarget} />
            <ChroniclesEnemyRetaliationFx key={retaliationCue?.token || 'none'} cue={retaliationCue} />
            {rendererError && <div className="chronicles-renderer-error" role="alert">{rendererError}</div>}
            {state.phase === 'defeated' && <ChroniclesDefeatOverlay onRestart={restart} onExit={exitChronicles} />}
            {state.phase === 'escaped' && <ChroniclesBookOneEpilogue state={state} onRestart={restart} />}
          </div>

          <details className="chronicles-journal" aria-label="Crónica de expedición">
            <summary>
              <span><i aria-hidden="true">✦</i><b>Crónica de expedición</b><small>{latestJournalEntry?.title}</small></span>
              <em>{journalEntries.length} {journalEntries.length === 1 ? 'folio' : 'folios'}</em>
            </summary>
            <ol>
              {journalEntries.map((entry) => (
                <li key={entry.id}>
                  <span aria-hidden="true">{entry.sigil}</span>
                  <div><strong>{entry.title}</strong><p>{entry.body}</p></div>
                </li>
              ))}
            </ol>
          </details>

          {!expeditionOver && (
            <>
              <div className="chronicles-touch" aria-label="Controles de la mazmorra">
                <button
                  type="button"
                  data-chronicles-touch-action="turn-left"
                  onPointerDown={(event) => startTouchHold('turn-left', event)}
                  onPointerUp={clearTouchHold}
                  onPointerCancel={clearTouchHold}
                  onLostPointerCapture={clearTouchHold}
                  onClick={(event) => activateTouchAction('turn-left', event)}
                  aria-label="Girar a la izquierda"
                >↶<small>GIRAR</small></button>
                <button
                  type="button"
                  data-chronicles-touch-action="forward"
                  onPointerDown={(event) => startTouchHold('forward', event)}
                  onPointerUp={clearTouchHold}
                  onPointerCancel={clearTouchHold}
                  onLostPointerCapture={clearTouchHold}
                  onClick={(event) => activateTouchAction('forward', event)}
                  aria-label="Avanzar"
                >↑<small>AVANZAR</small></button>
                <button type="button" className="is-attack" onClick={attackWithSelected} aria-label="Atacar">⚔<small>{selectedMember?.name?.toUpperCase() || 'ATACAR'}</small></button>
                <button
                  type="button"
                  data-chronicles-touch-action="backward"
                  onPointerDown={(event) => startTouchHold('backward', event)}
                  onPointerUp={clearTouchHold}
                  onPointerCancel={clearTouchHold}
                  onLostPointerCapture={clearTouchHold}
                  onClick={(event) => activateTouchAction('backward', event)}
                  aria-label="Retroceder"
                >↓<small>ATRÁS</small></button>
                <button
                  type="button"
                  data-chronicles-touch-action="turn-right"
                  onPointerDown={(event) => startTouchHold('turn-right', event)}
                  onPointerUp={clearTouchHold}
                  onPointerCancel={clearTouchHold}
                  onLostPointerCapture={clearTouchHold}
                  onClick={(event) => activateTouchAction('turn-right', event)}
                  aria-label="Girar a la derecha"
                >↷<small>GIRAR</small></button>
              </div>

              <div className="chronicles-keyboard-help">
                <span><kbd>W</kbd>/<kbd>↑</kbd> avanzar</span>
                <span><kbd>S</kbd>/<kbd>↓</kbd> retroceder</span>
                <span><kbd>A</kbd><kbd>D</kbd> girar</span>
                <span><kbd>1</kbd>–<kbd>4</kbd> pieza</span>
                <span><kbd>ESPACIO</kbd> atacar</span>
                <span><kbd>M</kbd> mapa</span>
              </div>
            </>
          )}
        </main>
      </div>

      <ChroniclesAutomap
        open={automapOpen}
        state={state}
        visitedCells={automapVisitedByMap[state.mapId] || []}
        onClose={() => setAutomapOpen(false)}
      />
    </div>
  );
}
