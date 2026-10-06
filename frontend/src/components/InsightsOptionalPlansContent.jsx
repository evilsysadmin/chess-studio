import InsightsMatthiasCampaign from './InsightsMatthiasCampaign.jsx';
import InsightsWeeklyGoals from './InsightsWeeklyGoals.jsx';

export default function InsightsOptionalPlansContent({
  gameHistory,
  onOpenPuzzles,
  onPlayFromHere,
  playerModel,
  personalPuzzles,
  cleanGameRecords,
}) {
  return (
    <>
      <InsightsMatthiasCampaign
        gameHistory={gameHistory}
        onOpenPuzzles={onOpenPuzzles}
        onPlayFromHere={onPlayFromHere}
      />
      <InsightsWeeklyGoals
        onOpenPuzzles={onOpenPuzzles}
        playerModel={playerModel}
        personalPuzzles={personalPuzzles}
        cleanGameRecords={cleanGameRecords}
      />
    </>
  );
}
