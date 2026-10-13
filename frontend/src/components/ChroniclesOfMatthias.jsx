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
import { getAmbientVolume, setAmbientVolume } from '../sound.js';
import {
  getChroniclesFxVolume,
  setChroniclesFxVolume,
} from '../chronicles/chroniclesAudioSettings.js';
import { chroniclesPartyPortraitUrl } from '../chronicles/chroniclesPartyPortraitAssets.js';
import { chroniclesClearRuntimeMapDefinitions, chroniclesMapForState } from '../chronicles/chroniclesMapCatalog.js';
import { chroniclesRegionHudLocation } from '../chronicles/chroniclesRegionHud.js';
import { chroniclesGridExplorationStep } from '../chronicles/chroniclesGridExplorationStep.js';
import { chroniclesCheckpointReason } from '../chronicles/chroniclesSavePolicy.js';
import { chroniclesNpcDialogueForState } from '../chronicles/chroniclesNpcDialogue.js';
import { chroniclesInitializeLostKingIntro } from '../chronicles/chroniclesLostKingIntro.js';
import { chroniclesApplyArrival } from '../chronicles/chroniclesArrival.js';
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
  chroniclesRecoverLegacySavedRunIds,
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
import {
  chroniclesClearPlayingRun,
  chroniclesRememberPlayingRun,
  chroniclesShouldResumePlayingRun,
} from '../chronicles/chroniclesRefreshResume.js';
import { chroniclesPartyCondition } from '../chroniclesOfMatthiasPartyCondition.js';
import { chroniclesEquippedItem } from '../chronicles/chroniclesEquipment.js';
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
  chroniclesAutomapMarkSeen,
  chroniclesMapCoordinatesLabel,
  clearChroniclesAutomapVisited,
  loadChroniclesAutomapVisited,
  saveChroniclesAutomapVisited,
} from '../chronicles/chroniclesAutomap.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import ChroniclesAutomap from './ChroniclesAutomap.jsx';
import ChroniclesCharacterSheet from './ChroniclesCharacterSheet.jsx';
import ChroniclesShop from './ChroniclesShop.jsx';
import ChroniclesAudience from './ChroniclesAudience.jsx';
import ChroniclesGuild from './ChroniclesGuild.jsx';
import ChroniclesSpellMenu from './ChroniclesSpellMenu.jsx';
import {
  CHRONICLES_SPELLS, chroniclesMemberMaxSp, chroniclesMemberSp, chroniclesMemberSpells,
} from '../chronicles/chroniclesMagic.js';
import ChroniclesMinimap from './ChroniclesMinimap.jsx';
import ChroniclesCombatRoster, { chroniclesHealthBand } from './ChroniclesCombatRoster.jsx';
import ChroniclesBookOneEpilogue from './ChroniclesBookOneEpilogue.jsx';
import ChroniclesCharacterSetup from './ChroniclesCharacterSetup.jsx';
import ChroniclesSaveMenu from './ChroniclesSaveMenu.jsx';
import ChroniclesQuestLog, { chroniclesQuestLogEntries } from './ChroniclesQuestLog.jsx';
import ChroniclesJournalModal from './ChroniclesJournalModal.jsx';
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
import './ChroniclesMM3Chrome.css';
// The first-person folio must override both base and old MM3 chrome styles.
import './ChroniclesCharacterSheetMM3.css';

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
  const gameRootRef = useRef(null);
  const engineRef = useRef(null);
  const retaliationTimerRef = useRef(null);
  const retaliationSequenceRef = useRef(0);
  const partyBarkTimerRef = useRef(null);
  const partyBarkSequenceRef = useRef(0);
  const [progression, setProgression] = useState(() => loadChroniclesProgression());
  const progressionRef = useRef(progression);
  // A reload of a playing expedition must return straight to the server
  // checkpoint. An intentional visit to the expedition book stays in 'menu'.
  // Never create a new run as part of the initial render.
  const [entryView, setEntryView] = useState(() => {
    if (loadChroniclesCharacterDraft(CHRONICLES_PARTY)) return 'setup';
    return chroniclesShouldResumePlayingRun(FIRST_PERSON_RUN_SCOPE) ? 'playing' : 'menu';
  });
  const [characterSetupDone, setCharacterSetupDone] = useState(entryView === 'playing');
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
  const checkpointPendingRef = useRef(0);
  const pausedGameInputRef = useRef(false);
  const checkpointMapRef = useRef(null);
  const checkpointExistsRef = useRef(false);
  const automapVisitedRef = useRef({});
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
  const [fxVolume, setFxVolume] = useState(() => getChroniclesFxVolume());
  const [musicVolume, setMusicVolume] = useState(getAmbientVolume);
  const menuSummaryRef = useRef(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [chronicleModalOpen, setChronicleModalOpen] = useState(false);
  const [automapOpen, setAutomapOpen] = useState(false);
  const [spellMenuOpen, setSpellMenuOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [saveFailure, setSaveFailure] = useState(null);
  const [confirmExitWithoutSaving, setConfirmExitWithoutSaving] = useState(false);
  const [audience, setAudience] = useState(null);
  const audienceRef = useRef(null);
  const [automapVisitedByMap, setAutomapVisitedByMap] = useState({});
  const touchHoldRef = useRef({ delayId: null, repeatId: null });
  const { needsRotation, lockState, activateLandscape } = useChroniclesLandscape(characterSetupDone);

  // Real Brave/Chrome forced a light glyph despite matching !important CSS.
  // Applying an inline important override to the concrete DOM nodes was
  // verified to work in the affected browser. Never touch colored attack/
  // magic/contextual controls or the rest of the game's typography.
  useEffect(() => {
    if (!ready || !state || !gameRootRef.current) return;
    const nodes = gameRootRef.current.querySelectorAll([
      '.chronicles-statusbar .chronicles-map-trigger',
      '.chronicles-statusbar .chronicles-map-trigger b',
      '.chronicles-statusbar .chronicles-map-trigger i',
      '.chronicles-game-menu > summary',
      '.chronicles-game-menu > summary b',
      '.chronicles-touch button:not(.is-attack):not(.is-magic):not(.is-contextual)',
      '.chronicles-game-menu__panel button',
      '.chronicles-game-menu__panel button :is(b, span, small, strong, i)',
      '.chronicles-game-menu__panel legend',
      '.chronicles-game-menu__panel label',
      '.chronicles-game-menu__panel > strong',
      '.chronicles-game-menu__panel > small',
    ].join(', '));
    for (const node of nodes) {
      node.style.setProperty('color', '#08080a', 'important');
      node.style.setProperty('-webkit-text-fill-color', '#08080a', 'important');
      node.style.setProperty('-webkit-text-stroke-color', '#08080a', 'important');
      node.style.setProperty('color-scheme', 'light only', 'important');
    }
  }, [ready, state, menuOpen, confirmExitWithoutSaving]);

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
      .then(async (rows) => {
        if (!active) return;
        await chroniclesRecoverLegacySavedRunIds(FIRST_PERSON_RUN_SCOPE, rows, {
          expectedOwner: ownerAtRequest,
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;
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
    setAutomapVisitedByMap((visited) => chroniclesAutomapMarkSeen(visited, chroniclesMapForState(state), state));
  }, [state?.mapId, state?.x, state?.y]);

  // Map reveal is session-only until an explicit save or area transition.
  useEffect(() => {
    automapVisitedRef.current = automapVisitedByMap;
  }, [automapVisitedByMap]);

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
    chroniclesClearPlayingRun();
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
    if (audienceRef.current) {
      audienceRef.current = null;
      setAudience(null);
      return;
    }
    if (automapOpen) {
      setAutomapOpen(false);
      return;
    }
    setMenuOpen((open) => !open);
  }, { contextMenu: false, disabled: chronicleModalOpen });

  const confirmCharacterBuild = useCallback((build) => {
    void requestChroniclesLandscapeOnEntry();
    const selected = setChroniclesCharacterBuild(progression, build);
    if (!selected.updated) return;
    const saved = saveChroniclesProgression(selected.progression);
    chroniclesRememberPlayingRun(FIRST_PERSON_RUN_SCOPE, ensureChroniclesRun(FIRST_PERSON_RUN_SCOPE));
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

  // Keyboard and touch input must not mutate a snapshot while the menu is
  // open or a checkpoint is waiting for the server. Keep dispatch stable so
  // toggling the menu never recreates the WebGL renderer.
  useEffect(() => {
    pausedGameInputRef.current = menuOpen || saveBusy;
  }, [menuOpen, saveBusy]);

  const dispatch = useCallback((action) => {
    const current = stateRef.current;
    if (!current) return;

    const actionType = typeof action === 'string' ? action : action?.type;
    if (pausedGameInputRef.current) return current;
    // A held touch control must not keep moving the expedition behind an NPC.
    // The deliberate dialogue quest option alone may invoke 'interact'.
    if (audienceRef.current && actionType !== 'interact') return current;
    // A door in an MM3 town opens an audience instead of silently awarding
    // a quest from a stone wall. One more step into the facade enters.
    if (actionType === 'forward' && !current.initiative && current.phase === 'explore') {
      const face = CHRONICLES_DIRECTIONS[current.direction];
      const map = chroniclesMapForState(current);
      const nextTile = face ? map?.grid?.[current.y + face.dy]?.[current.x + face.dx] : null;
      const dialogue = nextTile === '#' ? chroniclesNpcDialogueForState(
        current, chroniclesContextualContentAction(current),
      ) : null;
      if (dialogue) {
        audienceRef.current = dialogue;
        setAudience(dialogue);
        return current;
      }
    }
    if (actionType === 'equip-item' || actionType === 'unequip-item'
      || actionType === 'shop-buy' || actionType === 'shop-sell' || actionType === 'shop-close'
      || actionType === 'guild-join' || actionType === 'guild-learn' || actionType === 'guild-close') {
      const updated = chroniclesReduce(current, action);
      if (updated !== current) {
        stateRef.current = updated;
        setState(updated);
      }
      return; // Equipping and trading are not movement ticks or combat actions.
    }
    const activeActor = chroniclesCurrentInitiativeActor(current.initiative);
    if (current.initiative && activeActor?.kind === 'enemy') return;
    if (
      current.initiative
      && (actionType === 'attack' || actionType === 'cast')
      && activeActor?.kind === 'party'
      && typeof action === 'object'
      && action.memberId !== activeActor.id
    ) return;

    let next;
    if (!current.initiative) {
      // An offensive spell opens combat exactly like a swing, at the spell's reach.
      const offensiveSpell = actionType === 'cast' && CHRONICLES_SPELLS[action.spellId]?.kind === 'attack'
        ? CHRONICLES_SPELLS[action.spellId]
        : null;
      const offensive = actionType === 'attack' || Boolean(offensiveSpell);
      const exploratoryNext = offensive ? current : chroniclesGridExplorationStep(current, action);
      const attackingMember = offensive && typeof action === 'object'
        ? current.party.find((member) => member.id === action.memberId)
        : null;
      const forcedTarget = attackingMember
        ? chroniclesEnemyTargetAhead(current, offensiveSpell?.reach ?? chroniclesPartyAttackStats(current, attackingMember.id).reach)
        : null;
      // Entering an area is not a tactical movement inside it. The player
      // gets to see the new room/return portal before enemies can engage.
      const transitionedMap = exploratoryNext?.mapId !== current.mapId;
      const started = transitionedMap ? exploratoryNext : chroniclesStartInitiativeCombat(
        exploratoryNext,
        chroniclesActiveEnemies(exploratoryNext),
        {
          forceEnemyIds: forcedTarget ? [forcedTarget.enemy.id] : [],
        },
      );
      next = started !== exploratoryNext
        ? started
        : offensive
          ? chroniclesReduce(current, action)
          : exploratoryNext;
    } else {
      next = chroniclesReduce(current, action);
      // A refused cast (no spell points, no target) keeps the hero's turn.
      const spentTurn = actionType !== 'cast' || next.turns !== current.turns;
      if (next !== current && spentTurn && next.phase !== 'defeated' && next.phase !== 'escaped') {
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
      // XP and attribute gains remain in this session until Save / area exit.
      progressionRef.current = progressResult.progression;
      setProgression(progressResult.progression);
      next = reconcileChroniclesProgressionInTacticsState(next, progressResult.progression);
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
    return next;
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
    if (sheetMemberId || menuOpen || saveBusy || !current?.initiative || actor?.kind !== 'enemy' || current.phase === 'defeated') return undefined;

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
  }, [sheetMemberId, menuOpen, saveBusy, state?.initiative?.cursor, state?.initiative?.round, state?.phase]);

  useEffect(() => {
    const actor = chroniclesCurrentInitiativeActor(state?.initiative);
    if (actor?.kind !== 'party' || actor.id === selectedMemberIdRef.current) return;
    selectedMemberIdRef.current = actor.id;
    setSelectedMemberId(actor.id);
  }, [state?.initiative?.cursor, state?.initiative?.round]);

  const interactWithContext = useCallback(() => {
    const current = stateRef.current;
    if (!current || current.phase === 'defeated' || current.phase === 'escaped') return;
    const dialogue = chroniclesNpcDialogueForState(current, chroniclesContextualContentAction(current));
    if (dialogue) {
      audienceRef.current = dialogue;
      setAudience(dialogue);
      return;
    }
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
    // Character-sheet spending is also part of the player's next saved game.
    progressionRef.current = nextProgression;
    setProgression(nextProgression);
    const current = stateRef.current;
    if (!current) return;
    const reconciled = reconcileChroniclesProgressionInTacticsState(current, nextProgression);
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
    chroniclesRememberPlayingRun(FIRST_PERSON_RUN_SCOPE, newRunId);
    activeRunIdRef.current = newRunId;
    authoritativeRunRef.current = null;
    checkpointFingerprintRef.current = '';
    checkpointQueueRef.current = Promise.resolve();
    checkpointMapRef.current = null;
    checkpointExistsRef.current = false;
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
    chroniclesClearPlayingRun();
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
    chroniclesRememberPlayingRun(FIRST_PERSON_RUN_SCOPE, operationId);

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
          createChroniclesState(null, activeProgression.characterBuild, { rules: 'mm3' }),
          activeProgression,
        );
        const restored = chroniclesApplyRunCheckpoint(progressed, world);
        // The run id seeds every MM3 die so F5 never rerolls a blow.
        const next = {
          ...chroniclesApplyArrival(chroniclesInitializeLostKingIntro(restored, {
            fresh: !remoteSelection && world.worldVersion === 0,
          })),
          runSeed: world.runId,
        };
        const confirmedId = chroniclesMarkSavedRunRemote(FIRST_PERSON_RUN_SCOPE, operationId, world.runId);
        if (!confirmedId) return;
        activeRunIdRef.current = confirmedId;
        chroniclesRememberPlayingRun(FIRST_PERSON_RUN_SCOPE, confirmedId);
        authoritativeRunRef.current = world;
        // Record the authoritative bootstrap as our comparison baseline.
        // New runs have no durable checkpoint until an explicit Save or area exit.
        checkpointFingerprintRef.current = chroniclesRunCheckpointFingerprint(restored);
        checkpointMapRef.current = next.mapId;
        checkpointExistsRef.current = remoteSelection || Number(world.worldVersion || 0) > 0;
        setAutomapVisitedByMap(loadChroniclesAutomapVisited(confirmedId));
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
          chroniclesRememberPlayingRun(FIRST_PERSON_RUN_SCOPE, replacementRunId);
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
            interactWithContext();
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
  }, [dispatch, interactWithContext, ready, state?.mapId]);

  useEffect(() => { engineRef.current?.renderState(state); }, [state]);

  const persistCheckpoint = useCallback((snapshot, reason = 'manual') => {
    const requestedRunId = authoritativeRunRef.current?.runId;
    if (!snapshot || !requestedRunId) return Promise.resolve(false);
    const fingerprint = chroniclesRunCheckpointFingerprint(snapshot);
    if (!fingerprint) return Promise.resolve(false);
    // Capture the progression and visited tiles at precisely this snapshot,
    // not later play while an earlier area checkpoint is still in flight.
    const stagedProgression = progressionRef.current;
    const visited = chroniclesAutomapMarkSeen(
      automapVisitedRef.current, chroniclesMapForState(snapshot), snapshot,
    );
    checkpointPendingRef.current += 1;
    setSaveBusy(true);
    setSaveNotice('');
    setSaveFailure(null);
    const request = checkpointQueueRef.current.catch(() => undefined).then(async () => {
      const currentRun = authoritativeRunRef.current;
      if (!currentRun?.runId || currentRun.runId !== requestedRunId) return false;
      // A pristine first-person run must still write its *first* checkpoint.
      // Equal fingerprints only permit skipping a write if a durable
      // authoritative world snapshot already exists.
      if (!checkpointExistsRef.current || fingerprint !== checkpointFingerprintRef.current) {
        const updated = await chroniclesCheckpointState(
          requestedRunId, snapshot, currentRun.worldVersion,
          { terminalStatus: snapshot.phase === 'escaped' ? 'completed' : null },
        );
        if (authoritativeRunRef.current?.runId !== requestedRunId) return false;
        authoritativeRunRef.current = { ...currentRun, ...updated };
        checkpointFingerprintRef.current = fingerprint;
      }
      // The remote run commit must succeed before profile and automap progress
      // become durable; failures leave both staged for a later manual retry.
      checkpointExistsRef.current = true;
      saveChroniclesAutomapVisited(requestedRunId, visited);
      saveChroniclesProgression(stagedProgression);
      chroniclesNoteSavedRunCheckpoint(FIRST_PERSON_RUN_SCOPE, requestedRunId, snapshot.mapId);
      if (reason === 'manual') setSaveNotice('Partida guardada correctamente.');
      setSaveFailure(null);
      return true;
    }).catch((error) => {
      console.error('Chronicles checkpoint failed', error);
      const status = Number.isInteger(error?.status) ? error.status : null;
      const requestId = typeof error?.requestId === 'string' ? error.requestId : null;
      const message = typeof error?.message === 'string' ? error.message : 'Error de conexión o del servidor.';
      setSaveFailure({ status, requestId, message });
      setSaveNotice('No se ha confirmado el guardado. La expedición sigue abierta para evitar perder progreso.');
      if (error?.status === 409) {
        setReady(false);
        setBootstrapError(error);
      }
      return false;
    }).finally(() => {
      checkpointPendingRef.current = Math.max(0, checkpointPendingRef.current - 1);
      if (checkpointPendingRef.current === 0) setSaveBusy(false);
    });
    checkpointQueueRef.current = request;
    return request;
  }, []);

  // No per-move/per-attack/per-dialogue autosave. Transitioning to another
  // map is the only automatic checkpoint, per the MM3 save contract.
  useEffect(() => {
    if (!ready || !state?.mapId) return;
    const previousMapId = checkpointMapRef.current;
    checkpointMapRef.current = state.mapId;
    if (chroniclesCheckpointReason(previousMapId, state.mapId) === 'area-change') {
      void persistCheckpoint(state, 'area-change');
    }
  }, [ready, state?.mapId, persistCheckpoint]);

  // Explicit navigation is never allowed to abandon a newer, unsaved world.
  // The server's checkpoint response, not the local optimistic state, gates it.
  const saveBeforeSwitch = useCallback(async (navigate) => {
    if (saveBusy || checkpointPendingRef.current > 0) return false;
    const snapshot = stateRef.current;
    if (!snapshot || !(await persistCheckpoint(snapshot, 'manual'))) return false;
    navigate();
    return true;
  }, [persistCheckpoint, saveBusy]);

  const saveAndExit = useCallback(() => saveBeforeSwitch(exitChronicles), [saveBeforeSwitch, exitChronicles]);
  const newExpeditionSafely = useCallback(() => saveBeforeSwitch(newExpedition), [saveBeforeSwitch, newExpedition]);

  const discardAndExit = useCallback(async () => {
    // Never discard a legitimate previous area checkpoint mid-flight.
    await checkpointQueueRef.current.catch(() => undefined);
    if (!checkpointExistsRef.current && activeRunIdRef.current) {
      const runId = activeRunIdRef.current;
      try {
        await chroniclesDeleteRemoteRun(runId);
        chroniclesForgetSavedRun(FIRST_PERSON_RUN_SCOPE, runId);
      } catch {
        setSaveNotice('No se ha podido descartar la expedición nueva. Vuelve a intentarlo.');
        setConfirmExitWithoutSaving(false);
        return;
      }
    }
    exitChronicles();
  }, [exitChronicles]);

  useEffect(() => {
    if (!ready || !stateRef.current) return undefined;
    const onKeyDown = (event) => {
      const current = stateRef.current;
      if (!current || audienceRef.current || event.defaultPrevented
        || event.ctrlKey || event.altKey || event.metaKey) return;
      // Let forms and modal dialogues own their keyboard events. Shift+Tab
      // always retains browser focus navigation; once inside the game menu,
      // plain Tab traverses its accessible controls rather than closing it.
      const target = event.target;
      if (target?.isContentEditable || target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (chronicleModalOpen || sheetMemberId || current.shop || current.guild || spellMenuOpen
        || current.phase === 'defeated' || current.phase === 'escaped') return;
      if (event.key === 'Tab') {
        if (event.shiftKey || target?.closest?.('.chronicles-game-menu')) return;
        event.preventDefault();
        if (event.repeat) return;
        clearTouchHold();
        setAutomapOpen(false);
        setJournalOpen(false);
        setMenuOpen((open) => !open);
        menuSummaryRef.current?.focus();
        return;
      }
      if (event.key === 'j' || event.key === 'J') {
        event.preventDefault();
        if (event.repeat) return;
        clearTouchHold();
        setAutomapOpen(false);
        setMenuOpen(false);
        setJournalOpen((open) => !open);
        return;
      }
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        if (event.repeat) return;
        clearTouchHold();
        setMenuOpen(false);
        setJournalOpen(false);
        setAutomapOpen((open) => !open);
        return;
      }
      if (automapOpen || menuOpen || journalOpen) return;
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
      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault();
        setSpellMenuOpen((open) => !open);
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
  }, [attackWithSelected, automapOpen, chronicleModalOpen, clearTouchHold, dispatch, interactWithContext, journalOpen, menuOpen, openMemberSheet, ready, sheetMemberId, spellMenuOpen]);

  const startFreshGame = (entryMapId = null) => {
    chroniclesClearPlayingRun();
    beginChroniclesRun(FIRST_PERSON_RUN_SCOPE, { entryMapId });
    setCharacterSetupDone(false);
    setEntryView('setup');
    refreshSaves((value) => value + 1);
  };

  const loadSavedGame = (runId) => {
    if (!chroniclesSelectSavedRun(FIRST_PERSON_RUN_SCOPE, runId)) return;
    chroniclesRememberPlayingRun(FIRST_PERSON_RUN_SCOPE, runId);
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
    const navigate = () => {
      chroniclesClearPlayingRun();
      setMenuOpen(false);
      clearTouchHold();
      // The server has confirmed the latest checkpoint. Reopen the book.

      stateRef.current = null;
      activeRunIdRef.current = null;
      authoritativeRunRef.current = null;
      checkpointMapRef.current = null;
      checkpointExistsRef.current = false;
      const durableProgression = loadChroniclesProgression();
      progressionRef.current = durableProgression;
      setProgression(durableProgression);
      setState(null);
      setReady(false);
      setBootstrapError(null);
      setRendererError('');
      checkpointFingerprintRef.current = '';
      setCharacterSetupDone(false);
      setSaveInventory(null);
      setEntryView('menu');
      refreshSaves((value) => value + 1);
    };
    // Broken bootstrap offers a safe route back to the save book without a
    // playable snapshot; an active expedition must be durably checkpointed.
    if (bootstrapError || !stateRef.current) {
      void checkpointQueueRef.current.catch(() => undefined).then(navigate);
    } else {
      void saveBeforeSwitch(navigate);
    }
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
  const activeQuests = chroniclesQuestLogEntries(state).filter((quest) => quest.status === 'active');
  const expeditionOver = state.phase === 'defeated' || state.phase === 'escaped';
  const contextualAction = chroniclesContextualContentAction(state);
  const npcAtPosition = chroniclesNpcDialogueForState(state, contextualAction);
  const activeInitiativeActor = chroniclesCurrentInitiativeActor(state.initiative);
  // In combat the hero whose turn it is casts; exploring, the selected one.
  const caster = activeInitiativeActor?.kind === 'party'
    ? state.party.find((member) => member.id === activeInitiativeActor.id) || selectedMember
    : selectedMember;
  const casterKnowsSpells = caster ? chroniclesMemberSpells(state, caster).length > 0 : false;

  return (
    <div
      ref={gameRootRef}
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
          {state.party.map((member, index) => {
            return (
              <button
                type="button"
                key={member.id}
                className={`chronicles-party-member ${member.id === 'matthias' ? 'is-leader' : ''} ${member.id === selectedMemberId ? 'is-selected' : ''} ${member.hp <= 0 ? 'is-down' : ''}`}
                onClick={() => openMemberSheet(member.id)}
                disabled={expeditionOver}
                aria-label={`Seleccionar ${member.name}`}
                title={`${member.name} · ${member.hp}/${member.maxHp} PV${chroniclesMemberMaxSp(state, member) > 0 ? ` · ${chroniclesMemberSp(state, member)}/${chroniclesMemberMaxSp(state, member)} PH` : ''} · clic: ficha`}
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
                <span><strong>{index + 1}. {member.name}</strong><small>Nv {chroniclesHeroProgress(progression, member.id).level} · {member.row === 'front' ? 'FRENTE' : 'RETAGUARDIA'}</small></span>
                <span className="chronicles-party-bars" aria-hidden="true" data-band={chroniclesHealthBand(member.hp, member.maxHp)}>
                  <i className="is-hp" style={{ '--fill': member.maxHp ? Math.max(0, member.hp) / member.maxHp : 0 }} />
                  {chroniclesMemberMaxSp(state, member) > 0 && (
                    <i className="is-sp" style={{ '--fill': chroniclesMemberSp(state, member) / chroniclesMemberMaxSp(state, member) }} />
                  )}
                </span>
                <b>
                  {member.hp}/{member.maxHp}
                  {chroniclesMemberMaxSp(state, member) > 0 && (
                    <i className="chronicles-party-sp" data-member-sp={chroniclesMemberSp(state, member)}>
                      {chroniclesMemberSp(state, member)}/{chroniclesMemberMaxSp(state, member)} PH
                    </i>
                  )}
                </b>
              </button>
            );
          })}
          {/* MM3 keeps two places beside the company for hired hands. */}
          {[1, 2].map((slot) => (
            <div key={`hireling-${slot}`} className="chronicles-party-hireling" data-chronicles-hireling-slot={slot}
              aria-label={`Hueco ${slot} para contratado, libre`}>
              <span className="chronicles-party-hireling__face" aria-hidden="true" />
              <span className="chronicles-party-hireling__label"><strong>Contratado</strong><small>Hueco libre</small></span>
            </div>
          ))}
        </aside>

        <main className="chronicles-stage-wrap">
          <div className="chronicles-statusbar" aria-live="polite">
            <span>{locationHud.kind} <b>{locationHud.value}</b></span>
            <span>RUMBO <b>{direction.label} · {chroniclesMapCoordinatesLabel(chroniclesMapForState(state), state)}</b></span>
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
              title="M · Mapa"
              onClick={() => {
                clearTouchHold();
                setMenuOpen(false);
                setJournalOpen(false);
                setAutomapOpen((open) => !open);
              }}
            >
              <i aria-hidden="true">⌖</i><b>MAPA</b>
            </button>
            <details
              className="chronicles-game-menu"
              open={menuOpen}
              onToggle={(event) => {
                setMenuOpen(event.currentTarget.open);
                if (event.currentTarget.open) {
                  setAutomapOpen(false);
                  setJournalOpen(false);
                }
              }}
            >
              <summary ref={menuSummaryRef} title="Tab · Menú" aria-label={menuOpen ? 'Cerrar menú de Chronicles' : 'Abrir menú de Chronicles'}>
                ☰ <b>MENÚ</b>
              </summary>
              <div className="chronicles-game-menu__panel">
                <strong>Chronicles of Matthias</strong>
                <small>Guardado manual · checkpoint automático al cambiar de área.</small>
                <fieldset className="chronicles-audio-controls" style={{ border: '1px solid #806d51', padding: '8px', display: 'grid', gap: '6px', minWidth: 0 }}>
                  <legend>Audio</legend>
                  <label htmlFor="chronicles-sfx-volume">Efectos (SFX) · {Math.round(fxVolume * 100)} %</label>
                  <input
                    id="chronicles-sfx-volume"
                    aria-label="Volumen de efectos de Chronicles"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={Math.round(fxVolume * 100)}
                    style={{ width: '100%', accentColor: '#88632d' }}
                    onChange={(event) => setFxVolume(setChroniclesFxVolume(Number(event.target.value) / 100))}
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                  <label htmlFor="chronicles-music-volume">Música general · {Math.round(musicVolume * 100)} %</label>
                  <input
                    id="chronicles-music-volume"
                    aria-label="Volumen de música"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={Math.round(musicVolume * 100)}
                    style={{ width: '100%', accentColor: '#88632d' }}
                    onChange={(event) => setMusicVolume(setAmbientVolume(Number(event.target.value) / 100))}
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                  <small>Ajusta la música general; Chronicles aún no dispone de pista propia.</small>
                </fieldset>
                {saveNotice && <small role="status">{saveNotice}</small>}
                {saveFailure && (
                  <small role="alert" className="chronicles-save-error">
                    {saveFailure.status ? `HTTP ${saveFailure.status} · ` : ''}{saveFailure.message}
                    {saveFailure.requestId ? ` · Solicitud ${saveFailure.requestId}` : ''}
                  </small>
                )}
                <button type="button" onClick={() => { setMenuOpen(false); setConfirmExitWithoutSaving(false); }}>Continuar</button>
                <button type="button" onClick={() => { setMenuOpen(false); setAutomapOpen(false); setJournalOpen(true); }}>Crónica · J</button>
                <button type="button" onClick={() => void persistCheckpoint(stateRef.current, 'manual')} disabled={saveBusy}>
                  {saveBusy ? 'Guardando…' : saveFailure ? 'Reintentar guardar' : 'Guardar partida'}
                </button>
                <button type="button" onClick={() => void newExpeditionSafely()} disabled={saveBusy}>Nueva expedición</button>
                <button type="button" onClick={returnToSaveMenu} disabled={saveBusy}>Partidas guardadas</button>
                <button type="button" onClick={() => void saveAndExit()} disabled={saveBusy}>
                  {saveBusy ? 'Guardando antes de salir…' : saveFailure ? 'Reintentar guardar y salir' : 'Salir y guardar'}
                </button>
                {!confirmExitWithoutSaving ? (
                  <button type="button" onClick={() => setConfirmExitWithoutSaving(true)} disabled={saveBusy}>
                    Salir sin guardar
                  </button>
                ) : (
                  <div role="group" aria-label="Confirmar salida sin guardar">
                    <small>Perderás lo jugado desde el último guardado o cambio de área.</small>
                    <button type="button" onClick={() => void discardAndExit()} disabled={saveBusy}>Sí, salir sin guardar</button>
                    <button type="button" onClick={() => setConfirmExitWithoutSaving(false)}>Cancelar</button>
                  </div>
                )}
              </div>
            </details>
          </div>

          <div className="chronicles-stage">
            <div ref={hostRef} className="chronicles-three" data-chronicles-renderer="three" aria-label="Mazmorra 3D en primera persona de Chronicles of Matthias" />
            <div className="chronicles-vignette" aria-hidden="true" />
            <div className="chronicles-crosshair" aria-hidden="true">·</div>
            <ChroniclesInitiativeRail initiative={state.initiative} />
            <ChroniclesNarratorOverlay message={state.message} open={chronicleModalOpen}
              onOpenChange={(next) => {
                clearTouchHold();
                if (next) {
                  setJournalOpen(false);
                  setMenuOpen(false);
                  setAutomapOpen(false);
                }
                setChronicleModalOpen(next);
              }}>
              {activeQuests.length > 0 && <ChroniclesQuestLog state={state} />}
            </ChroniclesNarratorOverlay>
            <ChroniclesPartyBark key={partyBark?.token || 'none'} bark={partyBark} />
            <ChroniclesTacticalMargin target={tacticalTarget} />
            <ChroniclesEnemyRetaliationFx key={retaliationCue?.token || 'none'} cue={retaliationCue} />
            {rendererError && <div className="chronicles-renderer-error" role="alert">{rendererError}</div>}
            {state.phase === 'defeated' && <ChroniclesDefeatOverlay onRestart={restart} onExit={exitChronicles} />}
            {state.phase === 'escaped' && <ChroniclesBookOneEpilogue state={state} onRestart={restart} />}
          </div>

          {/* Desktop puts these in the MM3 panel; mobile floats them over the view. */}
          <ChroniclesMinimap
            state={state}
            visitedCells={automapVisitedByMap[state.mapId] || []}
            hidden={automapOpen || expeditionOver}
            onExpand={() => {
              clearTouchHold();
              setMenuOpen(false);
              setJournalOpen(false);
              setAutomapOpen(true);
            }}
          />
          <ChroniclesCombatRoster state={state} />

          <ChroniclesJournalModal open={journalOpen} state={state} entries={journalEntries} onClose={() => setJournalOpen(false)} />

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
                {casterKnowsSpells && (
                  <button
                    type="button"
                    className="is-magic"
                    data-chronicles-touch-action="cast"
                    aria-expanded={spellMenuOpen}
                    onClick={() => setSpellMenuOpen((open) => !open)}
                    aria-label={`Hechizos de ${caster.name}`}
                  >✧<small>MAGIA</small></button>
                )}
                {(contextualAction || npcAtPosition) && (
                  <button
                    type="button"
                    className="is-contextual"
                    data-chronicles-touch-action="interact"
                    onClick={interactWithContext}
                    aria-label={contextualAction?.label || `Hablar con ${npcAtPosition.name}`}
                  >✦<small>{contextualAction?.id === CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID ? 'VOLVER' : npcAtPosition ? 'ENTRAR' : 'USAR'}</small></button>
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
                <span><kbd>C</kbd> hechizos</span>
                <span><kbd>M</kbd> mapa</span>
              </div>
            </>
          )}
        </main>

        {/* Legacy large portrait of the active hero; the MM3 chrome hides it (faces live in the strip). */}
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
            <small>{state.combatRules === 'mm3' ? (chroniclesEquippedItem(state, selectedMember?.id, 'weapon')?.name || 'Sin arma') : selectedMember?.attackName} · daño {selectedAttackStats.damage} · alcance {selectedAttackStats.reach}</small>
          </div>
        </div>
      </div>

      {spellMenuOpen && casterKnowsSpells && !expeditionOver && !sheetMember && !state.shop && !state.guild && (
        <ChroniclesSpellMenu
          state={state}
          member={caster}
          onClose={() => setSpellMenuOpen(false)}
          onCast={(spellId) => {
            setSpellMenuOpen(false);
            dispatch({ type: 'cast', memberId: caster.id, spellId });
          }}
        />
      )}

      {state.guild && !sheetMember && (
        <ChroniclesGuild
          state={state}
          onAction={dispatch}
          onClose={() => dispatch({ type: 'guild-close' })}
        />
      )}

      {state.shop && !sheetMember && (
        <ChroniclesShop
          state={state}
          onAction={dispatch}
          onClose={() => dispatch({ type: 'shop-close' })}
        />
      )}

      {audience && !sheetMember && (
        <ChroniclesAudience
          dialogue={audience}
          onAction={(actionId) => {
            const context = chroniclesContextualContentAction(stateRef.current);
            if (context?.id !== actionId) return 'Ese asunto ya está resuelto.';
            const next = dispatch('interact');
            return next?.message || 'Aldric asiente.';
          }}
          onClose={() => { audienceRef.current = null; setAudience(null); }}
        />
      )}

      {sheetMember && (
        <ChroniclesCharacterSheet
          state={state}
          progression={progression}
          member={sheetMember}
          mode="first-person"
          onClose={() => setSheetMemberId(null)}
          onSelectMember={(memberId) => {
            if (!stateRef.current?.party.some((candidate) => candidate.id === memberId)) return;
            selectedMemberIdRef.current = memberId;
            setSelectedMemberId(memberId);
            setSheetMemberId(memberId);
          }}
          onAllocateAttribute={allocateAttribute}
          onLearnSkill={learnSkill}
          onEquipmentAction={(action) => dispatch({ ...action, memberId: sheetMember.id })}
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
