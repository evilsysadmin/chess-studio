const DOCTRINES = Object.freeze([
  Object.freeze({
    id: 'shock',
    label: 'Asalto de choque',
    summary: 'Favorece capturas y jaques cuando el motor considera varias jugadas casi equivalentes.',
    counter: 'Reduce piezas colgando y evita responder automáticamente a cada provocación.',
    style: Object.freeze({ capture: 0.95, pawn: 0.05, queen: 0.2, check: 0.85, castle: -0.35 }),
  }),
  Object.freeze({
    id: 'queen-hunter',
    label: 'Caza de mando',
    summary: 'Prefiere actividad de dama y capturas entre alternativas tácticamente equivalentes.',
    counter: 'No expongas la dama pronto y castiga el exceso de actividad con desarrollo.',
    style: Object.freeze({ capture: 0.8, pawn: -0.1, queen: 1, check: 0.35, castle: -0.25 }),
  }),
  Object.freeze({
    id: 'pawn-storm',
    label: 'Marea de peones',
    summary: 'Inclina decisiones equivalentes hacia jugadas de peón y expansión, con menor apego al enroque.',
    counter: 'Vigila rupturas y casillas debilitadas; no abras líneas gratis contra tu rey.',
    style: Object.freeze({ capture: 0.25, pawn: 1, queen: -0.25, check: 0.2, castle: -0.65 }),
  }),
  Object.freeze({
    id: 'fortress',
    label: 'Contención',
    summary: 'Prefiere consolidar, enrocar y reducir aventuras de dama cuando las opciones son similares.',
    counter: 'Gana espacio sin precipitar intercambios que alivien su posición.',
    style: Object.freeze({ capture: -0.2, pawn: 0.25, queen: -0.45, check: -0.1, castle: 1 }),
  }),
  Object.freeze({
    id: 'pressure',
    label: 'Presión continua',
    summary: 'Favorece jaques y actividad inmediata entre líneas de valor prácticamente idéntico.',
    counter: 'Prioriza seguridad del rey y coordinación antes de perseguir material secundario.',
    style: Object.freeze({ capture: 0.35, pawn: 0.05, queen: 0.25, check: 1, castle: -0.15 }),
  }),
]);

// La doctrina colorea decisiones casi iguales; no compra blunders.
export function combatDoctrineBonusForMove(doctrine, move) {
  const style = doctrine?.style;
  if (!style || !move) return 0;
  const flags = String(move.flags || '');
  const traits = [
    [Boolean(move.captured), style.capture],
    [move.piece === 'p', style.pawn],
    [move.piece === 'q', style.queen],
    [/[+#]$/.test(String(move.san || '')), style.check],
    [flags.includes('k') || flags.includes('q'), style.castle],
  ];
  const total = traits.reduce((sum, [active, weight]) => {
    const n = Number(weight);
    return sum + (active && Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0);
  }, 0);
  return Math.max(-6, Math.min(6, Math.round(total * 3)));
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function enemyDoctrineForNode(seed, node) {
  if (!node || !['battle', 'elite', 'boss'].includes(node.type)) return null;
  return DOCTRINES[hash(`${String(seed || 'campaign')}:${node.id}:doctrine`) % DOCTRINES.length];
}

export function doctrineIntelView(doctrine, intelLevel = 0) {
  const level = Math.max(0, Math.min(3, Math.floor(Number(intelLevel) || 0)));
  if (!doctrine || level <= 0) return { label: null, summary: null, counter: null };
  return {
    label: doctrine.label,
    summary: level >= 2 ? doctrine.summary : null,
    counter: level >= 3 ? doctrine.counter : null,
  };
}

export function enemyDoctrineCatalog() {
  return DOCTRINES.map(({ id, label, summary, counter, style }) => ({ id, label, summary, counter, style: { ...style } }));
}
