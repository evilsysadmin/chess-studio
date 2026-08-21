import React from 'react';
import { useCombatController } from './useCombatController.js';
import CombatSetupView from './CombatSetupView.jsx';
import CombatBattleView from './CombatBattleView.jsx';

export default function CombatScreen(props) {
  const controller = useCombatController(props);

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
        showExpireWarning={controller.showExpireWarning}
        setShowExpireWarning={controller.setShowExpireWarning}
        handleStartBattleClick={controller.handleStartBattleClick}
        startBattle={controller.startBattle}
        showArmy={controller.showArmy}
        setShowArmy={controller.setShowArmy}
        handleBuyRosterStat={controller.handleBuyRosterStat}
        handleReviveRosterPiece={controller.handleReviveRosterPiece}
        handleMetamorphoseRosterPiece={controller.handleMetamorphoseRosterPiece}
        handleUnlockRosterTechnique={controller.handleUnlockRosterTechnique}
        handleEquipRosterTechnique={controller.handleEquipRosterTechnique}
        handleRenameRosterUnit={controller.handleRenameRosterUnit}
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
