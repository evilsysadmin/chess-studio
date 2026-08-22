import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import CombatScreen from './CombatScreen.jsx';
import CombatServicePanel from './CombatServicePanel.jsx';
import { ArmyRosterPanel } from './ArmyScreen.jsx';
import CombatCampaignMap from './CombatCampaignMap.jsx';
import CampaignBriefing from './CampaignBriefing.jsx';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import CombatDebrief from './CombatDebrief.jsx';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { applyModifierToFen, encounterForRun } from '../roguelikeModifiers.js';
import { buyStatPoint } from '../combat.js';
import { loadRoster, saveRoster, revivePiece, renameRosterIdentity } from '../combatRoster.js';
import { setRosterDeploymentType } from '../combatMetamorphosis.js';
import { deploymentSummary, grantReserveRecruit, reserveRecruitTypeForNode } from '../combatDeployment.js';
import { unlockRosterTechnique, setRosterEquippedTechnique } from '../combatTechniques.js';
import { rewardOptionsForFloor, perkById } from '../roguelikePerks.js';
import { ROGUELIKE_BOSS, ROGUELIKE_BOSS_FLOOR } from '../roguelikeBoss.js';
import { loadCombatService, summarizeCombatService } from '../combatService.js';
import { COMBAT_CHESS_NAME, COMBAT_CHESS_GENRE, COMBAT_CHESS_TAGLINE } from '../combatChessBrand.js';
import { hasCombatSession } from '../combatSession.js';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';
import {
  loadCampaign,
  startCampaign,
  campaignMap,
  campaignNode,
  availableCampaignNodes,
  selectCampaignNode,
  markCampaignBattleStarted,
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
  loadCampaignArchive,
} from '../combatCampaign.js';
import {
  loadRun,
  startNewRun,
  markBattleStarted,
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

export default function RoguelikeScreen({ onExit, onError, onHistory, onViewBattle }) {
  const [run, setRun] = useState(() => loadRun());
  const [campaign, setCampaign] = useState(() => loadCampaign());
  const [campaignBestStage, setCampaignBestStage] = useState(() => loadCampaignBestStage());
  const [campaignEndResult, setCampaignEndResult] = useState(null);
  const [campaignArchive, setCampaignArchive] = useState(() => loadCampaignArchive());
  const [bestFloor, setBestFloor] = useState(() => loadBestFloor());
  const [towerCompleted, setTowerCompleted] = useState(() => loadTowerCompleted());
  const [endResult, setEndResult] = useState(null); // { type, reached, newBest }
  const [combatSessionActive, setCombatSessionActive] = useState(() => {
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
  const serviceSummary = useMemo(() => summarizeCombatService(serviceRecord), [serviceRecord]);

  useEscapeToClose(onExit, {
    disabled:
      (run.inRun && (run.phase === 'battle' || (run.phase === 'fighting' && combatSessionActive))) ||
      (campaign.active && (campaign.phase === 'battle' || (campaign.phase === 'fighting' && combatSessionActive))),
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

  function handleCampaignBattleStarted() {
    setBattleDebrief(null);
    setCombatSessionActive(true);
    setCampaign((current) => markCampaignBattleStarted(current));
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

  function handleCampaignBattleResult(outcome, debrief = null) {
    setBattleDebrief(debrief);
    setCombatSessionActive(false);
    setServiceRecord(loadCombatService());
    setRoster(loadRoster());
    if (outcome === 'win') {
      setCampaign((current) => markCampaignBattleWon(current));
      setTowerCompleted(loadTowerCompleted());
      setBestFloor(loadBestFloor());
      setCampaignBestStage(loadCampaignBestStage());
      return;
    }
    finishCampaign(outcome === 'retired' ? 'retired' : 'over');
  }

  function handleCampaignReward(perkId) {
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

  function handleBattleStarted() {
    setBattleDebrief(null);
    setCombatSessionActive(true);
    setRun((current) => markBattleStarted(current));
  }

  function handleBattleResult(outcome, debrief = null) {
    setBattleDebrief(debrief);
    setCombatSessionActive(false);
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

  if (!run.inRun && campaign.active && campaign.phase === 'fighting' && !combatSessionActive) {
    return (
      <div className="menu">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section roguelike-interrupted">
          <span className="section-label">{COMBAT_CHESS_NAME} · integridad de campaña</span>
          <h2>La batalla quedó interrumpida</h2>
          <p className="hero-scope-note">
            El nodo ya había entrado en combate. Repetirlo desde cero permitiría rerollear bajas y ataques: la campaña lo trata como operación perdida.
          </p>
          <button type="button" className="primary-btn" style={{ width: '100%', marginTop: '0.8rem' }} onClick={() => finishCampaign('interrupted')}>
            Cerrar la operación interrumpida
          </button>
        </div>
      </div>
    );
  }

  if (!run.inRun && campaign.active && (campaign.phase === 'battle' || (campaign.phase === 'fighting' && combatSessionActive))) {
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
        initialFen={campaignFen}
        forcedHumanColor={HUMAN_COLOR}
        difficultyOverride={campaignDifficulty(campaign, node)}
        difficultyLabel={`${node?.typeLabel || 'Operación'} · Sector ${node?.stage || '?'}${delta ? ` · inteligencia ${delta > 0 ? '+' : ''}${delta}` : ''}`}
        encounterLabel={node?.label}
        encounterDescription={node?.description}
        encounterTier={node?.tier}
        encounterIntel={encounterIntel}
        combatVariant="roguelike"
        runPerks={campaign.perks || []}
        runPerkDetails={campaignPerkDetails}
        bossConfig={isBoss ? ROGUELIKE_BOSS : null}
        onBattleStart={handleCampaignBattleStarted}
        onBattleResult={handleCampaignBattleResult}
        roguelikeFloor={node?.floor || node?.stage || 1}
        roguelikeMode="campaign"
        combatSessionId={`campaign:${campaign.seed}:${node?.id || 'node'}`}
      />
    );
  }

  if (run.inRun && run.phase === 'fighting' && !combatSessionActive) {
    return (
      <div className="menu">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section roguelike-interrupted">
          <span className="section-label">{COMBAT_CHESS_NAME} · integridad del intento</span>
          <h2>La pelea quedó interrumpida</h2>
          <p className="hero-scope-note">
            Este piso ya había empezado y la sesión desapareció antes de resolverlo. Reiniciarlo desde cero
            permitiría repetir tiradas y posiciones hasta que saliera una buena: save-scum de manual.
          </p>
          <p className="hint-text">
            El intento se considera perdido. Tu ejército guardado conserva el último estado que llegó a persistirse;
            no se inventan bajas que el juego no llegó a registrar.
          </p>
          <button type="button" className="primary-btn" style={{ width: '100%', marginTop: '0.8rem' }} onClick={() => finishRun('interrupted')}>
            Cerrar el intento interrumpido
          </button>
        </div>
      </div>
    );
  }

  if (run.inRun && (run.phase === 'battle' || (run.phase === 'fighting' && combatSessionActive))) {
    const isBoss = run.mode === 'tower' && run.floor === ROGUELIKE_BOSS_FLOOR;
    return (
      <CombatScreen
        key={`${run.seed}-${run.floor}-${encounter?.id || 'encounter'}`}
        onExit={onExit}
        onError={onError}
        onHistory={onHistory}
        onViewBattle={onViewBattle}
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
        combatSessionId={`run:${run.seed}:${run.floor}`}
      />
    );
  }

  if (!run.inRun && campaign.active) {
    const selected = selectedCampaignNode;
    const rewardOptions = campaignRewardOptions(campaign);
    const eventOptions = campaignEventOptions(campaign);
    const map = campaignMapState;
    return (
      <div className="menu combat-workspace">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section combat-campaign-shell">
          <span className="section-label">{COMBAT_CHESS_NAME} · Campaña procedural</span>
          <div className="combat-heading-row"><h2>Operación La Torre</h2><button type="button" className="context-help-btn" onClick={() => setShowCampaignTutorial(true)}>?</button></div>
          <p className="combat-operational-hint" title="Los detalles de campaña están en el tutorial. El mapa muestra rutas y tipos de nodo, pero no revela inteligencia enemiga no comprada.">Selecciona una ruta conectada.</p>

          <div className="campaign-status-strip">
            <span>Ruta <b>{Math.max(0, (campaign.route || []).length - 1)}/7</b></span>
            <span>Ventajas <b>{campaign.perks.length}</b></span>
            <span>Barracón <b>{deploymentSummary(roster).totalRoster}</b></span>
            <span>Créditos <b>{campaign.operationalCredits}</b></span>
            <span>Reliquias <b>{campaignRelics.length}</b></span>
            <span>Modif. siguiente <b>{campaign.nextDifficultyDelta === 0 ? 'ninguno' : `${campaign.nextDifficultyDelta > 0 ? '+' : ''}${campaign.nextDifficultyDelta} CPU`}</b></span>
          </div>

          {battleDebrief && <CombatDebrief debrief={battleDebrief} compact onViewBattle={onViewBattle} />}

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
              <h3>El Rey Viejo ha caído.</h3>
              <p className="combat-operational-hint" title="La operación se archiva. Las ventajas temporales desaparecen; roster, medallas y bajas persistentes se conservan.">Operación archivada.</p>
              <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={() => finishCampaign('completed')}>Cerrar campaña victoriosa</button>
            </div>
          )}

          {showCampaignTutorial && <MechanicTutorialModal tutorialId="combat-campaign" onClose={() => setShowCampaignTutorial(false)} />}

          <CombatServicePanel summary={serviceSummary} compact />
          {(campaign.eventLog || []).length > 0 && (
            <details className="campaign-log">
              <summary>Diario de operación</summary>
              <ul>{campaign.eventLog.slice(-6).reverse().map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ul>
            </details>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="menu">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div className="menu-section">
        <span className="section-label">{COMBAT_CHESS_GENRE}</span>
        <h2>{COMBAT_CHESS_NAME} · Campaña</h2>
        <p className="hero-scope-note">
          {COMBAT_CHESS_TAGLINE} La Torre ahora es una <b>campaña por rutas</b>: combate, élites, campamentos, eventos y un Rey Boss con 5 HP.
        </p>
        <p className="hint-text" style={{ marginTop: '0.55rem' }}>
          Usas tu <b>ejército persistente de Combat Chess</b>. Su veteranía persiste fuera del intento; las ventajas que eliges
          dentro de la campaña son temporales y desaparecen cuando la operación termina.
        </p>

        <div className="roguelike-objective-strip">
          <span>⚔ Combate</span>
          <span>☠ Élite</span>
          <span>⛺ Campamento</span>
          <span>? Evento</span>
          <span>♚ REY BOSS ♥♥♥♥♥</span>
        </div>

        <CombatServicePanel summary={serviceSummary} compact />

        {battleDebrief && <CombatDebrief debrief={battleDebrief} compact onViewBattle={onViewBattle} />}

        <ArmyRosterPanel
          roster={roster}
          embedded
          onBuy={handleBuyRosterStat}
          onRevive={handleReviveRosterPiece}
          onRename={handleRenameRosterPiece}
          onMetamorphose={handleMetamorphoseRosterPiece}
          onUnlockTechnique={handleUnlockRosterTechnique}
          onEquipTechnique={handleEquipRosterTechnique}
        />

        {campaignBestStage > 0 && <p className="hint-text">Mejor sector de campaña alcanzado: <b>{campaignBestStage}/7</b></p>}
        {bestFloor > 0 && <p className="hint-text">Marca histórica de La Torre clásica: <b>piso {bestFloor}</b></p>}
        {towerCompleted && <p className="hint-text roguelike-completed-mark">✓ Torre completada al menos una vez · infinito desbloqueado</p>}

        {campaignArchive.length > 0 && (
          <details className="campaign-operation-archive">
            <summary>Archivo de operaciones · {campaignArchive.length}</summary>
            <div className="campaign-operation-list">
              {campaignArchive.slice(0, 6).map((operation) => (
                <div className="campaign-operation-row" key={operation.id}>
                  <span className={`campaign-operation-result ${operation.reason}`}>{operation.reason === 'completed' ? '✓' : operation.reason === 'retired' ? '↩' : '×'}</span>
                  <div>
                    <strong>{operation.reason === 'completed' ? 'Operación completada' : operation.reason === 'retired' ? 'Retirada' : operation.reason === 'interrupted' ? 'Interrumpida' : 'Operación perdida'}</strong>
                    <small>Sector {operation.stage}/7 · {operation.cleared} nodos · {operation.relicIds?.length || 0} reliquias · {operation.credits} créditos</small>
                    <span>{(operation.routeLabels || []).slice(1).join(' → ') || 'Sin salir de la base'}</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {!run.inRun && !endResult && !campaignEndResult && (
          <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartCampaign}>
            Iniciar Operación La Torre
          </button>
        )}

        {!run.inRun && campaignEndResult && (
          <div className="tournament-result" style={{ marginTop: '0.8rem' }}>
            <h3>{campaignEndResult.reason === 'completed' ? 'Operación completada.' : campaignEndResult.reason === 'retired' ? 'Retirada ordenada.' : campaignEndResult.reason === 'interrupted' ? 'Operación interrumpida.' : 'Operación perdida.'}</h3>
            <p className="hint-text">Sector alcanzado: <b>{campaignEndResult.stage}/7</b>. El ejército persistente conserva sus expedientes y bajas.</p>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={handleStartCampaign}>Nueva campaña</button>
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
            <h3>El Rey Viejo ha caído.</h3>
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
