import InsightsRecurringErrors from './InsightsRecurringErrors.jsx';

export default function InsightsErrorsPanel({ onOpenPuzzles, playerModel }) {
  return <InsightsRecurringErrors onOpenPuzzles={onOpenPuzzles} playerModel={playerModel} />;
}
