import { useState } from 'react';
import ArmyScreen from './ArmyScreen.jsx';
import CombatDeploymentView from './CombatDeploymentView.jsx';
import CombatServicePanel from './CombatServicePanel.jsx';
import CampaignOperationSteps from './CampaignOperationSteps.jsx';
import CampaignArmyGlance from './CampaignArmyGlance.jsx';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { deploymentSummary } from '../combatDeployment.js';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';

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
  rosterCount,
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
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-deployment']?.seen);
  const missing = Math.max(0, deploy.totalSlots - deploy.assignedCount);
  const veteranCount = Object.values(roster?.pieces || {}).filter((piece) => piece?.alive !== false && ((piece?.strengthPoints || 0) + (piece?.speedPoints || 0)) > 0).length;
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
    <div className="menu combat-setup campaign-preparation-screen">
      <button className="back-link" onClick={onExit}>← Salir de Combat Chess</button>

      <section className="menu-section campaign-preparation-shell simplified-stage">
        <CampaignOperationSteps active="deployment" />

        <header className="campaign-operation-heading campaign-preparation-heading simplified-heading">
          <div>
            <span className="section-label">PREPARA TU EJÉRCITO</span>
            <h2>{encounterLabel || 'Siguiente batalla'}</h2>
            <p>{encounterDescription || 'Decide qué piezas entran en combate.'}</p>
          </div>
          <button type="button" className="context-help-btn" onClick={() => setShowTutorial(true)} aria-label="Tutorial de despliegue">?</button>
        </header>

        <div className="campaign-preparation-quick-status" aria-label="Resumen de preparación">
          <span>Formación <b>{deploy.assignedCount}/{deploy.totalSlots}</b></span>
          {deadCount > 0 && <span className="danger-text">Bajas <b>{deadCount}</b></span>}
          <span>Amenaza <b>{intelLabel}</b></span>
          <button type="button" className="campaign-market-link" onClick={onOpenMarket}>Mercado · {roster.credits || 0} cr →</button>
        </div>

        <div className={`campaign-situation-banner ${deploymentConfirmed ? 'ready' : deadCount ? 'danger' : ''}`}>
          <span>QUÉ HACER AHORA</span>
          <strong>{nextAction}</strong>
        </div>

        <div className="campaign-operation-primary-zone campaign-preparation-primary-zone friendly-primary-zone">
          <div>
            <span>{deadCount > 0 ? 'BAJAS PENDIENTES' : deploymentConfirmed ? 'LISTO PARA COMBATIR' : 'JUGAR CON DEFAULTS'}</span>
            <small>{deadCount > 0
              ? 'Una baja puede implicar perder una identidad: aquí sí te pedimos decidir.'
              : deploymentConfirmed
                ? 'La formación ya está confirmada.'
                : deploy.ready
                  ? 'Un clic usa la formación actual.'
                  : 'Un clic completa los huecos con la formación recomendada y entra.'}</small>
          </div>
          {deadCount > 0 ? (
            <button type="button" className="primary-btn campaign-main-cta" onClick={() => setShowDeployment(true)}>RESOLVER BAJAS →</button>
          ) : deploymentConfirmed ? (
            <button type="button" className="primary-btn campaign-main-cta" onClick={handleStartBattleClick}>INICIAR COMBATE →</button>
          ) : (
            <button type="button" className="primary-btn campaign-main-cta" onClick={handleQuickStartBattle}>
              {deploy.ready ? 'JUGAR CON ESTA FORMACIÓN →' : 'JUGAR CON FORMACIÓN RECOMENDADA →'}
            </button>
          )}
        </div>

        {deadCount === 0 && !deploymentConfirmed && (
          <button type="button" className="secondary-btn campaign-recommended-formation" onClick={() => setShowDeployment(true)}>
            Personalizar despliegue
          </button>
        )}

        <details className="campaign-optional-panel campaign-preparation-options">
          <summary>Más opciones</summary>
          <div className="campaign-preparation-secondary-actions">
            {deploymentConfirmed && (
              <button type="button" className="secondary-btn" onClick={() => setShowDeployment(true)}>Revisar despliegue</button>
            )}
            <button type="button" className="secondary-btn" onClick={() => setShowArmy(true)}>Ver ejército y veteranos</button>
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
            <span>Efectivos: <b>{rosterCount}</b> · Reserva: <b>{deploy.reserveCount}</b> · Veteranos: <b>{veteranCount}</b> · Créditos: <b>{roster.credits || 0}</b></span>
            <button type="button" className="secondary-btn combat-reset-link" onClick={handleResetRoster}>Reiniciar progreso persistente</button>
          </div>
          <CampaignArmyGlance roster={roster} />
          <CombatServicePanel summary={serviceSummary} compact />
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
