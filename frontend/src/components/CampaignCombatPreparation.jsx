import React, { useState } from 'react';
import ArmyScreen from './ArmyScreen.jsx';
import CombatDeploymentView from './CombatDeploymentView.jsx';
import CombatServicePanel from './CombatServicePanel.jsx';
import CampaignOperationSteps from './CampaignOperationSteps.jsx';
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
}) {
  const deploy = deploymentSummary(roster);
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-deployment']?.seen);
  const missing = Math.max(0, deploy.totalSlots - deploy.assignedCount);
  const veteranCount = Object.values(roster?.pieces || {}).filter((piece) => piece?.alive !== false && ((piece?.strengthPoints || 0) + (piece?.speedPoints || 0)) > 0).length;
  const intelLabel = encounterIntel?.level === 0
    ? 'Clasificada'
    : encounterIntel?.level === 1
      ? `CPU ${encounterIntel.threatRange}`
      : `CPU ${encounterIntel?.exactDifficulty ?? difficulty}`;
  const nextAction = deadCount > 0
    ? `Resuelve ${deadCount} baja${deadCount === 1 ? '' : 's'} y completa la formación.`
    : !deploy.ready
      ? `Completa ${missing} puesto${missing === 1 ? '' : 's'} y confirma el despliegue.`
      : !deploymentConfirmed
        ? 'La formación está completa. Revísala y confirma el despliegue.'
        : 'Despliegue confirmado. Puedes iniciar el combate.';

  return (
    <div className="menu combat-setup campaign-preparation-screen">
      <button className="back-link" onClick={onExit}>← Salir de Combat Chess</button>

      <section className="menu-section campaign-preparation-shell">
        <CampaignOperationSteps active="deployment" />

        <header className="campaign-operation-heading campaign-preparation-heading">
          <div>
            <span className="section-label">PREPARACIÓN DE FUERZA</span>
            <h2>{encounterLabel || 'Operación de campaña'}</h2>
            <p>{encounterDescription || 'Revisa el despliegue y confirma quién entra en combate.'}</p>
          </div>
          <button type="button" className="context-help-btn" onClick={() => setShowTutorial(true)} aria-label="Tutorial de despliegue">?</button>
        </header>

        <div className="campaign-command-strip" aria-label="Resumen operacional">
          <span><small>ENCUENTRO</small><b>{encounterTier || 'Campaña'}</b></span>
          <span><small>AMENAZA</small><b>{intelLabel}</b></span>
          <span><small>DESPLEGADOS</small><b>{deploy.assignedCount}/{deploy.totalSlots}</b></span>
          <span><small>BANQUILLO</small><b>{deploy.reserveCount}</b></span>
          <span className={deadCount ? 'danger' : ''}><small>BAJAS</small><b>{deadCount}</b></span>
          <span><small>XP COMBATE</small><b>{roster.combatXp || 0}</b></span>
        </div>

        <div className={`campaign-situation-banner ${deploymentConfirmed ? 'ready' : deadCount ? 'danger' : ''}`}>
          <span>SIGUIENTE PASO</span>
          <strong>{nextAction}</strong>
        </div>

        <section className={`campaign-force-readiness ${deploymentConfirmed ? 'confirmed' : deploy.ready ? 'ready' : 'incomplete'}`}>
          <div className="campaign-force-readiness-main">
            <span>{deploymentConfirmed ? 'DESPLIEGUE CONFIRMADO' : 'ESTADO DEL DESPLIEGUE'}</span>
            <strong>{deploymentConfirmed ? 'Lista para combate' : `${deploy.assignedCount}/${deploy.totalSlots} puestos cubiertos`}</strong>
            <small>
              {deadCount > 0
                ? `${deadCount} baja${deadCount === 1 ? '' : 's'} pendiente${deadCount === 1 ? '' : 's'} de resolver.`
                : deploy.ready
                  ? 'Formación legal completa.'
                  : `Faltan ${missing} puesto${missing === 1 ? '' : 's'} por cubrir.`}
            </small>
          </div>
          <div className="campaign-force-facts">
            <span><b>{rosterCount}</b><small>efectivos</small></span>
            <span><b>{deploy.reserveCount}</b><small>reserva</small></span>
            <span><b>{veteranCount}</b><small>veteranos</small></span>
          </div>
        </section>

        {Array.isArray(runPerks) && runPerks.length > 0 && (
          <div className="campaign-preparation-perks" aria-label="Ventajas activas">
            <span>VENTAJAS ACTIVAS</span>
            <div>{runPerks.map((perk, index) => <em key={`${perk.id}-${index}`} title={perk.description}>{perk.label}</em>)}</div>
          </div>
        )}

        <div className="campaign-operation-primary-zone campaign-preparation-primary-zone">
          <div>
            <span>{deploymentConfirmed ? 'FASE 3/4 COMPLETADA' : 'FASE 3/4 · OBLIGATORIA'}</span>
            <small>{deploymentConfirmed ? 'El despliegue queda congelado hasta que decidas revisarlo.' : 'No se puede iniciar combate sin confirmar esta fase.'}</small>
          </div>
          {deploymentConfirmed ? (
            <button type="button" className="primary-btn campaign-main-cta" onClick={handleStartBattleClick}>INICIAR COMBATE →</button>
          ) : (
            <button type="button" className="primary-btn campaign-main-cta" onClick={() => setShowDeployment(true)}>
              PREPARAR DESPLIEGUE · {deploy.assignedCount}/{deploy.totalSlots}
            </button>
          )}
        </div>

        <div className="campaign-preparation-secondary-actions">
          {deploymentConfirmed && (
            <button type="button" className="secondary-btn" onClick={() => setShowDeployment(true)}>Revisar despliegue</button>
          )}
          <button type="button" className="secondary-btn" onClick={() => setShowArmy(true)}>Expedientes del ejército</button>
          {onHistory && <button type="button" className="secondary-btn" onClick={onHistory}>Batallas anteriores</button>}
        </div>

        <details className="campaign-operation-details">
          <summary>Ajustes y datos secundarios</summary>
          <div className="campaign-operation-details-grid">
            <label className="auto-level-toggle compact">
              <input type="checkbox" checked={autoLevelUpEnabled} onChange={(event) => setAutoLevelUpEnabled(event.target.checked)} />
              <span>Auto-subida al terminar</span>
            </label>
            <span>Dificultad efectiva: <b>{encounterIntel && encounterIntel.level < 2 ? intelLabel : (difficultyLabel || difficulty)}</b></span>
            <button type="button" className="secondary-btn combat-reset-link" onClick={handleResetRoster}>Reiniciar progreso persistente</button>
          </div>
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
