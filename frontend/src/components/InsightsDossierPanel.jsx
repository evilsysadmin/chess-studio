import InsightsCleanGames from './InsightsCleanGames.jsx';
import InsightsDashboardContent from './InsightsDashboardContent.jsx';

export default function InsightsDossierPanel({
  screenProps,
  playerModel,
  personalPuzzles,
  cleanGameRecords,
}) {
  return (
    <>
      <InsightsCleanGames playerModel={playerModel} />
      <InsightsDashboardContent
        {...screenProps}
        initialSection="diagnosis"
        playerModel={playerModel}
        personalPuzzles={personalPuzzles}
        cleanGameRecords={cleanGameRecords}
      />
    </>
  );
}
