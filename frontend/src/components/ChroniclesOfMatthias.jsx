import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHRONICLES_DIRECTIONS,
  chroniclesActiveEnemies,
  CHRONICLES_PARTY,
  chroniclesEnemyTargetAhead,
  chroniclesContextualContentAction,
  chroniclesPartyAttackStats,
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
import { chroniclesClearRuntimeMapDefinitions, chroniclesMapForState } from '../chronicles/chroniclesMapCatalog.js';
import { chroniclesRegionHudLocation } from '../chronicles/chroniclesRegionHud.js';
import { chroniclesGridExplorationStep } from '../chronicles/chroniclesGridExplorationStep.js';
import { chroniclesInitializeLostKingIntro } from '../chronicles/chroniclesLostKingIntro.js';
import { CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID } from '../chronicles/chroniclesSwordhavenReturnPortal.js';
import {
  chroniclesCheckpointState,
  chroniclesListRemoteRuns,
  chroniclesDeleteRemoteRun,
} from '../chronicles/chroniclesRunClient.js';
import { loadChroniclesCharacterDraft } from '../chronicles/chroniclesCharacterDraft.js';
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
  beginChroniclesRun,
  chroniclesListSavedRuns,
  chroniclesMergeRemoteSavedRuns,
  chroniclesSaveCatalogOwner,
  chroniclesMarkSavedRunRemote,
  chroniclesSelectedRunIsRemote,
  chroniclesSelectSavedRun,
  chroniclesRenameSavedRun,
  chroniclesForgetSavedRun,
  chroniclesNoteSavedRunCheckpoint,
  chroniclesRunEntryMapId,
  finishChroniclesRun,
  renewChroniclesRun,
} from '../chronicles/chroniclesRunIdentity.js';
import { chroniclesPartyCondition } from '../chroniclesOfMatthiasPartyCondition.js';
import { chroniclesPartyRelic } from '../chroniclesOfMatthiasRelics.js';
import { chroniclesRetaliationCue } from '../chroniclesOfMatthiasRetaliation.js';
import { chroniclesTargetAhead } from '../chroniclesOfMatthiasTargeting.js';
import { CHRONICLES_TURN_ENGINE_VERSION } from '../chroniclesOfMatthiasTurns.js';
import {
  applyChroniclesProgressionToTacticsState,
  applyChroniclesTacticsProgression,
  chroniclesHeroProgress,
  loadChroniclesProgression,
  reconcileChroniclesProgressionInTacticsState,
  saveChroniclesProgression,
  setChroniclesCharacterBuild,
  spendChroniclesAttributePoint,
  unlockChroniclesSkill,
} from '../chroniclesOfMatthiasProgression.js';
import {
  chroniclesAutomapMarkVisited,
  clearChroniclesAutomapVisited,
  loadChroniclesAutomapVisited,
  saveChroniclesAutomapVisited,
} from '../chronicles/chroniclesAutomap.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import ChroniclesAutomap from './ChroniclesAutomap.jsx';
import ChroniclesCharacterSheet from './ChroniclesCharacterSheet.jsx';
import ChroniclesMinimap from './ChroniclesMinimap.jsx';
import ChroniclesBookOneEpilogue from './ChroniclesBookOneEpilogue.jsx';
import ChroniclesCharacterSetup from './ChroniclesCharacterSetup.jsx';
import ChroniclesSaveMenu from './ChroniclesSaveMenu.jsx';
import ChroniclesDefeatOverlay from './ChroniclesDefeatOverlay.jsx';
import ChroniclesEnemyRetaliationFx from './ChroniclesEnemyRetaliationFx.jsx';
import ChroniclesInitiativeRail from './ChroniclesInitiativeRail.jsx';
import ChroniclesNarratorOverlay from './ChroniclesNarratorOverlay.jsx';
import ChroniclesPartyBark from './ChroniclesPartyBark.jsx';
import ChroniclesTacticalMargin from './ChroniclesTacticalMargin.jsx';
import useChroniclesLandscape, {
  releaseChroniclesLandscape,
  requestChroniclesLandscapeOnEntry,
} from './useChroniclesLandscape.js';
import './ChroniclesOfMatthias.css';
import './ChroniclesCharacterSheet.css';
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
  q: 'strafe-left', Q: 'strafe-left', e: 'strafe-right', E: 'strafe-right',
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

function BootstrapFailure({ error, onRetry, onMenu, onExit }) {
  const aborted = error?.code === CHRONICLES_BOOTSTRAP_ERROR_CODES.aborted;
  return (
    <div className="menu chronicles-bootstrap">
      <section className="menu-section" role="alert" aria-live="assertive">
        <span className="section-label">EXPEDICIÓN NO INICIADA</span>
        <h2>No se pudo preparar Chronicles</h2>
        <p>El mundo autoritativo no superó el arranque. No se cargará la cripta local como sustituto.</p>
        <p className="hint-text">Código {error?.code || CHRONICLES_BOOTSTRAP_ERROR_CODES.unknown}{error?.requestId ? ` · ${error.requestId}` : ''}</p>
        <div className="game-controls">
          {!aborted && <button type="button" className="primary-btn" onClick={onRetry}>Reintentar</button>}
          <button type="button" className="secondary-btn" onClick={onMenu}>Volver a expediciones</button>
          <button type="button" className="secondary-btn" onClick={onExit}>Salir de Chronicles</button>
        </div>
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
  const progressionRef = useRef(progression);
  const [characterSetupDone, setCharacterSetupDone] = useState(false);
  // Restore an unfinished character editor draft; otherwise display the
  // expedition book before allocating or loading any server run.
  const [entryView, setEntryView] = useState(() => loadChroniclesCharacterDraft(CHRONICLES_PARTY) ? 'setup' : 'menu');
  const [savesRefreshKey, refreshSaves] = useState(0);
  const [saveInventory, setSaveInventory] = useState(null);
  const [saveMenuLoading, setSaveMenuLoading] = useState(false);
  const [saveMenuError, setSaveMenuError] = useState('');
  const [saveMenuBusy, setSaveMenuBusy] = useState(null);
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
  const [sheetMemberId, setSheetMemberId] = useState(null);
  const selectedMemberIdRef = useRef(selectedMemberId);
  const partyHotkeyRef = useRef({ key: '', at: 0 });
  const [rendererError, setRendererError] = useState('');
  const [retaliationCue, setRetaliationCue] = useState(null);
  const [partyBark, setPartyBark] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [automapOpen, setAutomapOpen] = useState(false);
  const [automapVisitedByMap, setAutomapVisitedByMap] = useState({});
  const touchHoldRef = useRef({ delayId: null, repeatId: null });
  const { needsRotation, lockState, activateLandscape } = useChroniclesLandscape(characterSetupDone);

  // Reconcile server-owned expeditions only while browsing the save book.
  // Cleanup discards stale results after navigating away or switching flows.
  useEffect(() => {
    if (entryView !== 'menu') return undefined;
    const controller = new AbortController();
    const ownerAtRequest = chroniclesSaveCatalogOwner();
    let active = true;
    setSaveMenuLoading(true);
    setSaveMenuError('');
    setSaveInventory(chroniclesListSavedRuns(FIRST_PERSON_RUN_SCOPE));
    void chroniclesListRemoteRuns({ signal: controller.signal })
      .then((rows) => {
        if (!active) return;
        setSaveInventory(chroniclesMergeRemoteSavedRuns(FIRST_PERSON_RUN_SCOPE, rows, { expectedOwner: ownerAtRequest }));
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setSaveMenuError('No se pudo consultar el servidor. Se muestran los guardados locales; inténtalo de nuevo cuando vuelva la conexión.');
        setSaveInventory(chroniclesListSavedRuns(FIRST_PERSON_RUN_SCOPE));
      })
      .finally(() => {
        if (active) setSaveMenuLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [entryView, savesRefreshKey]);

  useEffect(() => {
    selectedMemberIdRef.current = selectedMemberId;
  }, [selectedMemberId]);

  useEffect(() => {
    progressionRef.current = progression;
  }, []);

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
    void releaseChroniclesLandscape();
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
    void requestChroniclesLandscapeOnEntry();
    const selected = setChroniclesCharacterBuild(progression, build);
    if (!selected.updated) return;
    const saved = saveChroniclesProgression(selected.progression);
    progressionRef.current = saved;
    stateRef.current = null;
    staleRunRecoveryAttemptedRef.current = false;
    setProgression(saved);
    setSelectedMemberId('matthias');
    setSheetMemberId(null);
    setState(null);
    setReady(false);
    setBootstrapError(null);
    setRendererError('');
    setAutomapOpen(false);
    setAutomapVisitedByMap({});
    setCharacterSetupDone(true);
    setEntryView('playing');
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
      const exploratoryNext = actionType === 'attack' ? current : chroniclesGridExplorationStep(current, action);
      const attackingMember = actionType === 'attack' && typeof action === 'object'
        ? current.party.find((member) => member.id === action.memberId)
        : null;
      const forcedTarget = attackingMember
        ? chroniclesEnemyTargetAhead(current, chroniclesPartyAttackStats(current, attackingMember.id).reach)
        : null;
      const partyAgilityBonuses = Object.fromEntries(
        (current.party || []).map((member) => [
          member.id,
          Number(chroniclesHeroProgress(progressionRef.current, member.id).attributes?.agility || 0),
        ]),
      );
      // Entering an area is not a tactical movement inside it. The player
      // gets to see the new room/return portal before enemies can engage.
      const transitionedMap = exploratoryNext?.mapId !== current.mapId;
      const started = transitionedMap ? exploratoryNext : chroniclesStartInitiativeCombat(
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

    const actorMemberId = typeof action === 'object' && action?.memberId
      ? action.memberId
      : activeActor?.kind === 'party'
        ? activeActor.id
        : selectedMemberIdRef.current;
    const progressResult = applyChroniclesTacticsProgression(
      progressionRef.current,
      current,
      next,
      {
        actorMemberId,
        actionKind: actionType,
        runId: activeRunIdRef.current,
      },
    );
    if (progressResult.awards.length || progressResult.levelUps.length) {
      const saved = saveChroniclesProgression(progressResult.progression);
      progressionRef.current = saved;
      setProgression(saved);
      next = reconcileChroniclesProgressionInTacticsState(next, saved);
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
      }, 1800);
    }
  }, []);

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

  }, [clearTouchHold, dispatch]);

  const activateTouchAction = useCallback((action, event) => {
    // Pointer input already fires on pointerdown so taps feel immediate. Keyboard
    // and assistive activation arrive as click(detail=0) and still get one action.
    if (event.detail === 0) dispatch(action);
  }, [dispatch]);

  useEffect(() => {
    const current = stateRef.current;
    const actor = chroniclesCurrentInitiativeActor(current?.initiative);
    if (sheetMemberId || !current?.initiative || actor?.kind !== 'enemy' || current.phase === 'defeated') return undefined;

    const timer = window.setTimeout(() => {
      const latest = stateRef.current;
      const latestActor = chroniclesCurrentInitiativeActor(latest?.initiative);
      if (!latest?.initiative || latestActor?.kind !== 'enemy' || latestActor.id !== actor.id) return;
      const acted = chroniclesResolveEnemyActor(latest, actor.id);
      const cue = chroniclesRetaliationCue(latest, acted);
      if (cue) {
        const token = retaliationSequenceRef.current + 1;
        retaliationSequenceRef.current = token;
        if (retaliationTimerRef.current) clearTimeout(retaliationTimerRef.current);
        setRetaliationCue({ ...cue, token });
        retaliationTimerRef.current = setTimeout(() => {
          setRetaliationCue((active) => active?.token === token ? null : active);
        }, 1800);
      }
      const advanced = acted.phase === 'defeated'
        ? acted
        : chroniclesAdvanceCombatInitiative(acted, chroniclesActiveEnemies(acted));
      stateRef.current = advanced;
      setState(advanced);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [sheetMemberId, state?.initiative?.cursor, state?.initiative?.round, state?.phase]);

  useEffect(() => {
    const actor = chroniclesCurrentInitiativeActor(state?.initiative);
    if (actor?.kind !== 'party' || actor.id === selectedMemberIdRef.current) return;
    selectedMemberIdRef.current = actor.id;
    setSelectedMemberId(actor.id);
  }, [state?.initiative?.cursor, state?.initiative?.round]);

  const interactWithContext = useCallback(() => {
    const current = stateRef.current;
    if (!current || current.phase === 'defeated' || current.phase === 'escaped') return;
    dispatch('interact');
  }, [dispatch]);

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
      && chroniclesEnemyTargetAhead(current, chroniclesPartyAttackStats(current, member.id).reach);
    if (!startsCombat) engineRef.current?.playAttack?.(memberId);
    dispatch({ type: 'attack', memberId });
  }, [dispatch]);

  const applyLiveProgression = useCallback((nextProgression) => {
    const saved = saveChroniclesProgression(nextProgression);
    progressionRef.current = saved;
    setProgression(saved);
    const current = stateRef.current;
    if (!current) return;
    const reconciled = reconcileChroniclesProgressionInTacticsState(current, saved);
    stateRef.current = reconciled;
    setState(reconciled);
  }, []);

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

  const openMemberSheet = useCallback((memberId) => {
    clearTouchHold();
    setAutomapOpen(false);
    setMenuOpen(false);
    const actor = chroniclesCurrentInitiativeActor(stateRef.current?.initiative);
    if (actor?.kind !== 'party' || actor.id === memberId) {
      selectedMemberIdRef.current = memberId;
      setSelectedMemberId(memberId);
    }
    setSheetMemberId(memberId);
  }, [clearTouchHold]);

  const newExpedition = useCallback(() => {
    const runId = activeRunIdRef.current;
    // Starting another game does not destroy the checkpoint of the old one.
    // The catalog keeps both identities loadable.
    const newRunId = beginChroniclesRun(FIRST_PERSON_RUN_SCOPE);
    activeRunIdRef.current = newRunId;
    authoritativeRunRef.current = null;
    checkpointFingerprintRef.current = '';
    checkpointQueueRef.current = Promise.resolve();
    stateRef.current = null;
    setState(null);
    setSelectedMemberId('matthias');
    setSheetMemberId(null);
    setReady(false);
    setBootstrapError(null);
    setRendererError('');
    setAutomapOpen(false);
    setAutomapVisitedByMap({});
    staleRunRecoveryAttemptedRef.current = false;
    setMenuOpen(false);
    setBootstrapRevision((revision) => revision + 1);
  }, []);

  const restart = useCallback(() => {
    if (activeRunIdRef.current) {
      clearChroniclesAutomapVisited(activeRunIdRef.current);
      finishChroniclesRun(FIRST_PERSON_RUN_SCOPE, activeRunIdRef.current);
      activeRunIdRef.current = null;
    }
    stateRef.current = null;
    setState(null);
    setSelectedMemberId('matthias');
    setSheetMemberId(null);
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
    if (!characterSetupDone || entryView !== 'playing') return undefined;
    const controller = new AbortController();
    let active = true;

    setBootstrapError(null);
    const operationId = ensureChroniclesRun(FIRST_PERSON_RUN_SCOPE);
    const remoteSelection = chroniclesSelectedRunIsRemote(FIRST_PERSON_RUN_SCOPE, operationId);
    activeRunIdRef.current = operationId;

    // Overlap renderer chunk loading with the authoritative world bootstrap.
    // Gameplay still stays fail-closed until the backend bundle validates.
    void loadChroniclesFirstPersonRenderer().catch(() => {});

    const activeProgression = progressionRef.current;
    chroniclesBootstrapWorld({
      mapId: chroniclesRunEntryMapId(FIRST_PERSON_RUN_SCOPE),
      signal: controller.signal,
      operationId,
      resumeRunId: remoteSelection ? operationId : null,
      partyLevel: chroniclesDeployedPartyLevel(activeProgression),
    })
      .then((world) => {
        if (!active) return;
        const progressed = applyChroniclesProgressionToTacticsState(
          createChroniclesState(null, activeProgression.characterBuild),
          activeProgression,
        );
        const restored = chroniclesApplyRunCheckpoint(progressed, world);
        const next = chroniclesInitializeLostKingIntro(restored, {
          fresh: !remoteSelection && world.worldVersion === 0,
        });
        authoritativeRunRef.current = world;
        chroniclesMarkSavedRunRemote(FIRST_PERSON_RUN_SCOPE, operationId);
        // Compare against the server snapshot so the new commission is written
        // immediately and survives F5 even before the first movement.
        checkpointFingerprintRef.current = chroniclesRunCheckpointFingerprint(restored);
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
        if (error?.status === 409 && !remoteSelection && !staleRunRecoveryAttemptedRef.current) {
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
  }, [bootstrapRevision, characterSetupDone, entryView]);

  useEffect(() => {
    let cancelled = false;
    let engine = null;
    const host = hostRef.current;
    if (!ready || !stateRef.current || !host) return undefined;

    void loadChroniclesFirstPersonRenderer()
      .then(({ createChroniclesOfMatthiasGame }) => {
        if (cancelled) return;
        engine = createChroniclesOfMatthiasGame(host, {
          initialState: stateRef.current,
          onContentClick: (contentId) => {
            const current = stateRef.current;
            const contextual = chroniclesContextualContentAction(current);
            if (contextual?.id !== contentId) return;
            dispatch('interact');
          },
        });
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
  }, [dispatch, ready, state?.mapId]);

  useEffect(() => { engineRef.current?.renderState(state); }, [state]);

  useEffect(() => {
    const run = authoritativeRunRef.current;
    if (!ready || !state || !run?.runId) return;
    const fingerprint = chroniclesRunCheckpointFingerprint(state);
    if (!fingerprint || fingerprint === checkpointFingerprintRef.current) return;
    checkpointFingerprintRef.current = fingerprint;
    const snapshot = state;
    const scheduledRunId = run.runId;

    checkpointQueueRef.current = checkpointQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const currentRun = authoritativeRunRef.current;
        if (!currentRun?.runId || currentRun.runId !== scheduledRunId) return;
        const updated = await chroniclesCheckpointState(
          scheduledRunId,
          snapshot,
          currentRun.worldVersion,
          { terminalStatus: snapshot.phase === 'escaped' ? 'completed' : null },
        );
        if (authoritativeRunRef.current?.runId !== scheduledRunId) return;
        authoritativeRunRef.current = { ...currentRun, ...updated };
        chroniclesNoteSavedRunCheckpoint(FIRST_PERSON_RUN_SCOPE, scheduledRunId, snapshot.mapId);
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
      if (automapOpen || sheetMemberId || current.phase === 'defeated' || current.phase === 'escaped') return;
      if (/^[1-4]$/.test(event.key)) {
        if (event.repeat) return;
        const member = current.party[Number(event.key) - 1];
        if (member) {
          event.preventDefault();
          const now = performance.now();
          const previous = partyHotkeyRef.current;
          const doubleTap = previous.key === event.key && now - previous.at <= 900;
          partyHotkeyRef.current = doubleTap ? { key: '', at: 0 } : { key: event.key, at: now };
          if (doubleTap) openMemberSheet(member.id);
          else {
            selectedMemberIdRef.current = member.id;
            setSelectedMemberId(member.id);
          }
        }
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        if (chroniclesContextualContentAction(current)) {
          event.preventDefault();
          interactWithContext();
          return;
        }
      }
      if (event.key === ' ') {
        event.preventDefault();
        attackWithSelected();
        return;
      }
      const action = KEY_ACTIONS[event.key];
      if (!action) return;
      event.preventDefault();
      if (event.repeat) return; // discrete grid step, independent of OS repeat rate
      dispatch(action);
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [attackWithSelected, automapOpen, clearTouchHold, dispatch, interactWithContext, openMemberSheet, ready, sheetMemberId]);

  const startFreshGame = () => {
    beginChroniclesRun(FIRST_PERSON_RUN_SCOPE);
    setCharacterSetupDone(false);
    setEntryView('setup');
    refreshSaves((value) => value + 1);
  };

  const loadSavedGame = (runId) => {
    if (!chroniclesSelectSavedRun(FIRST_PERSON_RUN_SCOPE, runId)) return;
    // Loading an existing expedition skips character setup; use this click to
    // request the same native fullscreen/orientation affordance as New game.
    void requestChroniclesLandscapeOnEntry();
    activeRunIdRef.current = null;
    authoritativeRunRef.current = null;
    checkpointFingerprintRef.current = '';
    stateRef.current = null;
    setState(null);
    setReady(false);
    setBootstrapError(null);
    setCharacterSetupDone(true);
    setEntryView('playing');
    setBootstrapRevision((revision) => revision + 1);
  };

  const returnToSaveMenu = () => {
    setMenuOpen(false);
    clearTouchHold();
    // Never switch the authoritative run pointer while a checkpoint is queued.
    void checkpointQueueRef.current.catch(() => undefined).then(() => {
      stateRef.current = null;
      activeRunIdRef.current = null;
      authoritativeRunRef.current = null;
      setState(null);
      setReady(false);
      setBootstrapError(null);
      setRendererError('');
      checkpointFingerprintRef.current = '';
      setCharacterSetupDone(false);
      setSaveInventory(null);
      setEntryView('menu');
      refreshSaves((value) => value + 1);
    });
  };

  if (entryView === 'menu') {
    return (
      <ChroniclesSaveMenu
        saves={saveInventory ?? chroniclesListSavedRuns(FIRST_PERSON_RUN_SCOPE)}
        loading={saveMenuLoading}
        error={saveMenuError}
        busyRunId={saveMenuBusy}
        onRetrySync={() => refreshSaves((value) => value + 1)}
        onNew={startFreshGame}
        onLoad={loadSavedGame}
        onRename={(id, title) => {
          const result = chroniclesRenameSavedRun(FIRST_PERSON_RUN_SCOPE, id, title);
          if (result) refreshSaves((value) => value + 1);
          return result;
        }}
        onDelete={async (id, remote) => {
          if (saveMenuBusy !== null) return false;
          setSaveMenuBusy(id);
          setSaveMenuError('');
          try {
            if (remote) await chroniclesDeleteRemoteRun(id);
            if (!chroniclesForgetSavedRun(FIRST_PERSON_RUN_SCOPE, id)) return false;
            setSaveInventory(chroniclesListSavedRuns(FIRST_PERSON_RUN_SCOPE));
            refreshSaves((value) => value + 1);
            return true;
          } catch {
            setSaveMenuError('No se pudo eliminar la expedición del servidor. No se ha retirado de tu lista.');
            return false;
          } finally {
            setSaveMenuBusy(null);
          }
        }}
        onExit={exitChronicles}
      />
    );
  }

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
    return <BootstrapFailure error={bootstrapError} onRetry={retryBootstrap} onMenu={returnToSaveMenu} onExit={exitChronicles} />;
  }
  if (!ready || !state) return <BootstrapStatus />;

  const direction = CHRONICLES_DIRECTIONS[state.direction];
  const objective = chroniclesObjective(state);
  const locationHud = chroniclesRegionHudLocation(chroniclesMapForState(state));
  const selectedMember = state.party.find((member) => member.id === selectedMemberId) || state.party[0];
  const selectedCondition = chroniclesPartyCondition(selectedMember);
  const selectedRelic = chroniclesPartyRelic(state, selectedMember?.id);
  const selectedAttackStats = chroniclesPartyAttackStats(state, selectedMember?.id);
  const tacticalTarget = chroniclesTargetAhead(state, selectedAttackStats.reach || 1);
  const sheetMember = sheetMemberId
    ? state.party.find((member) => member.id === sheetMemberId) || null
    : null;
  const journalEntries = chroniclesJournalEntries(state);
  const latestJournalEntry = journalEntries[journalEntries.length - 1];
  const expeditionOver = state.phase === 'defeated' || state.phase === 'escaped';
  const contextualAction = chroniclesContextualContentAction(state);
  const activeInitiativeActor = chroniclesCurrentInitiativeActor(state.initiative);

  return (
    <div
      className="chronicles"
      data-chronicles="true"
      data-chronicles-map-id={state.mapId}
      data-chronicles-turns={state.turns}
      data-chronicles-phase={state.phase}
      data-chronicles-turn-engine={CHRONICLES_TURN_ENGINE_VERSION}
      data-chronicles-initiative-die={state.initiative?.die || undefined}
      data-chronicles-initiative-actor={activeInitiativeActor?.id || ''}
      data-turn-phase={state.turnPhase || 'party'}
      data-party-hp-total={state.party.reduce((total, member) => total + Number(member.hp || 0), 0)}
      role="region"
      aria-label="Chronicles of Matthias"
    >
      <div className="chronicles-shell">
        <aside className="chronicles-party" aria-label="Grupo de Matthias">
          <span className="chronicles-panel-kicker">GRUPO · 1–4 SELECCIONAR · DOBLE FICHA</span>
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
              <small>{selectedMember?.attackName} · daño {selectedAttackStats.damage} · alcance {selectedAttackStats.reach}</small>
            </div>
          </div>
          {state.party.map((member, index) => {
            return (
              <button
                type="button"
                key={member.id}
                className={`chronicles-party-member ${member.id === 'matthias' ? 'is-leader' : ''} ${member.id === selectedMemberId ? 'is-selected' : ''} ${member.hp <= 0 ? 'is-down' : ''}`}
                onClick={() => openMemberSheet(member.id)}
                disabled={expeditionOver}
                aria-label={`Seleccionar ${member.name}`}
                title={`Seleccionar y abrir ficha de ${member.name}`}
                aria-pressed={member.id === selectedMemberId}
                data-member-hp={member.hp}
                data-damage-hit={retaliationCue?.targetId === member.id ? 'true' : undefined}
              >
                <span className="chronicles-party-glyph has-authored-portrait" aria-hidden="true">
                  <img
                    className="chronicles-party-thumbnail"
                    src={chroniclesPartyPortraitUrl(member.id)}
                    alt=""
                    draggable="false"
                    data-chronicles-party-thumbnail={member.id}
                  />
                  {retaliationCue?.targetId === member.id ? (
                    <span
                      key={retaliationCue.token}
                      className="chronicles-party-damage-slash"
                    />
                  ) : null}
                </span>
                <span><strong>{index + 1}. {member.name}</strong><small>Nv {chroniclesHeroProgress(progression, member.id).level} · {member.row === 'front' ? 'FRENTE' : 'RETAGUARDIA'} · clic · ficha</small></span>
                <b>{member.hp}/{member.maxHp}</b>
              </button>
            );
          })}
        </aside>

        <main className="chronicles-stage-wrap">
          <div className="chronicles-statusbar" aria-live="polite">
            <span>{locationHud.kind} <b>{locationHud.value}</b></span>
            <span>RUMBO <b>{direction.label}</b></span>
            <span>ACTIVO <b>{selectedMember?.name}</b></span>
            <span>OBJETIVO <b>{objective}</b></span>
            {needsRotation && (
              <button
                type="button"
                className="chronicles-landscape-trigger"
                data-lock-state={lockState}
                aria-label="Activar apaisado"
                title={lockState === 'rejected' ? 'El navegador necesita otro toque para girar Chronicles.' : 'Girar Chronicles a apaisado'}
                onClick={() => { void activateLandscape(); }}
              >
                <span aria-hidden="true">↻</span>
              </button>
            )}
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
                <small>Salir conserva esta run. Nueva expedición crea otra ruta aleatoria.</small>
                <button type="button" onClick={() => setMenuOpen(false)}>Continuar</button>
                <button type="button" onClick={newExpedition}>Nueva expedición</button>
                <button type="button" onClick={returnToSaveMenu}>Partidas guardadas</button>
                <button type="button" onClick={exitChronicles}>Salir y guardar</button>
              </div>
            </details>
          </div>

          <div className="chronicles-stage">
            <div ref={hostRef} className="chronicles-three" data-chronicles-renderer="three" aria-label="Mazmorra 3D en primera persona de Chronicles of Matthias" />
            <div className="chronicles-vignette" aria-hidden="true" />
            <div className="chronicles-crosshair" aria-hidden="true">·</div>
            <ChroniclesMinimap
              state={state}
              visitedCells={automapVisitedByMap[state.mapId] || []}
              hidden={automapOpen || expeditionOver}
              onExpand={() => {
                clearTouchHold();
                setMenuOpen(false);
                setAutomapOpen(true);
              }}
            />
            <ChroniclesInitiativeRail initiative={state.initiative} />
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
                <button
                  type="button"
                  className="is-attack"
                  data-chronicles-touch-action="attack"
                  onClick={attackWithSelected}
                  aria-label="Atacar"
                >⚔<small>{selectedMember?.name?.toUpperCase() || 'ATACAR'}</small></button>
                {contextualAction && (
                  <button
                    type="button"
                    className="is-contextual"
                    data-chronicles-touch-action="interact"
                    onClick={interactWithContext}
                    aria-label={contextualAction.label}
                  >✦<small>{contextualAction.id === CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID ? 'VOLVER' : 'USAR'}</small></button>
                )}
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
                <span><kbd>Q</kbd>/<kbd>E</kbd> desplazamiento lateral</span>
                <span><kbd>1</kbd>–<kbd>4</kbd> pieza</span>
                <span><kbd>ESPACIO</kbd> atacar</span>
                <span><kbd>F</kbd> usar/recoger</span>
                <span><kbd>M</kbd> mapa</span>
              </div>
            </>
          )}
        </main>
      </div>

      {sheetMember && (
        <ChroniclesCharacterSheet
          state={state}
          progression={progression}
          member={sheetMember}
          mode="first-person"
          onClose={() => setSheetMemberId(null)}
          onAllocateAttribute={allocateAttribute}
          onLearnSkill={learnSkill}
        />
      )}

      <ChroniclesAutomap
        open={automapOpen}
        state={state}
        visitedCells={automapVisitedByMap[state.mapId] || []}
        onClose={() => setAutomapOpen(false)}
      />
    </div>
  );
}
