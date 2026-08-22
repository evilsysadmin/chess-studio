import React, { useState } from 'react';
import ArmyScreen from './ArmyScreen.jsx';
import ColorSelector from './ColorSelector.jsx';
import { BASE_STATS } from '../combat.js';
import CombatServicePanel from './CombatServicePanel.jsx';
import CombatDeploymentView from './CombatDeploymentView.jsx';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { deploymentSummary } from '../combatDeployment.js';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';

import { COMBAT_CHESS_NAME, COMBAT_CHESS_FREE_DESCRIPTION, COMBAT_CHESS_CAMPAIGN_DESCRIPTION } from '../combatChessBrand.js';
export default function CombatSetupView({
  onExit, difficulty, difficultyBalance, ratingInfo, difficultyOverride, difficultyLabel, forcedHumanColor, encounterLabel, encounterDescription, encounterTier, encounterIntel, bossConfig, runPerks, combatVariant, colorChoice, setColorChoice, autoLevelUpEnabled,
  setAutoLevelUpEnabled, roster, rosterCount, deadCount, deadRosterEntries,
  showExpireWarning, setShowExpireWarning, handleStartBattleClick, startBattle,
  showArmy, setShowArmy, showDeployment, setShowDeployment, handleBuyRosterStat, handleReviveRosterPiece, handleRenameRosterPiece, handleMetamorphoseRosterPiece, handleDeployRosterUnit, handleRemoveDeployedUnit, handleResetDeployment, handleAutofillDeployment, handleApplyDeploymentPreset, handleUnlockRosterTechnique, handleEquipRosterTechnique,
  handleResetRoster, onHistory, serviceSummary,
}) {
  const deploy = deploymentSummary(roster);
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-basics']?.seen);

    return (
      <div className="menu combat-setup">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section combat-setup-hero">
          <span className="eyebrow">{COMBAT_CHESS_NAME}</span>
          <div className="combat-heading-row">
            <h2 style={{ marginTop: '0.35rem' }}>{combatVariant === 'roguelike' ? 'Campaña roguelike' : 'Batalla libre'}</h2>
            <button
              type="button"
              className="context-help-btn"
              title="Cómo funciona Combat Chess"
              aria-label="Abrir tutorial de Combat Chess"
              onClick={() => setShowTutorial(true)}
            >?</button>
          </div>
          <p
            className="combat-setup-one-liner"
            title={combatVariant === 'roguelike' ? COMBAT_CHESS_CAMPAIGN_DESCRIPTION : COMBAT_CHESS_FREE_DESCRIPTION}
          >
            {combatVariant === 'roguelike' ? 'Elige ruta, prepara el ejército y combate.' : 'Prepara el ejército y entra en combate.'}
          </p>

          {encounterLabel && (
            <div className="combat-encounter-card compact" title={encounterDescription || undefined}>
              <div className="combat-encounter-main">
                <span>ENCUENTRO</span>
                <strong>{encounterLabel}</strong>
                {encounterTier && <em className="combat-encounter-tier">{encounterTier}</em>}
              </div>
              <div className="combat-encounter-tags">
                {encounterIntel && (
                  <span title="Inteligencia disponible para este encuentro">
                    {encounterIntel.level === 0
                      ? 'Intel · clasificada'
                      : encounterIntel.level === 1
                        ? `Intel · ${encounterIntel.threatRange}`
                        : `Intel · CPU ${encounterIntel.exactDifficulty}`}
                  </span>
                )}
                {bossConfig && <span title="Cada jaque causa 1 daño; mate causa 2.">Rey jefe · {bossConfig.maxHp} HP</span>}
              </div>
            </div>
          )}
        </div>

        <CombatServicePanel summary={serviceSummary} compact />

        {combatVariant === 'roguelike' && Array.isArray(runPerks) && runPerks.length > 0 && (
          <div className="menu-section combat-perks-compact" title="Ventajas temporales: desaparecen al terminar el intento.">
            <h2>Ventajas activas</h2>
            <div className="roguelike-active-perks">
              {runPerks.map((perk, index) => (
                <span key={`${perk.id}-${index}`} className="roguelike-perk-chip" title={perk.description}>{perk.label}</span>
              ))}
            </div>
          </div>
        )}

        <div className="combat-setup-grid">
          <section className="combat-setup-card" aria-label="Dificultad de la CPU">
            <div className="combat-setup-card-heading">
              <span>CPU</span>
              <b>{encounterIntel && encounterIntel.level < 2 ? '?' : difficulty}</b>
            </div>
            <div className="difficulty-slider-row compact">
              <div className="difficulty-slider" style={{ background: 'transparent', pointerEvents: 'none', flex: 1 }}>
                <div className="combat-difficulty-track">
                  {!(encounterIntel && encounterIntel.level < 2) && <i style={{ left: `${difficulty}%` }} />}
                </div>
              </div>
              <span
                className="combat-setup-state"
                title={difficultyOverride != null
                  ? (encounterIntel && encounterIntel.level < 2
                    ? 'La dificultad exacta se revela con inteligencia de nivel Evaluación.'
                    : 'El encuentro fija la base y la potencia permanente del ejército puede añadir amenaza.')
                  : 'Dificultad automática según el nivel que la CPU considera adecuado.'}
              >
                {encounterIntel && encounterIntel.level < 2
                  ? (encounterIntel.level === 1 ? `Est. ${encounterIntel.threatRange}` : 'Clasificada')
                  : (difficultyLabel || ratingInfo.tier.label)}
              </span>
            </div>
            {difficultyBalance?.threat?.bonus > 0 && !(encounterIntel && encounterIntel.level < 2) && (
              <span
                className="combat-threat-chip"
                title={`Base ${difficultyBalance.base} → CPU ${difficultyBalance.adjusted}. Veteranos ${difficultyBalance.threat.activeVeterans}; metamorfosis ${difficultyBalance.threat.activeMetamorphoses}; técnicas ${difficultyBalance.threat.equippedTechniques}. La dificultad nunca supera 100.`}
              >
                Amenaza {difficultyBalance.threat.tier} · +{difficultyBalance.appliedBonus}
              </span>
            )}
          </section>

          <section className="combat-setup-card" aria-label="Color">
            <div className="combat-setup-card-heading">
              <span>Color</span>
              {forcedHumanColor && <b>{forcedHumanColor === 'w' ? 'Blancas' : 'Negras'}</b>}
            </div>
            {forcedHumanColor ? (
              <span className="combat-setup-state" title="El color está fijado por esta modalidad.">Fijo</span>
            ) : (
              <ColorSelector value={colorChoice} onChange={setColorChoice} />
            )}
          </section>

          <section className="combat-setup-card" aria-label="Subida de nivel">
            <div className="combat-setup-card-heading">
              <span>Subida de nivel</span>
              <b>{autoLevelUpEnabled ? 'Auto' : 'Manual'}</b>
            </div>
            <label
              className="auto-level-toggle compact"
              title={autoLevelUpEnabled
                ? 'Al terminar, cada pieza gasta su XP automáticamente en fuerza y velocidad.'
                : 'El XP queda bancado para gastarlo manualmente desde el ejército antes de otra batalla.'}
            >
              <input
                type="checkbox"
                checked={autoLevelUpEnabled}
                onChange={(e) => setAutoLevelUpEnabled(e.target.checked)}
              />
              <span>Auto-subida</span>
            </label>
          </section>
        </div>

        <section className="menu-section combat-army-ops" aria-label="Estado del ejército">
          <div className="combat-heading-row">
            <h2>Ejército</h2>
            <span className={`combat-deploy-status ${deploy.ready ? 'ready' : 'incomplete'}`}>
              {deploy.assignedCount}/16 desplegadas
            </span>
          </div>

          <div className="combat-army-stats">
            <span title="Unidades con progreso persistente"><b>{rosterCount}</b><small>con progreso</small></span>
            <span title="Unidades disponibles en reserva"><b>{deploy.reserveCount}</b><small>reservas</small></span>
            <span className={deadCount ? 'danger-text' : ''} title="Unidades caídas pendientes de resolver"><b>{deadCount}</b><small>caídas</small></span>
            <span title="XP de combate disponible"><b>{roster.combatXp || 0}</b><small>XP combate</small></span>
            <span title="Identidades perdidas definitivamente"><b>{roster.memorial?.length || 0}</b><small>memorial</small></span>
          </div>

          {deadCount > 0 && (
            <div className="combat-operational-warning" title="Revive las bajas recuperables antes de iniciar otra batalla o sus identidades pasarán al Memorial.">
              ⚠ {deadCount} baja{deadCount === 1 ? '' : 's'} pendiente{deadCount === 1 ? '' : 's'}
            </div>
          )}

          <div className="combat-army-actions">
            <button
              type="button"
              className={`secondary-btn combat-deployment-entry ${deploy.ready ? 'ready' : 'incomplete'}`}
              onClick={() => setShowDeployment(true)}
              title="Coloca las 16 unidades y elige sus formas de despliegue."
            >
              <span>Preparar despliegue · {deploy.assignedCount}/16</span>
              <small>{deploy.reserveCount > 0 ? `${deploy.reserveCount} reserva${deploy.reserveCount === 1 ? '' : 's'}` : 'sin reservas'}</small>
            </button>
            <button type="button" className="secondary-btn" onClick={() => setShowArmy(true)} title="Alias, rango, XP, técnicas, metamorfosis y bajas.">
              Expedientes {roster.combatXp > 0 ? `· ${roster.combatXp} XP` : ''}
            </button>
            {onHistory && <button type="button" className="secondary-btn" onClick={onHistory}>Batallas anteriores</button>}
            {rosterCount > 0 && (
              <button type="button" className="secondary-btn combat-reset-link" onClick={handleResetRoster} title="Borra el progreso persistente de las piezas.">
                Reiniciar progreso
              </button>
            )}
          </div>
        </section>

        <button className="primary-btn" style={{ width: '100%' }} onClick={() => {
          if (deadCount === 0 && !deploy.ready) { setShowDeployment(true); return; }
          handleStartBattleClick();
        }}>
          {deploy.ready ? 'Empezar combate' : `Preparar despliegue · ${deploy.assignedCount}/16`}
        </button>

        {showExpireWarning && (
          <div className="modal-backdrop" onClick={() => setShowExpireWarning(false)}>
            <div className="attack-confirm-card" onClick={(e) => e.stopPropagation()}>
              <p className="attack-confirm-title">
                Tienes {deadRosterEntries.length} pieza{deadRosterEntries.length === 1 ? '' : 's'} caída
                {deadRosterEntries.length === 1 ? '' : 's'} sin revivir
                {' '}({deadRosterEntries.map(([key]) => `${roster.identities?.[key]?.alias || 'Sin alias'} · ${BASE_STATS[key.split('-')[0]].name}`).join(', ')}).
                Si empiezas ahora, esas identidades pasan al Memorial de Caídos; los huecos volverán con reclutas de nivel 1 y nombres nuevos.
              </p>
              <div className="attack-confirm-buttons">
                <button
                  className="secondary-btn"
                  onClick={() => { setShowExpireWarning(false); startBattle(); }}
                >
                  Empezar igual
                </button>
                <button
                  className="primary-btn"
                  onClick={() => { setShowExpireWarning(false); setShowArmy(true); }}
                >
                  Ir a revivir
                </button>
              </div>
            </div>
          </div>
        )}


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
            onClose={() => setShowDeployment(false)}
          />
        )}

        {showTutorial && <MechanicTutorialModal tutorialId="combat-basics" onClose={() => setShowTutorial(false)} />}

        {showArmy && (
          <ArmyScreen roster={roster} onBuy={handleBuyRosterStat} onRevive={handleReviveRosterPiece} onRename={handleRenameRosterPiece} onMetamorphose={handleMetamorphoseRosterPiece} onUnlockTechnique={handleUnlockRosterTechnique} onEquipTechnique={handleEquipRosterTechnique} onClose={() => setShowArmy(false)} />
        )}
      </div>
    );
}
