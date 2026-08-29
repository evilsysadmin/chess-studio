import { CAMPAIGN_MISSION_BONUS_CAP } from './combatEconomyBalance.js';

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

const CLASSIFIED_DEFINITIONS = Object.freeze([
  {
    id: 'classified-surgical',
    label: 'Golpe quirúrgico',
    description: 'Confirma al menos 4 capturas sufriendo como máximo 1 baja.',
    reward: 6,
    test: (metrics) => metrics.captures >= 4 && metrics.casualties <= 1,
  },
  {
    id: 'classified-underdog',
    label: 'Caza mayor',
    description: 'Genera al menos 4 puntos por acciones contra material superior.',
    reward: 6,
    test: (metrics) => metrics.underdogCredits >= 4,
  },
  {
    id: 'classified-tactical',
    label: 'Superioridad demostrable',
    description: 'Genera al menos 5 puntos de mérito táctico durante la batalla.',
    reward: 5,
    test: (metrics) => metrics.tacticalCredits >= 5,
  },
  {
    id: 'classified-pressure',
    label: 'Barrido controlado',
    description: 'Confirma al menos 6 capturas sin superar 3 bajas propias.',
    reward: 5,
    test: (metrics) => metrics.captures >= 6 && metrics.casualties <= 3,
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

function publicOrder(definition, extra = {}) {
  const { test, ...order } = definition;
  return { ...order, ...extra };
}

export function campaignMissionOrders(seed, node) {
  if (!node || !['battle', 'elite', 'boss'].includes(node.type)) return [];
  const pool = [...ORDER_DEFINITIONS];
  const firstIndex = hash(`${seed}:${node.id}:orders:first`) % pool.length;
  const first = pool.splice(firstIndex, 1)[0];
  const secondIndex = hash(`${seed}:${node.id}:orders:second`) % pool.length;
  const second = pool[secondIndex];
  return [publicOrder(first), publicOrder(second)];
}

// La oportunidad clasificada existe de forma determinista desde que se genera
// el sector, pero sólo se revela con Intel de nivel 2 (Evaluación) o superior.
// Intel no cambia el objetivo ni hace reroll: únicamente permite conocerlo.
export function classifiedCampaignMission(seed, node, intelLevel = 0) {
  if (!node || !['battle', 'elite', 'boss'].includes(node.type) || Number(intelLevel || 0) < 2) return null;
  const definition = CLASSIFIED_DEFINITIONS[hash(`${seed}:${node.id}:classified`) % CLASSIFIED_DEFINITIONS.length];
  return publicOrder(definition, { classified: true });
}

export function evaluateCampaignMissionOrders(seed, node, rawMetrics = null, { intelLevel = 0 } = {}) {
  const requiredMetrics = ['casualties', 'captures', 'tacticalCredits', 'underdogCredits'];
  const verified = Boolean(rawMetrics && typeof rawMetrics === 'object' && requiredMetrics.every((key) => Number.isFinite(Number(rawMetrics[key]))));
  const metrics = normalizeMetrics(rawMetrics || {});
  const standard = campaignMissionOrders(seed, node);
  const classified = classifiedCampaignMission(seed, node, intelLevel);
  const active = classified ? [...standard, classified] : standard;
  const definitions = new Map([...ORDER_DEFINITIONS, ...CLASSIFIED_DEFINITIONS].map((order) => [order.id, order]));
  let remainingBonus = CAMPAIGN_MISSION_BONUS_CAP;
  const results = active.map((order) => {
    const definition = definitions.get(order.id);
    const completed = verified && Boolean(definition?.test(metrics));
    const earned = completed ? Math.min(order.reward, remainingBonus) : 0;
    remainingBonus = Math.max(0, remainingBonus - earned);
    return { ...order, completed, earned };
  });
  const rawEarned = results.reduce((sum, entry) => sum + (entry.completed ? entry.reward : 0), 0);
  const earned = results.reduce((sum, entry) => sum + entry.earned, 0);
  return {
    nodeId: node?.id || null,
    verified,
    metrics,
    results,
    completed: results.filter((entry) => entry.completed),
    missed: results.filter((entry) => !entry.completed),
    earned,
    capped: Math.max(0, rawEarned - earned),
    classifiedRevealed: Boolean(classified),
  };
}
