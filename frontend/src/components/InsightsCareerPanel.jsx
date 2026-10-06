import '../styles/04-career-dossier.css';
import CareerActivityCalendar from './CareerActivityCalendar.jsx';
import CareerScreen from './CareerScreen.jsx';

export default function InsightsCareerPanel({ screenProps }) {
  return (
    <>
      <CareerActivityCalendar history={screenProps.gameHistory || []} />
      <div className="menu tournament-panel insights-hub">
        <CareerScreen
          embedded
          history={screenProps.gameHistory}
          ratingHistory={screenProps.ratingHistory}
          onExit={screenProps.onExit}
          onOpenRecord={screenProps.onOpenRecord}
          onMovie={screenProps.onMovie}
          onPlayFromHere={screenProps.onPlayFromHere}
          onOpenPuzzles={screenProps.onOpenPuzzles}
          onStartRun={screenProps.onStartRun}
          onContinueRun={screenProps.onContinueRun}
        />
      </div>
    </>
  );
}
