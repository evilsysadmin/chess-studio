import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';
import { perkById, rewardOptionsForFloor } from './roguelikePerks.js';
import { seededUnit } from './roguelikeModifiers.js';

// Combat Chess · campaña procedural v1.
//
// La campaña vive separada del antiguo intento lineal de La Torre para poder
// migrar sin romper partidas guardadas. El mapa NO se persiste entero: seed +
// estado bastan para reconstruirlo de forma determinista.

const KEY = 'chess-study-combat-campaign-v1';
const BEST_STAGE_KEY = 'chess-study-combat-campaign-best-stage';
const TOWER_COMPLETED_KEY = 'chess-study-roguelike-tower-completed';
const BEST_FLOOR_KEY = 'chess-study-roguelike-best-floor';

export const CAMPAIGN_VERSION = 1;
export const CAMPAIGN_BOSS_STAGE = 7;

const STAGE_FLOORS = Object.freeze({ 1: 1, 2: 2, 3: 4, 4: 6, 5: 7, 6: 9, 7: 10 });

const NODE_BLUEPRINTS = Object.freeze([
  [{ lane: 0, type: 'battle' }, { lane: 2, type: 'battle' }],
  [{ lane: 0, type: 'event' }, { lane: 1, type: 'battle' }, { lane: 2, type: 'camp' }],
  [{ lane: 0, type: 'elite' }, { lane: 1, type: 'battle' }, { lane: 2, type: 'elite' }],
  [{ lane: 0, type: 'event' }, { lane: 1, type: 'camp' }, { lane: 2, type: 'battle' }],
  [{ lane: 0, type: 'battle' }, { lane: 1, type: 'elite' }, { lane: 2, type: 'event' }],
  [{ lane: 0, type: 'camp' }, { lane: 1, type: 'battle' }, { lane: 2, type: 'elite' }],
  [{ lane: 1, type: 'boss' }],
]);

const BATTLE_NAMES = Object.freeze([
  'Patrulla de frontera',
  'Cruce bajo fuego',
  'Escaramuza del barranco',
  'Línea de interdicción',
  'Puesto avanzado',
  'Última carretera',
]);
const ELITE_NAMES = Object.freeze([
  'Guardia de Hierro',
  'Escuadrón de ruptura',
  'Veteranos del Muro',
  'Compañía Negra',
]);
const EVENT_NAMES = Object.freeze([
  'Convoy abandonado',
  'Radio enemiga',
  'Depósito sin custodiar',
  'Exploradores en la niebla',
]);
const CAMP_NAMES = Object.freeze([
  'Campamento de campaña',
  'Puesto de retaguardia',
  'Vivac de medianoche',
]);

const TYPE_META = Object.freeze({
  battle: { icon: '⚔', label: 'Combate', description: 'Encuentro de campaña. Victoria = una ventaja temporal.' },
  elite: { icon: '☠', label: 'Élite', description: 'Más amenaza. La ventaja elegida entra con doble carga.' },
  event: { icon: '?', label: 'Evento', description: 'Decisión de riesgo/recompensa sin batalla inmediata.' },
  camp: { icon: '⛺', label: 'Campamento', description: 'Nodo seguro: reorganiza y gana una ventaja temporal.' },
  boss: { icon: '♚', label: 'Boss', description: 'El Rey Viejo. Cinco HP. Aquí termina la operación.' },
});

function makeSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `${values[0].toString(36)}${values[1].toString(36)}`;
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

function pick(seed, token, list) {
  const roll = seededUnit(`${seed}:${token}`, 1);
  return list[Math.min(list.length - 1, Math.floor(roll * list.length))];
}

function modifierForNode(seed, stage, lane, type) {
  if (type === 'boss') return 'none';
  if (type === 'elite') {
    if (stage >= 6) return pick(seed, `elite-${stage}-${lane}`, ['extra_queen', 'double_pawns']);
    return pick(seed, `elite-${stage}-${lane}`, ['extra_rook', 'double_pawns', 'extra_queen']);
  }
  if (stage <= 2) return pick(seed, `battle-${stage}-${lane}`, ['extra_knight', 'extra_bishop']);
  if (stage <= 4) return pick(seed, `battle-${stage}-${lane}`, ['extra_bishop', 'extra_rook', 'double_pawns']);
  return pick(seed, `battle-${stage}-${lane}`, ['extra_rook', 'double_pawns', 'extra_queen']);
}

function nodeName(seed, stage, lane, type) {
  if (type === 'boss') return 'El Rey Viejo';
  if (type === 'battle') return pick(seed, `name-battle-${stage}-${lane}`, BATTLE_NAMES);
  if (type === 'elite') return pick(seed, `name-elite-${stage}-${lane}`, ELITE_NAMES);
  if (type === 'event') return pick(seed, `name-event-${stage}-${lane}`, EVENT_NAMES);
  return pick(seed, `name-camp-${stage}-${lane}`, CAMP_NAMES);
}

function baseDifficultyFor(stage, type) {
  const stageBase = [0, 27, 31, 36, 42, 48, 55, 60][Math.max(0, Math.min(7, stage))] || 27;
  if (type === 'elite') return Math.min(95, stageBase + 9);
  if (type === 'boss') return 62;
  return stageBase;
}

function connectionsFor(stage, lane, nextNodes) {
  if (stage === 0) return nextNodes.map((node) => node.id);
  if (nextNodes.length === 1) return [nextNodes[0].id];
  const close = nextNodes.filter((node) => Math.abs(node.lane - lane) <= 1);
  return (close.length ? close : nextNodes).map((node) => node.id);
}

export function campaignMap(seed) {
  const safeSeed = String(seed || 'campaign');
  const stages = NODE_BLUEPRINTS.map((blueprints, index) => {
    const stage = index + 1;
    return blueprints.map(({ lane, type }) => {
      const meta = TYPE_META[type];
      const id = `s${stage}-l${lane}-${type}`;
      return {
        id,
        stage,
        floor: STAGE_FLOORS[stage] || stage,
        lane,
        type,
        icon: meta.icon,
        typeLabel: meta.label,
        label: nodeName(safeSeed, stage, lane, type),
        description: meta.description,
        modifierId: modifierForNode(safeSeed, stage, lane, type),
        baseDifficulty: baseDifficultyFor(stage, type),
        tier: type === 'boss' ? 'boss' : type === 'elite' ? 'elite' : type === 'battle' ? 'normal' : type,
        connections: [],
      };
    });
  });

  const start = {
    id: 'start', stage: 0, floor: 0, lane: 1, type: 'start', icon: '◆', typeLabel: 'Base',
    label: 'Puesto de mando', description: 'Inicio de la operación.', modifierId: 'none', baseDifficulty: 0, tier: 'safe', connections: [],
  };
  start.connections = connectionsFor(0, 1, stages[0]);
  for (let index = 0; index < stages.length - 1; index += 1) {
    const currentStage = stages[index];
    const nextStage = stages[index + 1];
    for (const node of currentStage) node.connections = connectionsFor(node.stage, node.lane, nextStage);
  }
  return { seed: safeSeed, start, stages, nodes: [start, ...stages.flat()] };
}

function emptyCampaign() {
  return {
    version: CAMPAIGN_VERSION,
    active: false,
    seed: null,
    phase: 'idle',
    currentNodeId: 'start',
    selectedNodeId: null,
    clearedNodeIds: [],
    route: ['start'],
    perks: [],
    rewardChosenForNode: null,
    nextDifficultyDelta: 0,
    eventLog: [],
  };
}

function normalizeCampaign(raw) {
  const base = emptyCampaign();
  if (!raw || typeof raw !== 'object' || raw.version !== CAMPAIGN_VERSION) return base;
  const seed = raw.active ? String(raw.seed || 'legacy-campaign') : null;
  const map = seed ? campaignMap(seed) : null;
  const validIds = new Set(map?.nodes.map((node) => node.id) || ['start']);
  const phases = new Set(['map', 'battle', 'fighting', 'reward', 'event', 'camp', 'completed']);
  const currentNodeId = validIds.has(raw.currentNodeId) ? raw.currentNodeId : 'start';
  const selectedNodeId = validIds.has(raw.selectedNodeId) ? raw.selectedNodeId : null;
  return {
    version: CAMPAIGN_VERSION,
    active: raw.active === true,
    seed,
    phase: raw.active === true && phases.has(raw.phase) ? raw.phase : 'idle',
    currentNodeId,
    selectedNodeId,
    clearedNodeIds: Array.isArray(raw.clearedNodeIds) ? [...new Set(raw.clearedNodeIds.filter((id) => validIds.has(id)))] : [],
    route: Array.isArray(raw.route) ? raw.route.filter((id) => validIds.has(id)) : ['start'],
    perks: Array.isArray(raw.perks) ? raw.perks.filter((id) => perkById(id)) : [],
    rewardChosenForNode: typeof raw.rewardChosenForNode === 'string' ? raw.rewardChosenForNode : null,
    nextDifficultyDelta: Math.max(-12, Math.min(12, Number(raw.nextDifficultyDelta) || 0)),
    eventLog: Array.isArray(raw.eventLog) ? raw.eventLog.slice(-20) : [],
  };
}

function saveCampaign(state) {
  const normalized = normalizeCampaign(state);
  setProfileStorageItem(KEY, JSON.stringify(normalized));
  return normalized;
}

export function loadCampaign() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeCampaign(JSON.parse(raw)) : emptyCampaign();
  } catch {
    return emptyCampaign();
  }
}

export function startCampaign(seed = makeSeed()) {
  return saveCampaign({ ...emptyCampaign(), active: true, seed: String(seed), phase: 'map' });
}

export function campaignNode(state, nodeId = state?.selectedNodeId) {
  if (!state?.active || !state.seed || !nodeId) return null;
  return campaignMap(state.seed).nodes.find((node) => node.id === nodeId) || null;
}

export function availableCampaignNodes(state) {
  if (!state?.active || state.phase !== 'map') return [];
  const map = campaignMap(state.seed);
  const current = map.nodes.find((node) => node.id === state.currentNodeId) || map.start;
  const cleared = new Set(state.clearedNodeIds || []);
  return current.connections
    .map((id) => map.nodes.find((node) => node.id === id))
    .filter((node) => node && !cleared.has(node.id));
}

export function selectCampaignNode(state, nodeId) {
  const available = availableCampaignNodes(state);
  const node = available.find((candidate) => candidate.id === nodeId);
  if (!node) return state;
  const phase = node.type === 'event' ? 'event' : node.type === 'camp' ? 'camp' : 'battle';
  return saveCampaign({ ...state, phase, selectedNodeId: node.id, rewardChosenForNode: null });
}

export function markCampaignBattleStarted(state) {
  const node = campaignNode(state);
  if (!state?.active || state.phase !== 'battle' || !node || !['battle', 'elite', 'boss'].includes(node.type)) return state;
  return saveCampaign({ ...state, phase: 'fighting' });
}

function markNodeCleared(state, extras = {}) {
  const node = campaignNode(state);
  if (!node) return state;
  const clearedNodeIds = [...new Set([...(state.clearedNodeIds || []), node.id])];
  const route = state.route?.at(-1) === node.id ? state.route : [...(state.route || ['start']), node.id];
  return saveCampaign({
    ...state,
    ...extras,
    currentNodeId: node.id,
    selectedNodeId: null,
    clearedNodeIds,
    route,
    rewardChosenForNode: null,
  });
}

export function markCampaignBattleWon(state) {
  const node = campaignNode(state);
  if (!state?.active || state.phase !== 'fighting' || !node) return state;
  if (node.type === 'boss') {
    localStorage.setItem(TOWER_COMPLETED_KEY, '1');
    const bestFloor = Math.max(10, Number.parseInt(localStorage.getItem(BEST_FLOOR_KEY) || '0', 10) || 0);
    setProfileStorageItem(BEST_FLOOR_KEY, String(bestFloor));
    setProfileStorageItem(BEST_STAGE_KEY, String(CAMPAIGN_BOSS_STAGE));
    return markNodeCleared(state, { phase: 'completed', nextDifficultyDelta: 0 });
  }
  const best = Math.max(loadCampaignBestStage(), node.stage);
  setProfileStorageItem(BEST_STAGE_KEY, String(best));
  return saveCampaign({ ...state, phase: 'reward', nextDifficultyDelta: 0 });
}

export function campaignRewardOptions(state) {
  const node = campaignNode(state);
  if (!node || !['reward', 'camp'].includes(state.phase)) return [];
  return rewardOptionsForFloor(state.seed, node.floor + node.lane * 13);
}

export function chooseCampaignReward(state, perkId) {
  const node = campaignNode(state);
  if (!node || !perkById(perkId) || !['reward', 'camp'].includes(state.phase)) return state;
  if (state.rewardChosenForNode === node.id) return state;
  const stacks = state.phase === 'reward' && node.type === 'elite' ? 2 : 1;
  const perks = [...(state.perks || []), ...Array.from({ length: stacks }, () => perkId)];
  const label = node.type === 'elite' ? `Botín élite: ${perkById(perkId).label} ×2` : `${node.type === 'camp' ? 'Campamento' : 'Botín'}: ${perkById(perkId).label}`;
  return markNodeCleared({ ...state, perks, rewardChosenForNode: node.id }, {
    phase: 'map',
    eventLog: [...(state.eventLog || []), label].slice(-20),
  });
}

export function campaignEventOptions(state) {
  const node = campaignNode(state);
  if (!node || state.phase !== 'event') return [];
  const supplyPerk = rewardOptionsForFloor(state.seed, node.floor + 37)[0];
  return [
    {
      id: 'recon',
      label: 'Reconocimiento silencioso',
      description: 'El próximo combate empieza con −6 de dificultad base. Sin botín.',
    },
    {
      id: 'salvage',
      label: `Saquear suministros · ${supplyPerk.label}`,
      description: 'Ganas esa ventaja ahora, pero haces ruido: +4 de dificultad base en el próximo combate.',
      perkId: supplyPerk.id,
    },
  ];
}

export function resolveCampaignEvent(state, choiceId) {
  const node = campaignNode(state);
  if (!node || state.phase !== 'event') return state;
  const option = campaignEventOptions(state).find((item) => item.id === choiceId);
  if (!option) return state;
  const perks = option.perkId ? [...(state.perks || []), option.perkId] : [...(state.perks || [])];
  const delta = choiceId === 'recon' ? -6 : 4;
  return markNodeCleared({ ...state, perks }, {
    phase: 'map',
    nextDifficultyDelta: Math.max(-12, Math.min(12, (state.nextDifficultyDelta || 0) + delta)),
    eventLog: [...(state.eventLog || []), choiceId === 'recon' ? 'Reconocimiento: −6 al próximo combate' : `Suministros: ${perkById(option.perkId)?.label || 'botín'} · +4 al próximo combate`].slice(-20),
  });
}

export function campaignDifficulty(state, node = campaignNode(state)) {
  if (!node || !['battle', 'elite', 'boss'].includes(node.type)) return 0;
  return Math.max(5, Math.min(95, node.baseDifficulty + (Number(state?.nextDifficultyDelta) || 0)));
}

export function endCampaign(state, reason = 'retired') {
  const node = campaignNode(state, state?.selectedNodeId || state?.currentNodeId);
  const stage = Math.max(0, Number(node?.stage) || 0);
  if (stage > loadCampaignBestStage()) setProfileStorageItem(BEST_STAGE_KEY, String(stage));
  const result = { reason, stage, route: [...(state?.route || ['start'])] };
  saveCampaign(emptyCampaign());
  return result;
}

export function loadCampaignBestStage() {
  const n = Number.parseInt(localStorage.getItem(BEST_STAGE_KEY) || '0', 10) || 0;
  return Math.max(0, Math.min(CAMPAIGN_BOSS_STAGE, n));
}

export function resetCombatCampaign() {
  removeProfileStorageItem(KEY);
  removeProfileStorageItem(BEST_STAGE_KEY);
}
