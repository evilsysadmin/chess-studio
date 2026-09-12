function percentDelta(value = 1, invert = false) {
  const safe = Math.max(0.01, Number(value) || 1);
  const delta = invert ? (1 / safe) - 1 : safe - 1;
  return Math.round(delta * 100);
}

export function pawnSlugModelArmoryHighlights(model = {}) {
  const rows = [
    ['Daño', percentDelta(model.damage)],
    ['Cadencia', percentDelta(model.cadence, true)],
    ['Precisión', percentDelta(model.spread, true)],
  ].filter(([, value]) => Math.abs(value) >= 3)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2);
  return rows.length ? rows : [['Equilibrio', 0]];
}
