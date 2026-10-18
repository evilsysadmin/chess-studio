// User-visible debrief outcomes, independent from the persisted domain values.
export function combatDebriefOutcomeLabel(outcome) {
  switch (outcome) {
    case 'win': return 'VICTORIA';
    case 'loss': return 'DERROTA';
    case 'retired': return 'RETIRADA';
    case 'draw': return 'TABLAS';
    default: return 'RESULTADO';
  }
}
