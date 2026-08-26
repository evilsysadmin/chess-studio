import { useEffect } from 'react';
import { useCombatController } from './useCombatController.js';
import CombatSetupView from './CombatSetupView.jsx';
import CombatBattleView from './CombatBattleView.jsx';

export default function CombatScreen(props) {
  const controller = useCombatController(props);

  // No actualizamos al padre desde useLayoutEffect: en dev/StrictMode puede
  // provocar renders reentrantes justo durante la transición Setup -> Battle.
  // Este callback sólo cambia el mueble visual global, así que un efecto pasivo
  // es suficiente y mantiene la máquina de estado del combate desacoplada.
  useEffect(() => {
    props.onBattleUiActive?.(controller.phase !== 'setup');
  }, [controller.phase, props.onBattleUiActive]);

  useEffect(() => () => props.onBattleUiActive?.(false), [props.onBattleUiActive]);

  if (controller.phase === 'setup') {
    return (
      <CombatSetupView
        onExit={props.onExit}
        difficulty={controller.difficulty}
        difficultyBalance={controller.difficultyBalance}
        ratingInfo={controller.ratingInfo}
        difficultyOverride={props.difficultyOverride}
        difficultyLabel={props.difficultyLabel}
        forcedHumanColor={props.forcedHumanColor}
        encounterLabel={props.encounterLabel}
        encounterDescription={props.encounterDescription}
        encounterTier={props.encounterTier}
        encounterIntel={props.encounterIntel}
        bossConfig={props.bossConfig}
        runPerks={props.runPerkDetails}
        combatVariant={props.combatVariant}
        colorChoice={controller.colorChoice}
        setColorChoice={controller.setColorChoice}
        autoLevelUpEnabled={controller.autoLevelUpEnabled}
        setAutoLevelUpEnabled={controller.setAutoLevelUpEnabled}
        roster={controller.roster}
        rosterCount={Object.values(controller.roster.pieces).filter((p) => p.alive !== false).length}
        deadCount={Object.values(controller.roster.pieces).filter((p) => p.alive === false).length}
        deadRosterEntries={controller.deadRosterEntries}
        handleStartBattleClick={controller.handleStartBattleClick}
        handleQuickStartBattle={controller.handleQuickStartBattle}
        showArmy={controller.showArmy}
        setShowArmy={controller.setShowArmy}
        showMarket={controller.showMarket}
        setShowMarket={controller.setShowMarket}
        showDeployment={controller.showDeployment}
        setShowDeployment={controller.setShowDeployment}
        requireDeploymentConfirmation={controller.requireDeploymentConfirmation}
        deploymentConfirmed={controller.deploymentConfirmed}
        handleConfirmDeployment={controller.handleConfirmDeployment}
        handleBuyRosterStat={controller.handleBuyRosterStat}
        handleReviveRosterPiece={controller.handleReviveRosterPiece}
        handleReplaceRosterPiece={controller.handleReplaceRosterPiece}
        handleRenameRosterPiece={controller.handleRenameRosterPiece}
        handleMetamorphoseRosterPiece={controller.handleMetamorphoseRosterPiece}
        handleDeployRosterUnit={controller.handleDeployRosterUnit}
        handleRemoveDeployedUnit={controller.handleRemoveDeployedUnit}
        handleResetDeployment={controller.handleResetDeployment}
        handleAutofillDeployment={controller.handleAutofillDeployment}
        handleApplyDeploymentPreset={controller.handleApplyDeploymentPreset}
        handleUnlockRosterTechnique={controller.handleUnlockRosterTechnique}
        handleEquipRosterTechnique={controller.handleEquipRosterTechnique}
        handleHireMercenary={controller.handleHireMercenary}
        handleBuyEquipment={controller.handleBuyEquipment}
        handleResetRoster={controller.handleResetRoster}
        onHistory={props.onHistory}
        serviceSummary={controller.serviceSummary}
      />
    );
  }

  return (
    <CombatBattleView
      {...controller}
      onExit={props.onExit}
      onViewBattle={props.onViewBattle}
      combatVariant={props.combatVariant}
    />
  );
}
