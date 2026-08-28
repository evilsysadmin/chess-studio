import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import CombatScreen from './CombatScreen.jsx';
import CombatServicePanel from './CombatServicePanel.jsx';
import CampaignArmyGlance from './CampaignArmyGlance.jsx';
import { ArmyRosterPanel } from './ArmyScreen.jsx';
import CombatCampaignMap from './CombatCampaignMap.jsx';
import CampaignBriefing from './CampaignBriefing.jsx';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import CombatDebrief from './CombatDebrief.jsx';
import CombatMarket from './CombatMarket.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { applyModifierToFen, encounterForRun } from '../roguelikeModifiers.js';
import { buyStatPoint } from '../combat.js';
import { loadRoster, saveRoster, revivePiece, renameRosterIdentity } from '../combatRoster.js';
import { markCombatIdentityBioPending, saveCombatIdentityBio } from '../combatIdentity.js';
import { buildUnitBioDossier } from '../aiNarrativeTasks.js';
import { requestRemoteNarrative } from '../narrativeRemote.js';
import { getToken } from '../auth.js';
import { buyEquipment, hireMercenary } from '../combatEconomy.js';
import { setRosterDeploymentType } from '../combatMetamorphosis.js';
import { deploymentSummary, grantReserveRecruit, reserveRecruitTypeForNode } from '../combatDeployment.js';
import { unlockRosterTechnique, setRosterEquippedTechnique } from '../combatTechniques.js';
import { rewardOptionsForFloor, perkById } from '../roguelikePerks.js';
import { ROGUELIKE_BOSS, ROGUELIKE_BOSS_FLOOR } from '../roguelikeBoss.js';
import { campaignBossForSeed } from '../combatBosses.js';
import { loadCombatService, summarizeCombatService } from '../combatService.js';
import { COMBAT_CHESS_NAME, COMBAT_CHESS_GENRE } from '../combatChessBrand.js';
import { recordGameActivity } from '../gameActivity.js';
import { clearCombatSession, hasCombatSession } from '../combatSession.js';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';
import {
  loadCampaign,
  startCampaign,
  campaignMap,
  campaignNode,
  availableCampaignNodes,
  selectCampaignNode,
  markCampaignBattleStarted,
  markCampaignBattleRetired,
  recoverInterruptedCampaign,
  resumeInterruptedCampaign,
  markCampaignBattleWon,
  campaignRewardOptions,
  chooseCampaignReward,
  campaignEventOptions,
  resolveCampaignEvent,
  campaignDifficulty,
  campaignIntelBriefing,
  markCampaignBriefingAccepted,
  purchaseCampaignIntel,
  endCampaign,
  loadCampaignBestStage,
  campaignRelicDetails,
  campaignBiomeForNode,
  loadCampaignArchive,
} from '../combatCampaign.js';
import {
  loadRun,
  startNewRun,
  markBattleStarted,
  recoverInterruptedRun,
  markFloorCleared,
  chooseRunReward,
  advanceFloor,
  completeTower,
  continueIntoEndless,
  endRun,
  loadBestFloor,
  loadTowerCompleted,
  difficultyForFloor,
  ROGUELIKE_TOWER_FLOORS,
} from '../roguelikeRun.js';

const HUMAN_COLOR = 'w';
const CPU_COLOR = 'b';

export default function RoguelikeScreen({ onExit, onError, onHistory, onViewBattle, onBattleUiActive, onPersistenceState }) {
  const [run, setRun] = useState(() => loadRun());
  const [campaign, setCampaign] = useState(() => loadCampaign());
  const [campaignBestStage, setCampaignBestStage] = useState(() => loadCampaignBestStage());
  const [campaignEndResult, setCampaignEndResult] = useState(null);
  const [campaignArchive, setCampaignArchive] = useState(() => loadCampaignArchive());
  const [bestFloor, setBestFloor] = useState(() => loadBestFloor());
  const [towerCompleted, setTowerCompleted] = useState(() => loadTowerCompleted());
  const [endResult, setEndResult] = useState(null); // { type, reached, newBest }
  const [, setCombatSessionActive] = useState(() => {
    if (campaign.active && campaign.phase === 'fighting' && campaign.selectedNodeId) {
      return hasCombatSession(`campaign:${campaign.seed}:${campaign.selectedNodeId}`);
    }
    if (run.inRun && run.phase === 'fighting') {
      return hasCombatSession(`run:${run.seed}:${run.floor}`);
    }
    return false;
  });
  const [serviceRecord, setServiceRecord] = useState(() => loadCombatService());
  const [roster, setRoster] = useState(() => loadRoster());
  const [battleDebrief, setBattleDebrief] = useState(null);
  const [showCampaignTutorial, setShowCampaignTutorial] = useState(() => campaign.active && !loadMechanicTutorialProgress()?.['combat-campaign']?.seen);
  const [showMarket, setShowMarket] = useState(false);
  const [bioQueueTick, setBioQueueTick] = useState(0);
  const bioRequestsRef = useRef(new Set());
  const mountedRef = useRef(true);
  const serviceSummary = useMemo(() => summarizeCombatService(serviceRecord), [serviceRecord]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const queued = Object.entries(roster.identities || {}).find(([key, identity]) => (
      identity?.bioStatus === 'pending' && !bioRequestsRef.current.has(`${key}:${identity.identityId}`)
    ));
    if (!queued) return;
    const [key, identity] = queued;
    const requestKey = `${key}:${identity.identityId}`;
    bioRequestsRef.current.add(requestKey);
    const dossier = buildUnitBioDossier({
      identity,
      unitKey: key,
      piece: roster.pieces?.[key],
      existingBios: Object.values(roster.identities || {}).map((entry) => entry?.bio).filter(Boolean),
    });
    void requestRemoteNarrative(dossier, { token, timeoutMs: 8000 }).then((bio) => {
      if (!bio || !mountedRef.current) return;
      setRoster((current) => {
        if (current.identities?.[key]?.identityId !== identity.identityId) return current;
        const next = saveCombatIdentityBio(current, key, bio);
        if (next !== current) saveRoster(next);
        return next;
      });
    }).finally(() => {
      if (mountedRef.current) setBioQueueTick((tick) => tick + 1);
    });
  }, [roster, bioQueueTick]);

  function handleRequestUnitBio(key) {
    setRoster((current) => {
      const next = markCombatIdentityBioPending(current, key);
      if (next !== current) saveRoster(next);
      return next;
    });
  }

  function handleHireMercenary(offer, contract) {
    const next = hireMercenary(roster, offer, contract);
    if (next === roster) return false;
    saveRoster(next);
    setRoster(next);
    return true;
  }

  function handleBuyEquipment(itemId, key) {
    const next = buyEquipment(roster, itemId, key);
    if (next === roster) return false;
    saveRoster(next);
    setRoster(next);
    return true;
  }

  // `combatSessionActive` es útil para forzar un render al arrancar/terminar,
  // pero NO es la fuente de verdad de una batalla `fighting`: puede quedar
  // desfasado tras HMR/remounts. La sesión persistida decide si la batalla
  // realmente puede reanudarse.
  const campaignCombatSessionId = campaign.active && campaign.selectedNodeId
    ? `campaign:${campaign.seed}:${campaign.selectedNodeId}`
    : null;
  const runCombatSessionId = run.inRun ? `run:${run.seed}:${run.floor}` : null;
  const campaignBattleSessionPresent = campaign.phase === 'fighting' && campaignCombatSessionId
    ? hasCombatSession(campaignCombatSessionId)
    : false;
  const runBattleSessionPresent = run.phase === 'fighting' && runCombatSessionId
    ? hasCombatSession(runCombatSessionId)
    : false;

  useEscapeToClose(onExit, {
    disabled:
      (run.inRun && (run.phase === 'battle' || (run.phase === 'fighting' && runBattleSessionPresent))) ||
      (campaign.active && (campaign.phase === 'battle' || (campaign.phase === 'fighting' && campaignBattleSessionPresent))),
  });

  const encounter = useMemo(
    () => (run.inRun ? encounterForRun(run.seed, run.floor) : null),
    [run.inRun, run.seed, run.floor],
  );
  const nextEncounter = useMemo(
    () => (run.inRun && run.phase === 'cleared' ? encounterForRun(run.seed, run.floor + 1) : null),
    [run.inRun, run.phase, run.seed, run.floor],
  );
  const rewardOptions = useMemo(
    () => (run.inRun && run.phase === 'cleared' ? rewardOptionsForFloor(run.seed, run.floor) : []),
    [run.inRun, run.phase, run.seed, run.floor],
  );
  const runPerkDetails = useMemo(
    () => (run.perks || []).map(perkById).filter(Boolean),
    [run.perks],
  );

  const campaignMapState = useMemo(
    () => (campaign.active && campaign.seed ? campaignMap(campaign.seed) : null),
    [campaign.active, campaign.seed],
  );
  const campaignAvailable = useMemo(
    () => (campaign.active ? availableCampaignNodes(campaign) : []),
    [campaign],
  );
  const selectedCampaignNode = useMemo(
    () => (campaign.active ? campaignNode(campaign) : null),
    [campaign],
  );
  const campaignPerkDetails = useMemo(
    () => (campaign.perks || []).map(perkById).filter(Boolean),
    [campaign.perks],
  );
  const campaignRelics = useMemo(() => campaignRelicDetails(campaign), [campaign]);

  const initialFen = useMemo(() => {
    if (!encounter) return null;
    return applyModifierToFen(new Chess().fen(), encounter.modifierId, CPU_COLOR);
  }, [encounter]);

  function handleStartCampaign() {
    setCombatSessionActive(false);
    setBattleDebrief(null);
    setCampaign(startCampaign());
    if (!loadMechanicTutorialProgress()?.['combat-campaign']?.seen) setShowCampaignTutorial(true);
    setCampaignEndResult(null);
    setEndResult(null);
  }

  function handleRestartCampaign() {
    const progressed = Math.max(0, (campaign.route || []).length - 1);
    const confirmed = window.confirm(
      `¿Reiniciar esta campaña?\n\nSe perderán la ruta, suministros, intel y ventajas temporales de la operación actual${progressed ? ` (sector ${progressed}/7)` : ''}. Tu ejército persistente, rangos, medallas, bajas, créditos y archivos se conservan.`,
    );
    if (!confirmed) return;

    if (campaignCombatSessionId) clearCombatSession(campaignCombatSessionId);
    // Registrar el reinicio mantiene el histórico honesto sin convertirlo en
    // una derrota. A continuación nace una operación nueva con seed nueva.
    endCampaign(campaign, 'restarted');
    setCampaignArchive(loadCampaignArchive());
    setCombatSessionActive(false);
    setBattleDebrief(null);
    setCampaignEndResult(null);
    setEndResult(null);
    setCampaign(startCampaign());
  }

  function handleCampaignNodeSelect(nodeId) {
    setCombatSessionActive(false);
    setCampaign((current) => selectCampaignNode(current, nodeId));
  }

  function handleCampaignBuyIntel() {
    setCampaign((current) => purchaseCampaignIntel(current));
  }

  function handleCampaignBriefingContinue() {
    setCampaign((current) => markCampaignBriefingAccepted(current));
  }

  function handleCampaignBattleStarted(meta = {}) {
    setBattleDebrief(null);
    setCombatSessionActive(true);
    if (meta.gameId) recordGameActivity({ gameId: meta.gameId, state: 'started', mode: 'combat', modeRecord: meta.modeRecord || { variant: 'roguelike', roguelikeMode: 'campaign' }, difficulty: meta.difficulty });
    setCampaign((current) => markCampaignBattleStarted(current));
  }

  function handleRecoverInterruptedCampaign(entry = null) {
    const recovered = entry
      ? resumeInterruptedCampaign(entry)
      : recoverInterruptedCampaign(campaign);
    if (!recovered?.active) return;
    setCombatSessionActive(false);
    setBattleDebrief(null);
    setCampaign(recovered);
    setCampaignEndResult(null);
    setCampaignArchive(loadCampaignArchive());
  }

  function finishCampaign(reason, campaignToFinish = campaign) {
    const result = endCampaign(campaignToFinish, reason);
    setCampaignBestStage(loadCampaignBestStage());
    setTowerCompleted(loadTowerCompleted());
    setCombatSessionActive(false);
    setCampaign(loadCampaign());
    setCampaignEndResult(result);
    setCampaignArchive(loadCampaignArchive());
  }

  function handleCampaignBattleResult(outcome, debrief = null, meta = {}) {
    setBattleDebrief(debrief);
    setCombatSessionActive(false);
    if (meta.gameId) recordGameActivity({
      gameId: meta.gameId,
      state: outcome === 'retired' ? 'cancelled' : 'finished',
      mode: 'combat',
      modeRecord: meta.battleRecord || { variant: 'roguelike', roguelikeMode: 'campaign' },
      outcome: outcome === 'retired' ? null : outcome,
      difficulty: meta.difficulty ?? meta.battleRecord?.difficulty,
    });
    setServiceRecord(loadCombatService());
    setRoster(loadRoster());
    if (outcome === 'win') {
      setCampaign((current) => markCampaignBattleWon(current));
      setTowerCompleted(loadTowerCompleted());
      setBestFloor(loadBestFloor());
      setCampaignBestStage(loadCampaignBestStage());
      return;
    }
    if (outcome === 'retired') {
      // Retirarse de una batalla no equivale a abandonar la operación. Las
      // bajas ya quedaron persistidas por CombatScreen, pero el mismo sector
      // vuelve a briefing para poder reorganizar, comprar intel y reintentar.
      setCampaign((current) => markCampaignBattleRetired(current));
      return;
    }
    finishCampaign('over');
  }

  function handleCampaignReward(perkId) {
    setBattleDebrief(null);
    const node = selectedCampaignNode;
    if (node && ['camp', 'elite'].includes(node.type)) {
      const grantId = `campaign:${campaign.seed}:${node.id}:reserve-recruit`;
      setRoster((current) => {
        const next = grantReserveRecruit(current, {
          grantId,
          originType: reserveRecruitTypeForNode(node),
        });
        if (next !== current) saveRoster(next);
        return next;
      });
    }
    setCampaign((current) => chooseCampaignReward(current, perkId));
  }

  function handleCampaignEvent(choiceId) {
    setCampaign((current) => resolveCampaignEvent(current, choiceId));
  }

  function handleRenameRosterPiece(key, alias) {
    setRoster((current) => {
      const next = renameRosterIdentity(current, key, alias);
      if (next === current) return current;
      saveRoster(next);
      return next;
    });
  }

  function handleBuyRosterStat(key, stat) {
    setRoster((current) => {
      const saved = current.pieces?.[key] || { strengthPoints: 0, speedPoints: 0, bankedXp: 0, alive: true };
      if (saved.alive === false) return current;
      const virtualPiece = { type: saved.deploymentType || key.split('-')[0], ...saved };
      const updated = buyStatPoint(virtualPiece, stat);
      if (!updated) return current;
      const next = {
        ...current,
        pieces: {
          ...current.pieces,
          [key]: {
            ...saved,
            strengthPoints: updated.strengthPoints,
            speedPoints: updated.speedPoints,
            bankedXp: updated.bankedXp,
            alive: true,
            deploymentType: saved.deploymentType || null,
          },
        },
      };
      saveRoster(next);
      return next;
    });
  }

  function handleReviveRosterPiece(key, type) {
    setRoster((current) => {
      const next = revivePiece(current, key, type);
      if (next !== current) saveRoster(next);
      return next;
    });
  }

  function handleMetamorphoseRosterPiece(key, targetType) {
    setRoster((current) => {
      const next = setRosterDeploymentType(current, key, targetType);
      if (next !== current) saveRoster(next);
      return next;
    });
  }

  function handleUnlockRosterTechnique(key, techniqueId) {
    setRoster((current) => {
      const next = unlockRosterTechnique(current, key, techniqueId);
      if (next !== current) saveRoster(next);
      return next;
    });
  }

  function handleEquipRosterTechnique(key, techniqueId) {
    setRoster((current) => {
      const next = setRosterEquippedTechnique(current, key, techniqueId);
      if (next !== current) saveRoster(next);
      return next;
    });
  }

  function handleStartRun() {
    setCombatSessionActive(false);
    setBattleDebrief(null);
    setRun(startNewRun());
    setEndResult(null);
  }

  function finishRun(type, runToFinish = run) {
    const previousBest = loadBestFloor();
    const reached = endRun(runToFinish);
    const updatedBest = loadBestFloor();
    setBestFloor(updatedBest);
    setTowerCompleted(loadTowerCompleted());
    setCombatSessionActive(false);
    setRun(loadRun());
    setEndResult({ type, reached, newBest: reached > previousBest });
  }

  function handleBattleStarted(meta = {}) {
    setBattleDebrief(null);
    setCombatSessionActive(true);
    if (meta.gameId) recordGameActivity({ gameId: meta.gameId, state: 'started', mode: 'combat', modeRecord: meta.modeRecord || { variant: 'roguelike', roguelikeMode: run.mode }, difficulty: meta.difficulty });
    setRun((current) => markBattleStarted(current));
  }

  function handleRecoverInterruptedRun() {
    setCombatSessionActive(false);
    setBattleDebrief(null);
    setEndResult(null);
    setRun((current) => recoverInterruptedRun(current));
  }

  function handleBattleResult(outcome, debrief = null, meta = {}) {
    setBattleDebrief(debrief);
    setCombatSessionActive(false);
    if (meta.gameId) recordGameActivity({
      gameId: meta.gameId,
      state: outcome === 'retired' ? 'cancelled' : 'finished',
      mode: 'combat',
      modeRecord: meta.battleRecord || { variant: 'roguelike', roguelikeMode: run.mode },
      outcome: outcome === 'retired' ? null : outcome,
      difficulty: meta.difficulty ?? meta.battleRecord?.difficulty,
    });
    setServiceRecord(loadCombatService());
    setRoster(loadRoster());
    if (outcome === 'win') {
      if (run.mode === 'tower' && run.floor === ROGUELIKE_BOSS_FLOOR) {
        setRun((current) => completeTower(current));
        setTowerCompleted(true);
        setBestFloor((current) => Math.max(current, ROGUELIKE_TOWER_FLOORS));
      } else {
        setRun((current) => markFloorCleared(current));
      }
      return;
    }
    finishRun(outcome === 'retired' ? 'retired' : 'over');
  }

  function handleChooseReward(perkId) {
    setRun((current) => chooseRunReward(current, perkId));
  }

  function handleContinue() {
    setCombatSessionActive(false);
    setRun(advanceFloor(run));
    setEndResult(null);
  }

  function handleContinueEndless() {
    setCombatSessionActive(false);
    setRun(continueIntoEndless(run));
    setEndResult(null);
  }

  function handleRetire() {
    finishRun('retired');
  }

  if (!run.inRun && campaign.active && campaign.phase === 'fighting' && !campaignBattleSessionPresent) {
    return (
      <div className="menu">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section roguelike-interrupted">
          <span className="section-label">{COMBAT_CHESS_NAME} · integridad de campaña</span>
          <h2>La batalla quedó interrumpida</h2>
          <p className="hero-scope-note">
            La sesión efímera de la batalla ya no está disponible. La campaña,
            el ejército y sus bajas siguen guardados: puedes volver al briefing
            del mismo sector y preparar el reintento.
          </p>
          <button type="button" className="primary-btn" style={{ width: '100%', marginTop: '0.8rem' }} onClick={() => handleRecoverInterruptedCampaign()}>
            Recuperar campaña
          </button>
        </div>
      </div>
    );
  }

  if (!run.inRun && campaign.active && (campaign.phase === 'battle' || (campaign.phase === 'fighting' && campaignBattleSessionPresent))) {
    const node = selectedCampaignNode;
    const campaignFen = node ? applyModifierToFen(new Chess().fen(), node.modifierId, CPU_COLOR) : new Chess().fen();
    const isBoss = node?.type === 'boss';
    const delta = campaign.nextDifficultyDelta || 0;
    const encounterIntel = node ? campaignIntelBriefing(campaign, node) : null;
    return (
      <CombatScreen
        key={`campaign-${campaign.seed}-${node?.id || 'node'}`}
        onExit={onExit}
        onError={onError}
        onHistory={onHistory}
        onViewBattle={onViewBattle}
        onBattleUiActive={onBattleUiActive}
        onPersistenceState={onPersistenceState}
        initialFen={campaignFen}
        forcedHumanColor={HUMAN_COLOR}
        difficultyOverride={campaignDifficulty(campaign, node)}
        difficultyLabel={`${node?.typeLabel || 'Operación'} · Sector ${node?.stage || '?'}${delta ? ` · inteligencia ${delta > 0 ? '+' : ''}${delta}` : ''}`}
        encounterLabel={node?.label}
        encounterDescription={node?.description}
        encounterTier={node?.tier}
        encounterIntel={encounterIntel}
        combatVariant="roguelike"
        battleTheme={campaignBiomeForNode(campaign.seed, node)?.boardTheme}
        battleThemeLabel={campaignBiomeForNode(campaign.seed, node)?.label}
        requireDeploymentConfirmation
        runPerks={campaign.perks || []}
        runPerkDetails={campaignPerkDetails}
        bossConfig={isBoss ? campaignBossForSeed(campaign.seed) : null}
        onBattleStart={handleCampaignBattleStarted}
        onBattleResult={handleCampaignBattleResult}
        roguelikeFloor={node?.floor || node?.stage || 1}
        roguelikeMode="campaign"
        combatSessionId={campaignCombatSessionId || `campaign:${campaign.seed}:${node?.id || 'node'}`}
      />
    );
  }

  if (run.inRun && run.phase === 'fighting' && !runBattleSessionPresent) {
    return (
      <div className="menu">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section roguelike-interrupted">
          <span className="section-label">{COMBAT_CHESS_NAME} · recuperación segura</span>
          <h2>La pelea quedó interrumpida</h2>
          <p className="hero-scope-note">
            La sesión de batalla desapareció antes de resolver el piso. Puedes repetir este mismo encuentro
            conservando el piso, la semilla y todas las mejoras del intento.
          </p>
          <p className="hint-text">
            No se registra derrota ni se inventan bajas por un fallo técnico.
          </p>
          <button type="button" className="primary-btn" style={{ width: '100%', marginTop: '0.8rem' }} onClick={handleRecoverInterruptedRun}>
            Recuperar el intento
          </button>
        </div>
      </div>
    );
  }

  if (run.inRun && (run.phase === 'battle' || (run.phase === 'fighting' && runBattleSessionPresent))) {
    const isBoss = run.mode === 'tower' && run.floor === ROGUELIKE_BOSS_FLOOR;
    return (
      <CombatScreen
        key={`${run.seed}-${run.floor}-${encounter?.id || 'encounter'}`}
        onExit={onExit}
        onError={onError}
        onHistory={onHistory}
        onViewBattle={onViewBattle}
        onBattleUiActive={onBattleUiActive}
        onPersistenceState={onPersistenceState}
        initialFen={initialFen}
        forcedHumanColor={HUMAN_COLOR}
        difficultyOverride={difficultyForFloor(run.floor)}
        difficultyLabel={isBoss ? `Boss · Piso ${run.floor}` : `${run.mode === 'endless' ? 'Infinito · ' : ''}Piso ${run.floor}`}
        encounterLabel={encounter?.label}
        encounterDescription={encounter?.description}
        encounterTier={encounter?.tier}
        combatVariant="roguelike"
        runPerks={run.perks || []}
        runPerkDetails={runPerkDetails}
        bossConfig={isBoss ? ROGUELIKE_BOSS : null}
        onBattleStart={handleBattleStarted}
        onBattleResult={handleBattleResult}
        roguelikeFloor={run.floor}
        roguelikeMode={run.mode}
        combatSessionId={runCombatSessionId || `run:${run.seed}:${run.floor}`}
      />
    );
  }

  if (!run.inRun && campaign.active) {
    const selected = selectedCampaignNode;
    const rewardOptions = campaignRewardOptions(campaign);
    const eventOptions = campaignEventOptions(campaign);
    const map = campaignMapState;
    const rosterDeployment = deploymentSummary(roster);
    return (
      <div className="menu combat-workspace">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section combat-campaign-shell">
          <span className="section-label">MESA DE GUERRA · OPERACIÓN LA TORRE</span>
          <div className="combat-heading-row"><h2>Campaña de Combat Chess</h2><button type="button" className="context-help-btn" onClick={() => setShowCampaignTutorial(true)}>?</button></div>
          <p className="combat-operational-hint" title="La cartografía muestra rutas y tipos de sector. La fuerza enemiga precisa requiere inteligencia.">Elige tu siguiente sector.</p>

          {(() => {
            const nextStep = campaign.phase === 'map'
              ? 'Elige uno de los sectores iluminados en el mapa.'
              : campaign.phase === 'briefing'
                ? 'Revisa qué cambia y prepara tu ejército.'
                : campaign.phase === 'reward'
                  ? 'Elige una recompensa para seguir avanzando.'
                  : campaign.phase === 'camp'
                    ? 'Elige una ventaja y continúa.'
                    : campaign.phase === 'event'
                      ? 'Elige una respuesta al evento.'
                      : campaign.phase === 'completed'
                        ? 'Operación cumplida. Archiva la campaña.'
                        : 'Continúa con la siguiente fase.';
            return (
              <>
                <div className="campaign-quick-status" aria-label="Resumen de campaña">
                  <span>Sector <b>{Math.max(0, (campaign.route || []).length - 1)}/7</b></span>
                  <span title="Recurso temporal de esta campaña"><b>{campaign.operationalCredits}</b> suministros</span>
                  <span title="Fondos persistentes para mercado y bajas"><b>{roster.credits || 0}</b> créditos</span>
                  {rosterDeployment.fallenCount > 0 && <span className="danger-text"><b>{rosterDeployment.fallenCount}</b> bajas</span>}
                </div>
                <div className="campaign-command-actions" aria-label="Acciones de campaña">
                  <button type="button" className="secondary-btn campaign-market-primary" onClick={() => setShowMarket(true)}>▣ Mercado</button>
                  <button type="button" className="secondary-btn campaign-restart-action" onClick={handleRestartCampaign}>↻ Reiniciar campaña</button>
                </div>
                <div className={`campaign-situation-banner campaign-friendly-next ${rosterDeployment.fallenCount ? 'danger' : ''}`}>
                  <span>QUÉ HACER AHORA</span>
                  <strong>{nextStep}</strong>
                </div>
              </>
            );
          })()}

          {battleDebrief && <CombatDebrief debrief={battleDebrief} onViewBattle={onViewBattle} nextAction={campaign.phase === 'reward' ? 'Elige una recompensa para cerrar el sector.' : null} />}

          {campaign.phase === 'map' && map && (
            <>
              <CombatCampaignMap map={map} campaign={campaign} availableNodes={campaignAvailable} onSelect={handleCampaignNodeSelect} />
              <div className="game-controls">
                <button type="button" className="secondary-btn" onClick={() => finishCampaign('retired')}>Retirar la operación</button>
              </div>
            </>
          )}

          {campaign.phase === 'briefing' && selected && (
            <CampaignBriefing
              campaign={campaign}
              node={selected}
              armySummary={rosterDeployment}
              onBuyIntel={handleCampaignBuyIntel}
              onContinue={handleCampaignBriefingContinue}
              onRetire={() => finishCampaign('retired')}
            />
          )}

          {campaign.phase === 'reward' && selected && (
            <div className="tournament-result roguelike-reward-screen campaign-node-resolution">
              <span className="section-label">{selected.type === 'elite' ? 'BOTÍN ÉLITE' : 'SECTOR ASEGURADO'}</span>
              <h3>{selected.label}</h3>
              <p className="combat-operational-hint" title={selected.type === 'elite' ? 'La ventaja elegida entra con dos cargas y recibes un refuerzo permanente.' : 'La ventaja dura hasta terminar la campaña.'}>Elige recompensa.</p>
              <div className="roguelike-reward-grid">
                {rewardOptions.map((perk) => (
                  <button type="button" key={perk.id} className="roguelike-reward-card" onClick={() => handleCampaignReward(perk.id)}>
                    <strong>{perk.label}{selected.type === 'elite' ? ' ×2' : ''}</strong>
                    <span>{perk.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {campaign.phase === 'camp' && selected && (
            <div className="tournament-result campaign-node-resolution campaign-camp">
              <span className="section-label">CAMPAMENTO · NODO SEGURO</span>
              <h3>{selected.label}</h3>
              <p className="combat-operational-hint" title="Nodo seguro: sin batalla ni bajas. Añade un recluta de reserva y una ventaja de campaña.">Reorganiza y elige ventaja.</p>
              <div className="roguelike-reward-grid">
                {rewardOptions.map((perk) => (
                  <button type="button" key={perk.id} className="roguelike-reward-card" onClick={() => handleCampaignReward(perk.id)}>
                    <strong>{perk.label}</strong><span>{perk.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {campaign.phase === 'event' && selected && (
            <div className="tournament-result campaign-node-resolution campaign-event">
              <span className="section-label">EVENTO DE CAMPAÑA</span>
              <h3>{selected.label}</h3>
              <p className="combat-operational-hint" title="Cada respuesta tiene un coste o beneficio estratégico. Revisa el texto de cada opción antes de decidir.">Elige respuesta.</p>
              <div className="campaign-event-options">
                {eventOptions.map((option) => (
                  <button type="button" key={option.id} className="roguelike-reward-card" onClick={() => handleCampaignEvent(option.id)}>
                    <strong>{option.label}</strong><span>{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {campaign.phase === 'completed' && (
            <div className="tournament-result roguelike-boss-victory campaign-node-resolution">
              <span className="section-label">OPERACIÓN CUMPLIDA</span>
              <h3>{campaignBossForSeed(campaign.seed).label} ha caído.</h3>
              <p className="combat-operational-hint" title="La operación se archiva. Las ventajas temporales desaparecen; roster, medallas y bajas persistentes se conservan.">Operación archivada.</p>
              <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={() => finishCampaign('completed')}>Cerrar campaña victoriosa</button>
            </div>
          )}

          <details className="campaign-optional-panel campaign-session-details">
            <summary>Progreso, ejército y diario</summary>
            <div className="campaign-session-detail-grid">
              <span>Créditos <b>{roster.credits || 0}</b></span>
              <span>Efectivos <b>{rosterDeployment.totalRoster}</b></span>
              <span>Reserva <b>{rosterDeployment.reserveCount}</b></span>
            </div>
            {campaignRelics.length > 0 && (
              <div className="campaign-relic-rack" aria-label="Reliquias operativas de campaña">
                {campaignRelics.map((relic) => (
                  <div className="campaign-relic-chip" key={relic.id} title={relic.description}>
                    <span aria-hidden="true">{relic.icon}</span>
                    <div><strong>{relic.label}</strong></div>
                  </div>
                ))}
              </div>
            )}
            <CombatServicePanel summary={serviceSummary} compact />
            {(campaign.eventLog || []).length > 0 && (
              <div className="campaign-log simplified-log">
                <strong>Últimos movimientos</strong>
                <ul>{campaign.eventLog.slice(-4).reverse().map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ul>
              </div>
            )}
          </details>

          {showCampaignTutorial && <MechanicTutorialModal tutorialId="combat-campaign" onClose={() => setShowCampaignTutorial(false)} />}
          {showMarket && <CombatMarket roster={roster} serviceSummary={serviceSummary} onHire={handleHireMercenary} onBuyEquipment={handleBuyEquipment} onClose={() => setShowMarket(false)} />}
        </div>
      </div>
    );
  }

  return (
    <div className="menu">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section">
        {!run.inRun ? (
          <div className="campaign-home-simple campaign-home-friendly">
            <span className="section-label">{COMBAT_CHESS_GENRE}</span>
            <h2>{COMBAT_CHESS_NAME}</h2>
            <p className="hero-scope-note campaign-home-lead">
              Una campaña de ajedrez con un ejército que recuerda lo que le pasa. Las reglas nuevas aparecen poco a poco.
            </p>

            <div className="campaign-economy-strip" aria-label="Progreso de Combat">
              <span><small>RANGO</small><b>{serviceSummary.rank.label}</b></span>
              <span><small>CRÉDITOS</small><b>{roster.credits || 0}</b></span>
              <button type="button" onClick={() => setShowMarket(true)}>Abrir mercado →</button>
            </div>

            {!campaignEndResult && (
              <div className="campaign-home-action friendly">
                {campaignArchive[0]?.reason === 'interrupted' ? (
                  <>
                    <strong>Tu última operación puede recuperarse</strong>
                    <p className="hint-text">Se restaurarán su ruta, suministros y progreso sin inventar bajas.</p>
                    <button type="button" className="primary-btn campaign-home-primary" onClick={() => handleRecoverInterruptedCampaign(campaignArchive[0])}>
                      Recuperar campaña →
                    </button>
                  </>
                ) : (
                  <>
                    <strong>¿Listo para empezar?</strong>
                    <p className="hint-text">La primera batalla es sencilla. El juego te irá diciendo qué hacer después.</p>
                    <button type="button" className="primary-btn campaign-home-primary" onClick={handleStartCampaign}>
                      Empezar campaña →
                    </button>
                  </>
                )}
              </div>
            )}

            {battleDebrief && <CombatDebrief debrief={battleDebrief} compact onViewBattle={onViewBattle} />}

            <details className="campaign-home-details campaign-home-more">
              <summary>Ver progreso y opciones</summary>
              <div className="campaign-home-details-stack">
                <div className="campaign-home-about">
                  <strong>¿Qué hay en la campaña?</strong>
                  <p className="hint-text">Son 7 sectores. Encontrarás combates, descansos, eventos y un boss final. Si una batalla cambia alguna regla, se explica antes de jugar.</p>
                  <div className="roguelike-objective-strip compact">
                    <span>⚔ Combate</span>
                    <span>⛺ Descanso</span>
                    <span>? Evento</span>
                    <span>♚ Boss</span>
                  </div>
                </div>

                <details className="campaign-home-subdetails">
                  <summary>Ejército y veteranos</summary>
                  <p className="hint-text">Tus piezas conservan veteranía, rangos, medallas y bajas entre campañas.</p>
                  <CampaignArmyGlance roster={roster} />
                  <CombatServicePanel summary={serviceSummary} compact />
                  <ArmyRosterPanel
                    roster={roster}
                    embedded
                    onBuy={handleBuyRosterStat}
                    onRevive={handleReviveRosterPiece}
                    onRename={handleRenameRosterPiece}
                    onMetamorphose={handleMetamorphoseRosterPiece}
                    onUnlockTechnique={handleUnlockRosterTechnique}
                    onEquipTechnique={handleEquipRosterTechnique}
                    onRequestBio={handleRequestUnitBio}
                  />
                </details>

                {(campaignBestStage > 0 || bestFloor > 0 || towerCompleted) && (
                  <div className="campaign-home-progress-summary">
                    <strong>Tu progreso</strong>
                    {campaignBestStage > 0 && <span>Mejor campaña: sector <b>{campaignBestStage}/7</b></span>}
                    {bestFloor > 0 && <span>Torre clásica: piso <b>{bestFloor}</b></span>}
                    {towerCompleted && <span>✓ Torre completada · infinito desbloqueado</span>}
                  </div>
                )}

                {campaignArchive.length > 0 && (
                  <details className="campaign-home-subdetails">
                    <summary>Campañas anteriores · {campaignArchive.length}</summary>
                    <div className="campaign-operation-list">
                      {campaignArchive.slice(0, 6).map((operation) => (
                        <div className="campaign-operation-row" key={operation.id}>
                          <span className={`campaign-operation-result ${operation.reason}`}>{operation.reason === 'completed' ? '✓' : operation.reason === 'retired' ? '↩' : operation.reason === 'restarted' ? '↻' : '×'}</span>
                          <div>
                            <strong>{operation.reason === 'completed' ? 'Completada' : operation.reason === 'retired' ? 'Retirada' : operation.reason === 'restarted' ? 'Reiniciada' : operation.reason === 'interrupted' ? 'Interrumpida' : 'Perdida'}</strong>
                            <small>Sector {operation.stage}/7 · {operation.cleared} nodos</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </details>
            {showMarket && <CombatMarket roster={roster} serviceSummary={serviceSummary} onHire={handleHireMercenary} onBuyEquipment={handleBuyEquipment} onClose={() => setShowMarket(false)} />}
          </div>
        ) : (
          <>
            <span className="section-label">{COMBAT_CHESS_GENRE}</span>
            <h2>{COMBAT_CHESS_NAME} · Torre clásica</h2>
          </>
        )}

        {!run.inRun && campaignEndResult && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>{campaignEndResult.reason === 'completed' ? 'Operación completada.' : campaignEndResult.reason === 'retired' ? 'Retirada ordenada.' : campaignEndResult.reason === 'interrupted' ? 'Operación interrumpida.' : 'Operación perdida.'}</h3>
            <p className="hint-text">Sector alcanzado: <b>{campaignEndResult.stage}/7</b>. El ejército persistente conserva sus expedientes y bajas.</p>
            {campaignEndResult.reason === 'interrupted' && campaignEndResult.archiveEntry ? (
              <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={() => handleRecoverInterruptedCampaign(campaignEndResult.archiveEntry)}>Recuperar campaña</button>
            ) : (
              <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartCampaign}>Nueva campaña</button>
            )}
          </div>
        )}

        {run.inRun && run.phase === 'cleared' && (
          <div className="tournament-result roguelike-reward-screen" style={{ marginTop: '0.8rem' }}>
            <h3>¡Piso {run.floor} superado!</h3>
            <p className="hint-text">Elige <b>una</b> ventaja para el resto de este intento.</p>
            <div className="roguelike-reward-grid">
              {rewardOptions.map((perk) => {
                const selected = run.rewardChosenForFloor === run.floor && (run.perks || []).at(-1) === perk.id;
                return (
                  <button
                    type="button"
                    key={perk.id}
                    className={`roguelike-reward-card ${selected ? 'selected' : ''}`}
                    disabled={run.rewardChosenForFloor === run.floor}
                    onClick={() => handleChooseReward(perk.id)}
                  >
                    <strong>{perk.label}</strong>
                    <span>{perk.description}</span>
                  </button>
                );
              })}
            </div>

            {run.rewardChosenForFloor === run.floor && (
              <>
                <p className="hint-text" style={{ marginTop: '0.8rem' }}>
                  Siguiente encuentro: <b>{nextEncounter?.label || 'desconocido'}</b>. {nextEncounter?.description || ''}
                </p>
                <div className="game-controls">
                  <button type="button" className="primary-btn" onClick={handleContinue}>Seguir al piso {run.floor + 1}</button>
                  <button type="button" className="secondary-btn" onClick={handleRetire}>Retirarme aquí</button>
                </div>
              </>
            )}
          </div>
        )}

        {run.inRun && run.phase === 'completed' && (
          <div className="tournament-result roguelike-boss-victory" style={{ marginTop: '0.8rem' }}>
            <span className="section-label">OBJETIVO CUMPLIDO</span>
            <h3>{ROGUELIKE_BOSS.label} ha caído.</h3>
            <p className="hero-scope-note">Diez pisos. Cinco puntos de vida. Ninguna necesidad de fingir que esto era una partida normal.</p>
            <div className="game-controls">
              <button type="button" className="primary-btn" onClick={handleContinueEndless}>Seguir en modo infinito → piso 11</button>
              <button type="button" className="secondary-btn" onClick={() => finishRun('completed')}>Cerrar el intento victorioso</button>
            </div>
          </div>
        )}

        {endResult?.type === 'over' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>Intento terminado — llegaste al piso {endResult.reached}</h3>
            <p className="hint-text">{endResult.newBest ? '¡Nueva marca!' : `Tu mejor marca sigue siendo el piso ${bestFloor}.`}</p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>Intentar de nuevo</button>
          </div>
        )}

        {endResult?.type === 'interrupted' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>Intento interrumpido en el piso {endResult.reached}</h3>
            <p className="hint-text">{endResult.newBest ? 'Cuenta como piso alcanzado, no superado. Nueva marca de llegada.' : `Tu mejor marca sigue siendo el piso ${bestFloor}.`}</p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>Empezar otro intento</button>
          </div>
        )}

        {endResult?.type === 'retired' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>Te retiraste en el piso {endResult.reached}</h3>
            <p className="hint-text">{endResult.newBest ? '¡Nueva marca!' : `Tu mejor marca sigue siendo el piso ${bestFloor}.`}</p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>Empezar otro intento</button>
          </div>
        )}

        {endResult?.type === 'completed' && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>Intento completado.</h3>
            <p className="hint-text">La Torre ya consta en tu expediente. El modo infinito queda desbloqueado.</p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartRun}>Subir otra vez</button>
          </div>
        )}
      </div>
    </div>
  );
}
