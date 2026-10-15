import InsightsRecurringErrors from './InsightsRecurringErrors.jsx';

export default function InsightsErrorsPanel({ onOpenPuzzles, playerModel, personalPuzzles }) {
  return <InsightsRecurringErrors onOpenPuzzles={onOpenPuzzles} playerModel={playerModel} personalPuzzles={personalPuzzles} />;
}
