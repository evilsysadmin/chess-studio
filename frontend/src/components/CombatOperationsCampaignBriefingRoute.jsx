import CombatCampaignBriefingRoom from './CombatCampaignBriefingRoom.jsx';
import CombatMarket from './CombatMarket.jsx';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';

// Campaign data and transitions remain owned by RoguelikeScreen/the domain.
export default function CombatOperationsCampaignBriefingRoute({
  campaign, node, roster, armySummary, serviceSummary,
  showTutorial, showMarket, onExit, onRestart, onBuyIntel, onContinue, onRetire,
  setShowTutorial, setShowMarket, onHire, onBuyEquipment,
}) {
  return (
    <CombatCampaignBriefingRoom
      campaign={campaign}
      node={node}
      roster={roster}
      armySummary={armySummary}
      onExit={onExit}
      onHelp={() => setShowTutorial(true)}
      onOpenMarket={() => setShowMarket(true)}
      onRestart={onRestart}
      onBuyIntel={onBuyIntel}
      onContinue={onContinue}
      onRetire={onRetire}
    >
      {showTutorial && <MechanicTutorialModal tutorialId="combat-campaign" onClose={() => setShowTutorial(false)} />}
      {showMarket && (
        <CombatMarket roster={roster} serviceSummary={serviceSummary}
          onHire={onHire} onBuyEquipment={onBuyEquipment}
          onClose={() => setShowMarket(false)} />
      )}
    </CombatCampaignBriefingRoom>
  );
}
