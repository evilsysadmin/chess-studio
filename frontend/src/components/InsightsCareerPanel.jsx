import '../styles/04-career-dossier.css';
import CareerActivityCalendar from './CareerActivityCalendar.jsx';
import InsightsDashboardContent from './InsightsDashboardContent.jsx';

export default function InsightsCareerPanel({
  screenProps,
  playerModel,
  personalPuzzles,
  cleanGameRecords,
}) {
  return (
    <>
      <CareerActivityCalendar history={screenProps.gameHistory || []} />
      <InsightsDashboardContent
        {...screenProps}
        initialSection="career"
        playerModel={playerModel}
        personalPuzzles={personalPuzzles}
        cleanGameRecords={cleanGameRecords}
      />
    </>
  );
}
