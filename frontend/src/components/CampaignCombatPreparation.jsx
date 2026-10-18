import { useState } from 'react';
import ArmyScreen from './ArmyScreen.jsx';
import CombatDeploymentView from './CombatDeploymentView.jsx';
import CombatPreparationRoom from './CombatPreparationRoom.jsx';
import CombatServicePanel from './CombatServicePanel.jsx';
import CampaignArmyGlance from './CampaignArmyGlance.jsx';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { deploymentSummary } from '../combatDeployment.js';
import { buildTacticalDeploymentBrief } from '../combatTacticalDeployment.js';
import { combatPreparationChoice } from '../combatPreparationChoice.js';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';
import './CampaignCombatPreparationRoom.css';

export default function CampaignCombatPreparation({
  onExit,
  difficulty,
  difficultyBalance,
  difficultyLabel,
  encounterLabel,
  encounterDescription,
  encounterTier,
  encounterIntel,
  bossConfig,
  runPerks,
  autoLevelUpEnabled,
  setAutoLevelUpEnabled,
  roster,
  deadCount,
  handleStartBattleClick,
  handleQuickStartBattle,
  showArmy,
  setShowArmy,
  showDeployment,
  setShowDeployment,
  deploymentConfirmed,
  handleConfirmDeployment,
  handleBuyRosterStat,
  handleReviveRosterPiece,
  handleReplaceRosterPiece,
  handleRenameRosterPiece,
  handleMetamorphoseRosterPiece,
  handleDeployRosterUnit,
  handleRemoveDeployedUnit,
  handleResetDeployment,
  handleAutofillDeployment,
  handleApplyDeploymentPreset,
  handleUnlockRosterTechnique,
  handleEquipRosterTechnique,
  handleResetRoster,
  onHistory,
  serviceSummary,
  onOpenMarket,
  onOpenMarketFromDeployment,
}) {
  const deploy = deploymentSummary(roster);
  const tactical = buildTacticalDeploymentBrief(roster, { difficultyBalance });
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-deployment']?.seen);
  const missing = Math.max(0, deploy.totalSlots - deploy.assignedCount);
  const intelLabel = encounterIntel?.level === 0
    ? 'Sin estimar'
    : encounterIntel?.level === 1
      ? encounterIntel.threatBand || `CPU ${encounterIntel.threatRange}`
      : `CPU ${encounterIntel?.exactDifficulty ?? difficulty}`;
  const nextStep = combatPreparationChoice({
    deadCount, ready: deploy.ready, missing, confirmed: deploymentConfirmed,
  });
  const doPrimaryAction = nextStep.action === 'resolve'
    ? () => setShowDeployment(true)
    : nextStep.action === 'start' ? handleStartBattleClick : handleQuickStartBattle;

  return (
    <div className={`menu combat-setup campaign-preparation-screen combat-operations-screen${showDeployment ? ' combat-deployment-active' : ''}`}>
      <section className="campaign-preparation-shell simplified-stage combat-operations-shell" aria-label="Preparación de Combat Chess">
        <CombatPreparationRoom roster={roster} onCustomize={() => setShowDeployment(true)} />

        <div className="combat-operations-topbar">
          <button className="back-link combat-operations-exit" onClick={onExit}>← Salir de Combat Chess</button>
          <div className="combat-operations-mode-chip">
            <span>COMBAT CHESS</span>
            <b>{encounterTier || 'operación'}</b>
          </div>
          <button type="button" className="context-help-btn combat-operations-help" onClick={() => setShowTutorial(true)} aria-label="Tutorial de despliegue">?</button>
        </div>

        <header className="campaign-operation-heading campaign-preparation-heading simplified-heading combat-operations-briefing">
          <span className="section-label">SALA DE OPERACIONES</span>
          <h2>{encounterLabel || 'Siguiente batalla'}</h2>
          <p>{encounterDescription || 'Decide qué piezas entran en combate.'}</p>
          {bossConfig && (
            <span className="combat-operations-boss-chip" title={bossConfig.mechanicDescription || undefined}>
              Rey jefe · {bossConfig.maxHp} HP · {bossConfig.mechanicLabel}
            </span>
          )}
        </header>

        <div className="campaign-preparation-quick-status combat-operations-status" aria-label="Resumen de preparación">
          <span>Tu ejército <b>{tactical.deployedCount}/{tactical.battleSlots}</b></span>
          {deadCount > 0 && <span className="danger-text">Bajas <b>{deadCount}</b></span>}
          <span>Rival <b>{intelLabel}</b></span>
          <button type="button" className="campaign-market-link" onClick={onOpenMarket}>Mercado · {roster.credits || 0} cr →</button>
        </div>

        <div className="campaign-operation-primary-zone campaign-preparation-primary-zone friendly-primary-zone combat-operations-primary">
          <div>
            <span>{nextStep.cue}</span>
            <small id="combat-operation-next-step" role="status">{nextStep.help}</small>
          </div>
          <div className="combat-operations-primary-actions">
            <button type="button" className="primary-btn campaign-main-cta"
              aria-describedby="combat-operation-next-step" onClick={doPrimaryAction}>
              {nextStep.label}
            </button>
            {deadCount === 0 && (
              <button type="button" className="secondary-btn campaign-recommended-formation" onClick={() => setShowDeployment(true)}>
                {deploymentConfirmed ? 'Cambiar formación' : 'Elegir mis piezas'}
              </button>
            )}
          </div>
        </div>

        <details className="campaign-optional-panel campaign-preparation-options combat-operations-drawer">
          <summary>Más opciones · inteligencia y veteranos</summary>
          <div className="combat-operations-drawer-body">
            <div className="campaign-preparation-secondary-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowArmy(true)}>Ejército y veteranos</button>
              {onHistory && <button type="button" className="secondary-btn" onClick={onHistory}>Batallas anteriores</button>}
            </div>

            {Array.isArray(runPerks) && runPerks.length > 0 && (
              <div className="campaign-preparation-perks" aria-label="Ventajas activas">
                <span>VENTAJAS ACTIVAS</span>
                <div>{runPerks.map((perk, index) => <em key={`${perk.id}-${index}`} title={perk.description}>{perk.label}</em>)}</div>
              </div>
            )}

            <div className="campaign-operation-details-grid">
              <label className="auto-level-toggle compact">
                <input type="checkbox" checked={autoLevelUpEnabled} onChange={(event) => setAutoLevelUpEnabled(event.target.checked)} />
                <span>Auto-subida al terminar</span>
              </label>
              <span>Dificultad: <b>{encounterIntel && encounterIntel.level < 2 ? intelLabel : (difficultyLabel || difficulty)}</b></span>
              {tactical.threatBonus > 0 && !(encounterIntel && encounterIntel.level < 2) && (
                <span>Ajuste de fuerza desplegada: <b>+{tactical.threatBonus}</b> · {tactical.threatTier || 'amenaza activa'}</span>
              )}
              <span>Barracón: <b>{tactical.barracksCount}</b> · Desplegados: <b>{tactical.deployedCount}</b> · Reserva: <b>{tactical.reserveCount}</b>{tactical.protectedVeteranCount > 0 ? <> · Veteranos protegidos: <b>{tactical.protectedVeteranCount}</b></> : null} · Créditos: <b>{roster.credits || 0}</b></span>
              <button type="button" className="secondary-btn combat-reset-link" onClick={handleResetRoster}>Reiniciar progreso persistente</button>
            </div>

            <CampaignArmyGlance roster={roster} />
            <CombatServicePanel summary={serviceSummary} compact />
          </div>
        </details>
      </section>

      {showDeployment && (
        <CombatDeploymentView
          roster={roster}
          onDeployUnit={handleDeployRosterUnit}
          onRemoveUnit={handleRemoveDeployedUnit}
          onResetDeployment={handleResetDeployment}
          onAutoFill={handleAutofillDeployment}
          onApplyPreset={handleApplyDeploymentPreset}
          onMetamorphose={handleMetamorphoseRosterPiece}
          onRename={handleRenameRosterPiece}
          onBuy={handleBuyRosterStat}
          onRevive={handleReviveRosterPiece}
          onReplaceFallen={handleReplaceRosterPiece}
          onOpenMarket={onOpenMarketFromDeployment || onOpenMarket}
          onClose={() => setShowDeployment(false)}
          onConfirm={handleConfirmDeployment}
          requireExplicitConfirmation
        />
      )}

      {showArmy && (
        <ArmyScreen
          roster={roster}
          onBuy={handleBuyRosterStat}
          onRevive={handleReviveRosterPiece}
          onRename={handleRenameRosterPiece}
          onMetamorphose={handleMetamorphoseRosterPiece}
          onUnlockTechnique={handleUnlockRosterTechnique}
          onEquipTechnique={handleEquipRosterTechnique}
          onClose={() => setShowArmy(false)}
        />
      )}

      {showTutorial && <MechanicTutorialModal tutorialId="combat-deployment" onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
