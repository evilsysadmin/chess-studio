import CombatMarket from './CombatMarket.jsx';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import CombatOperationsMissionRoom from './CombatOperationsMissionRoom.jsx';
import { deploymentSummary } from '../combatDeployment.js';

export default function CombatOperationsCampaignMissionRoute({
  campaign,
  map,
  availableNodes,
  roster,
  serviceSummary,
  showTutorial,
  showMarket,
  onExit,
  onSelect,
  onRestart,
  onFinishCampaign,
  setShowTutorial,
  setShowMarket,
  onHire,
  onBuyEquipment,
}) {
  return (
    <CombatOperationsMissionRoom
      campaign={campaign}
      map={map}
      availableNodes={availableNodes}
      roster={roster}
      armySummary={deploymentSummary(roster)}
      onSelect={onSelect}
      onExit={onExit}
      onOpenMarket={() => setShowMarket(true)}
      onRestart={onRestart}
      onRetire={() => onFinishCampaign('retired')}
      onHelp={() => setShowTutorial(true)}
    >
      {showTutorial && (
        <MechanicTutorialModal
          tutorialId="combat-campaign"
          onClose={() => setShowTutorial(false)}
        />
      )}
      {showMarket && (
        <CombatMarket
          roster={roster}
          serviceSummary={serviceSummary}
          onHire={onHire}
          onBuyEquipment={onBuyEquipment}
          onClose={() => setShowMarket(false)}
        />
      )}
    </CombatOperationsMissionRoom>
  );
}
