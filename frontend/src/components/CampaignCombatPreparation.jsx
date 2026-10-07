import { useState } from 'react';
import ArmyScreen from './ArmyScreen.jsx';
import CombatDeploymentView from './CombatDeploymentView.jsx';
import CombatPreparationRoom from './CombatPreparationRoom.jsx';
import CombatServicePanel from './CombatServicePanel.jsx';
import CampaignArmyGlance from './CampaignArmyGlance.jsx';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { deploymentSummary } from '../combatDeployment.js';
import { buildTacticalDeploymentBrief } from '../combatTacticalDeployment.js';
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
  const nextAction = deadCount > 0
    ? `Tienes ${deadCount} baja${deadCount === 1 ? '' : 's'} pendiente${deadCount === 1 ? '' : 's'}. Resuélvela antes de combatir.`
    : !deploy.ready
      ? `Faltan ${missing} puesto${missing === 1 ? '' : 's'}. Puedes jugar con la recomendada o personalizarla.`
      : !deploymentConfirmed
        ? 'La formación está lista. Puedes jugar ya o personalizarla.'
        : 'Todo listo. Puedes iniciar el combate.';

  return (
    <div className={`menu combat-setup campaign-preparation-screen combat-operations-screen${showDeployment ? ' combat-deployment-active' : ''}`}>
      <section className="campaign-preparation-shell simplified-stage combat-operations-shell" aria-label="Preparación de Combat Chess">
        <CombatPreparationRoom roster={roster} />

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
          <span>Formación <b>{tactical.deployedCount}/{tactical.battleSlots}</b></span>
          {tactical.reserveCount > 0 && <span>Reserva <b>{tactical.reserveCount}</b></span>}
          {deadCount > 0 && <span className="danger-text">Bajas <b>{deadCount}</b></span>}
          <span>Amenaza <b>{intelLabel}</b></span>
          <button type="button" className="campaign-market-link" onClick={onOpenMarket}>Mercado · {roster.credits || 0} cr →</button>
        </div>

        <div className={`campaign-situation-banner combat-operations-order ${deploymentConfirmed ? 'ready' : deadCount ? 'danger' : ''}`}>
          <span>ORDEN ACTUAL</span>
          <strong>{nextAction}</strong>
        </div>

        <div className="campaign-operation-primary-zone campaign-preparation-primary-zone friendly-primary-zone combat-operations-primary">
          <div>
            <span>{deadCount > 0 ? 'BAJAS PENDIENTES' : deploymentConfirmed ? 'LISTO PARA COMBATIR' : 'FORMACIÓN DE COMBATE'}</span>
            <small>{deadCount > 0
              ? 'Una baja puede implicar perder una identidad. Decide antes de avanzar.'
              : deploymentConfirmed
                ? 'La formación ya está confirmada.'
                : deploy.ready
                  ? 'Puedes entrar ya con esta formación o ajustarla antes.'
                  : 'La recomendada cubre los puestos vacíos sin tocar reservas innecesarias.'}</small>
          </div>
          <div className="combat-operations-primary-actions">
            {deadCount > 0 ? (
              <button type="button" className="primary-btn campaign-main-cta" onClick={() => setShowDeployment(true)}>RESOLVER BAJAS →</button>
            ) : deploymentConfirmed ? (
              <button type="button" className="primary-btn campaign-main-cta" onClick={handleStartBattleClick}>INICIAR COMBATE →</button>
            ) : (
              <button type="button" className="primary-btn campaign-main-cta" onClick={handleQuickStartBattle}>
                {deploy.ready ? 'JUGAR CON ESTA FORMACIÓN →' : 'JUGAR CON FORMACIÓN RECOMENDADA →'}
              </button>
            )}

            {deadCount === 0 && !deploymentConfirmed && (
              <button type="button" className="secondary-btn campaign-recommended-formation" onClick={() => setShowDeployment(true)}>
                Personalizar despliegue
              </button>
            )}
            {deploymentConfirmed && (
              <button type="button" className="secondary-btn campaign-recommended-formation" onClick={() => setShowDeployment(true)}>
                Revisar despliegue
              </button>
            )}
          </div>
        </div>

        <details className="campaign-optional-panel campaign-preparation-options combat-operations-drawer">
          <summary>Inteligencia y logística</summary>
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
