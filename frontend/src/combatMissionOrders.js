const ORDER_DEFINITIONS = Object.freeze([
  {
    id: 'preserve-core',
    label: 'Conservar el núcleo',
    description: 'Gana sufriendo como máximo 2 bajas propias.',
    reward: 3,
    test: (metrics) => metrics.casualties <= 2,
  },
  {
    id: 'take-ground',
    label: 'Tomar terreno',
    description: 'Confirma al menos 3 capturas enemigas.',
    reward: 2,
    test: (metrics) => metrics.captures >= 3,
  },
  {
    id: 'tactical-edge',
    label: 'Ventaja táctica',
    description: 'Genera al menos 2 puntos de mérito táctico.',
    reward: 3,
    test: (metrics) => metrics.tacticalCredits >= 2,
  },
  {
    id: 'punch-up',
    label: 'Golpear por encima del peso',
    description: 'Consigue al menos 2 puntos por acciones contra material superior.',
    reward: 4,
    test: (metrics) => metrics.underdogCredits >= 2,
  },
]);

function safeInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function normalizeMetrics(raw = {}) {
  return {
    casualties: safeInt(raw.casualties),
    captures: safeInt(raw.captures),
    tacticalCredits: safeInt(raw.tacticalCredits),
    underdogCredits: safeInt(raw.underdogCredits),
  };
}

export function campaignMissionOrders(seed, node) {
  if (!node || !['battle', 'elite', 'boss'].includes(node.type)) return [];
  const pool = [...ORDER_DEFINITIONS];
  const firstIndex = hash(`${seed}:${node.id}:orders:first`) % pool.length;
  const first = pool.splice(firstIndex, 1)[0];
  const secondIndex = hash(`${seed}:${node.id}:orders:second`) % pool.length;
  const second = pool[secondIndex];
  return [first, second].map(({ test, ...order }) => ({ ...order }));
}

export function evaluateCampaignMissionOrders(seed, node, rawMetrics = null) {
  const requiredMetrics = ['casualties', 'captures', 'tacticalCredits', 'underdogCredits'];
  const verified = Boolean(rawMetrics && typeof rawMetrics === 'object' && requiredMetrics.every((key) => Number.isFinite(Number(rawMetrics[key]))));
  const metrics = normalizeMetrics(rawMetrics || {});
  const active = campaignMissionOrders(seed, node);
  const definitions = new Map(ORDER_DEFINITIONS.map((order) => [order.id, order]));
  const results = active.map((order) => {
    const definition = definitions.get(order.id);
    const completed = verified && Boolean(definition?.test(metrics));
    return { ...order, completed, earned: completed ? order.reward : 0 };
  });
  return {
    nodeId: node?.id || null,
    verified,
    metrics,
    results,
    completed: results.filter((entry) => entry.completed),
    missed: results.filter((entry) => !entry.completed),
    earned: results.reduce((sum, entry) => sum + entry.earned, 0),
  };
}
