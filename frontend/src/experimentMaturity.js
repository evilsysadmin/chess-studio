export const EXPERIMENT_MATURITY = Object.freeze({
  POC: 'poc',
  EXPERIMENTAL: 'experimental',
  MATURE: 'mature',
  CANONICAL: 'canonical',
  FROZEN: 'frozen',
  RETIRED: 'retired',
});

const EXPERIMENT_MATURITY_LABELS = Object.freeze({
  [EXPERIMENT_MATURITY.POC]: 'POC',
  [EXPERIMENT_MATURITY.EXPERIMENTAL]: 'EXPERIMENTAL',
  [EXPERIMENT_MATURITY.MATURE]: 'MADURO',
  [EXPERIMENT_MATURITY.CANONICAL]: 'CANÓNICO',
  [EXPERIMENT_MATURITY.FROZEN]: 'CONGELADO',
  [EXPERIMENT_MATURITY.RETIRED]: 'RETIRADO',
});

export const EXPERIMENT_MATURITY_VALUES = Object.freeze(Object.values(EXPERIMENT_MATURITY));

export function experimentMaturityLabel(maturity, descriptor = '') {
  const label = EXPERIMENT_MATURITY_LABELS[maturity];
  if (!label) throw new Error(`Unknown experiment maturity: ${String(maturity)}`);

  const detail = String(descriptor || '').trim();
  return detail ? `${label} · ${detail.toUpperCase()}` : label;
}
