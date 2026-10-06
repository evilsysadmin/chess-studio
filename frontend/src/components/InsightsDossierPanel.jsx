import InsightsCleanGames from './InsightsCleanGames.jsx';
import InsightsDossierContent from './InsightsDossierContent.jsx';

export default function InsightsDossierPanel({
  screenProps,
  playerModel,
  personalPuzzles,
  cleanGameRecords,
}) {
  return (
    <>
      <InsightsCleanGames playerModel={playerModel} />
      <InsightsDossierContent
        insights={screenProps.insights}
        gameHistory={screenProps.gameHistory}
        combatHistory={screenProps.combatHistory}
        ratingHistory={screenProps.ratingHistory}
        onJumpToMove={screenProps.onJumpToMove}
        onOpenPuzzles={screenProps.onOpenPuzzles}
        isAdminUser={screenProps.isAdminUser}
        playerModel={playerModel}
        personalPuzzles={personalPuzzles}
        cleanGameRecords={cleanGameRecords}
      />
    </>
  );
}
