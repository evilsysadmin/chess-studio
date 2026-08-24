import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';
import { perkById, rewardOptionsForFloor } from './roguelikePerks.js';
import { ROGUELIKE_MODIFIERS, seededUnit } from './roguelikeModifiers.js';
import { ROGUELIKE_BOSS } from './roguelikeBoss.js';

// Combat Chess · campaña procedural v3 (mapa estratégico + intel + reliquias operativas).
//
// La campaña vive separada del antiguo intento lineal de La Torre para poder
// migrar sin romper partidas guardadas. El mapa NO se persiste entero: seed +
// estado bastan para reconstruirlo de forma determinista.

const KEY = 'chess-study-combat-campaign-v1';
const BEST_STAGE_KEY = 'chess-study-combat-campaign-best-stage';
const OPERATION_ARCHIVE_KEY = 'chess-study-combat-operation-archive-v1';
const TOWER_COMPLETED_KEY = 'chess-study-roguelike-tower-completed';
const BEST_FLOOR_KEY = 'chess-study-roguelike-best-floor';

const CAMPAIGN_VERSION = 3;
const CAMPAIGN_BOSS_STAGE = 7;

const CAMPAIGN_INTEL_TIERS = Object.freeze([
  { level: 0, label: 'Sin reconocimiento', cost: 0 },
  { level: 1, label: 'Contacto', cost: 3 },
  { level: 2, label: 'Evaluación', cost: 5 },
  { level: 3, label: 'Dossier', cost: 7 },
]);

const CAMPAIGN_STARTING_CREDITS = 6;
const BATTLE_CREDIT_REWARD = Object.freeze({ battle: 4, elite: 7, boss: 12 });

const CAMPAIGN_RELICS = Object.freeze([
  { id: 'fieldCipher', icon: '⌁', label: 'Cifrador de campaña', description: 'La inteligencia cuesta 2 créditos menos (mínimo 1).' },
  { id: 'forwardObserver', icon: '⌖', label: 'Óptica del observador', description: 'Al seleccionar un combate obtienes Contacto automáticamente.' },
  { id: 'quartermasterSeal', icon: '▣', label: 'Sello de intendencia', description: 'Cada victoria de campaña entrega +2 créditos operativos.' },
  { id: 'silentBoots', icon: '⌁', label: 'Equipo de infiltración', description: 'El ruido positivo generado por eventos se reduce en 2.' },
  { id: 'kingDossier', icon: '♚', label: 'Dossier del Rey Viejo', description: 'El boss final tiene −4 de dificultad estratégica.' },
  { id: 'campLedger', icon: '✚', label: 'Libro de retaguardia', description: 'Cada campamento completado recupera +3 créditos.' },
]);
const CAMPAIGN_RELIC_BY_ID = Object.fromEntries(CAMPAIGN_RELICS.map((relic) => [relic.id, relic]));

export function campaignRelicDetails(state) {
  return (state?.relicIds || []).map((id) => CAMPAIGN_RELIC_BY_ID[id]).filter(Boolean);
}

function hasRelic(state, relicId) { return (state?.relicIds || []).includes(relicId); }
function intelTierCost(state, baseCost) { return Math.max(1, baseCost - (hasRelic(state, 'fieldCipher') ? 2 : 0)); }
const MODIFIER_META = Object.fromEntries(ROGUELIKE_MODIFIERS.map((modifier) => [modifier.id, modifier]));

function clampIntelLevel(level) {
  return Math.max(0, Math.min(3, Math.floor(Number(level) || 0)));
}

function campaignIntelLevel(state, nodeId = state?.selectedNodeId) {
  return clampIntelLevel(state?.intelligenceByNode?.[nodeId]);
}

export function nextCampaignIntelTier(state, nodeId = state?.selectedNodeId) {
  const current = campaignIntelLevel(state, nodeId);
  const tier = CAMPAIGN_INTEL_TIERS.find((row) => row.level === current + 1) || null;
  return tier ? { ...tier, baseCost: tier.cost, cost: intelTierCost(state, tier.cost) } : null;
}

export function purchaseCampaignIntel(state, nodeId = state?.selectedNodeId) {
  // La inteligencia es una decisión PREVIA al despliegue. Aunque una llamada
  // programática conozca el id de otro nodo, no permitimos comprar dossier a
  // posteriori ni para rutas que el jugador todavía no ha seleccionado.
  if (!state?.active || state.phase !== 'briefing' || !nodeId || nodeId !== state.selectedNodeId) return state;
  const node = campaignNode(state, nodeId);
  if (!node || !['battle', 'elite', 'boss'].includes(node.type)) return state;
  const nextTier = nextCampaignIntelTier(state, nodeId);
  if (!nextTier || (Number(state.operationalCredits) || 0) < nextTier.cost) return state;
  return saveCampaign({
    ...state,
    operationalCredits: Math.max(0, (Number(state.operationalCredits) || 0) - nextTier.cost),
    intelligenceByNode: { ...(state.intelligenceByNode || {}), [nodeId]: nextTier.level },
    eventLog: [...(state.eventLog || []), `Intel ${nextTier.label}: ${node.label} · −${nextTier.cost} créditos`].slice(-20),
  });
}

function threatBand(baseDifficulty) {
  const n = Math.max(0, Math.min(100, Number(baseDifficulty) || 0));
  if (n >= 70) return 'Extrema';
  if (n >= 55) return 'Muy alta';
  if (n >= 40) return 'Alta';
  if (n >= 28) return 'Media';
  return 'Baja';
}

export function campaignIntelBriefing(state, node = campaignNode(state)) {
  if (!node || !['battle', 'elite', 'boss'].includes(node.type)) return null;
  const level = campaignIntelLevel(state, node.id);
  const modifier = MODIFIER_META[node.modifierId] || MODIFIER_META.none;
  const difficulty = campaignDifficulty(state, node);
  const result = {
    level,
    levelLabel: CAMPAIGN_INTEL_TIERS[level]?.label || 'Sin reconocimiento',
    threatBand: threatBand(difficulty),
    exactDifficulty: null,
    // Las reglas visibles del tablero nunca se ocultan detrás de intel.
    // La intel compra precisión estratégica, no evita sorpresas injustas.
    modifierLabel: modifier?.label || 'Material estándar',
    modifierDescription: modifier?.description || 'Sin modificador material adicional.',
    bossHp: null,
    note: 'La inteligencia nunca revela movimientos concretos del motor.',
  };
  if (level >= 1) result.threatRange = `${Math.max(5, difficulty - 5)}–${Math.min(100, difficulty + 5)}`;
  if (level >= 2) {
    result.exactDifficulty = difficulty;
  }
  if (level >= 3) {
    if (node.type === 'boss') result.bossHp = ROGUELIKE_BOSS.maxHp;
  }
  return result;
}

export function markCampaignBriefingAccepted(state) {
  const node = campaignNode(state);
  if (!state?.active || state.phase !== 'briefing' || !node || !['battle', 'elite', 'boss'].includes(node.type)) return state;
  return saveCampaign({ ...state, phase: 'battle' });
}


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
  // Onboarding: el primer sector es ajedrez materialmente estándar. Las
  // asimetrías aparecen después y siempre se anuncian antes de combatir.
  if (type === 'battle' && stage === 1) return 'none';
  if (type === 'elite') {
    if (stage >= 6) return pick(seed, `elite-${stage}-${lane}`, ['extra_queen', 'double_pawns']);
    return pick(seed, `elite-${stage}-${lane}`, ['extra_rook', 'double_pawns', 'extra_queen']);
  }
  if (stage <= 2) return pick(seed, `battle-${stage}-${lane}`, ['none', 'none', 'extra_knight', 'extra_bishop']);
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
    operationalCredits: CAMPAIGN_STARTING_CREDITS,
    intelligenceByNode: {},
    relicIds: [],
    eventLog: [],
  };
}

function normalizeCampaign(raw) {
  const base = emptyCampaign();
  if (!raw || typeof raw !== 'object' || ![1, 2, CAMPAIGN_VERSION].includes(raw.version)) return base;
  const seed = raw.active ? String(raw.seed || 'legacy-campaign') : null;
  const map = seed ? campaignMap(seed) : null;
  const validIds = new Set(map?.nodes.map((node) => node.id) || ['start']);
  const phases = new Set(['map', 'briefing', 'battle', 'fighting', 'reward', 'event', 'camp', 'completed']);
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
    operationalCredits: Math.max(0, Math.floor(Number(raw.operationalCredits ?? (raw.version === 1 ? CAMPAIGN_STARTING_CREDITS : 0)) || 0)),
    intelligenceByNode: raw.intelligenceByNode && typeof raw.intelligenceByNode === 'object'
      ? Object.fromEntries(Object.entries(raw.intelligenceByNode).filter(([id]) => validIds.has(id)).map(([id, level]) => [id, clampIntelLevel(level)]))
      : {},
    relicIds: Array.isArray(raw.relicIds) ? [...new Set(raw.relicIds.filter((id) => CAMPAIGN_RELIC_BY_ID[id]))].slice(0, CAMPAIGN_RELICS.length) : [],
    eventLog: Array.isArray(raw.eventLog) ? raw.eventLog.slice(-30) : [],
  };
}

function saveCampaign(state) {
  const normalized = normalizeCampaign(state);
  setProfileStorageItem(KEY, JSON.stringify(normalized));
  return normalized;
}

export function loadCampaign() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, KEY);
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
  const phase = node.type === 'event' ? 'event' : node.type === 'camp' ? 'camp' : 'briefing';
  const intelligenceByNode = { ...(state.intelligenceByNode || {}) };
  if (hasRelic(state, 'forwardObserver') && ['battle', 'elite', 'boss'].includes(node.type)) {
    intelligenceByNode[node.id] = Math.max(1, clampIntelLevel(intelligenceByNode[node.id]));
  }
  return saveCampaign({ ...state, phase, selectedNodeId: node.id, rewardChosenForNode: null, intelligenceByNode });
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
  const earned = (BATTLE_CREDIT_REWARD[node.type] || 0) + (hasRelic(state, 'quartermasterSeal') ? 2 : 0);
  const dossierEarned = node.type === 'elite' && node.stage >= 5 && !hasRelic(state, 'kingDossier');
  const credited = {
    ...state,
    relicIds: dossierEarned ? [...new Set([...(state.relicIds || []), 'kingDossier'])] : [...(state.relicIds || [])],
    operationalCredits: Math.max(0, (Number(state.operationalCredits) || 0) + earned),
    eventLog: [
      ...(state.eventLog || []),
      ...(earned > 0 ? [`Objetivo cumplido: +${earned} créditos operativos`] : []),
      ...(dossierEarned ? ['Intel élite recuperada: Dossier del Rey Viejo'] : []),
    ].slice(-30),
  };
  if (node.type === 'boss') {
    setProfileStorageItem(TOWER_COMPLETED_KEY, '1');
    const bestFloor = Math.max(10, Number.parseInt(getStorageItem(STORAGE_LOCAL, BEST_FLOOR_KEY) || '0', 10) || 0);
    setProfileStorageItem(BEST_FLOOR_KEY, String(bestFloor));
    setProfileStorageItem(BEST_STAGE_KEY, String(CAMPAIGN_BOSS_STAGE));
    return markNodeCleared(credited, { phase: 'completed', nextDifficultyDelta: 0 });
  }
  const best = Math.max(loadCampaignBestStage(), node.stage);
  setProfileStorageItem(BEST_STAGE_KEY, String(best));
  return saveCampaign({ ...credited, phase: 'reward', nextDifficultyDelta: 0 });
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
  const campCredits = state.phase === 'camp' && hasRelic(state, 'campLedger') ? 3 : 0;
  return markNodeCleared({
    ...state,
    perks,
    rewardChosenForNode: node.id,
    operationalCredits: (Number(state.operationalCredits) || 0) + campCredits,
  }, {
    phase: 'map',
    eventLog: [...(state.eventLog || []), `${label}${campCredits ? ` · +${campCredits} créditos de retaguardia` : ''}`].slice(-30),
  });
}

function campaignEventArchetype(node) {
  const label = String(node?.label || '').toLowerCase();
  if (label.includes('radio')) return 'radio';
  if (label.includes('depósito')) return 'depot';
  if (label.includes('exploradores')) return 'scouts';
  return 'convoy';
}

function relicChoice(state, relicId, fallbackCredits = 3) {
  const relic = CAMPAIGN_RELIC_BY_ID[relicId];
  if (!relic) return {};
  if (hasRelic(state, relicId)) return { credits: fallbackCredits, duplicateRelic: relicId };
  return { relicId };
}

export function campaignEventOptions(state) {
  const node = campaignNode(state);
  if (!node || state.phase !== 'event') return [];
  const archetype = campaignEventArchetype(node);
  const supplyPerk = rewardOptionsForFloor(state.seed, node.floor + 37)[0];
  if (archetype === 'radio') return [
    { id:'decrypt', label:'Descifrar el tráfico', description:'Obtienes el Cifrador de campaña. Si ya lo tienes, recuperas 4 créditos.', ...relicChoice(state, 'fieldCipher', 4) },
    { id:'jam', label:'Interferir la red', description:'Silencias coordinación enemiga: −5 de dificultad en el próximo combate.', difficultyDelta:-5 },
    { id:'trace', label:'Rastrear al operador', description:'Obtienes Óptica del observador, pero la búsqueda genera ruido: +2 al próximo combate.', difficultyDelta:2, ...relicChoice(state, 'forwardObserver', 4) },
  ];
  if (archetype === 'depot') return [
    { id:'inventory', label:'Inventariar y marcharse', description:'Trabajo aburrido, resultado excelente: +6 créditos sin alterar la amenaza.', credits:6 },
    { id:'salvage', label:`Vaciar el depósito · ${supplyPerk.label}`, description:'Obtienes una ventaja temporal, pero haces ruido: +4 al próximo combate.', difficultyDelta:4, perkId:supplyPerk.id },
    { id:'ledger', label:'Recuperar libro logístico', description:'Obtienes Libro de retaguardia. Si ya lo tienes, +4 créditos.', ...relicChoice(state, 'campLedger', 4) },
  ];
  if (archetype === 'scouts') return [
    { id:'shadow', label:'Seguirlos sin contacto', description:'Aprendes la ruta enemiga: −6 de dificultad en el próximo combate.', difficultyDelta:-6 },
    { id:'seizeMaps', label:'Confiscar sus mapas', description:'Obtienes Equipo de infiltración, pero el forcejeo deja +3 de ruido.', difficultyDelta:3, ...relicChoice(state, 'silentBoots', 4) },
    { id:'trade', label:'Intercambiar información', description:'Sin bajas ni heroicidades: +4 créditos operativos.', credits:4 },
  ];
  return [
    { id:'recon', label:'Reconocimiento silencioso', description:'Rodeas el convoy sin tocarlo: −6 de dificultad en el próximo combate.', difficultyDelta:-6 },
    { id:'salvage', label:`Saquear suministros · ${supplyPerk.label}`, description:'Ganas una ventaja temporal, pero haces ruido: +4 al próximo combate.', difficultyDelta:4, perkId:supplyPerk.id },
    { id:'manifest', label:'Recuperar el manifiesto', description:'Obtienes Sello de intendencia. Si ya lo tienes, +4 créditos.', ...relicChoice(state, 'quartermasterSeal', 4) },
  ];
}

export function resolveCampaignEvent(state, choiceId) {
  const node = campaignNode(state);
  if (!node || state.phase !== 'event') return state;
  const option = campaignEventOptions(state).find((item) => item.id === choiceId);
  if (!option) return state;
  const perks = option.perkId ? [...(state.perks || []), option.perkId] : [...(state.perks || [])];
  const relicIds = option.relicId ? [...new Set([...(state.relicIds || []), option.relicId])] : [...(state.relicIds || [])];
  const rawDelta = Number(option.difficultyDelta) || 0;
  const delta = rawDelta > 0 && hasRelic(state, 'silentBoots') ? Math.max(0, rawDelta - 2) : rawDelta;
  const credits = Math.max(0, Number(option.credits) || 0);
  const rewardBits = [option.label];
  if (option.relicId) rewardBits.push(`reliquia: ${CAMPAIGN_RELIC_BY_ID[option.relicId]?.label}`);
  if (option.duplicateRelic) rewardBits.push(`duplicada → +${credits} créditos`);
  else if (credits) rewardBits.push(`+${credits} créditos`);
  if (delta) rewardBits.push(`${delta > 0 ? '+' : ''}${delta} amenaza siguiente`);
  if (option.perkId) rewardBits.push(perkById(option.perkId)?.label || 'botín');
  return markNodeCleared({
    ...state,
    perks,
    relicIds,
    operationalCredits: (Number(state.operationalCredits) || 0) + credits,
  }, {
    phase: 'map',
    nextDifficultyDelta: Math.max(-12, Math.min(12, (state.nextDifficultyDelta || 0) + delta)),
    eventLog: [...(state.eventLog || []), rewardBits.join(' · ')].slice(-30),
  });
}

export function campaignDifficulty(state, node = campaignNode(state)) {
  if (!node || !['battle', 'elite', 'boss'].includes(node.type)) return 0;
  const bossDelta = node.type === 'boss' && hasRelic(state, 'kingDossier') ? -4 : 0;
  return Math.max(5, Math.min(95, node.baseDifficulty + (Number(state?.nextDifficultyDelta) || 0) + bossDelta));
}


export function loadCampaignArchive() {
  try {
    const raw = JSON.parse(getStorageItem(STORAGE_LOCAL, OPERATION_ARCHIVE_KEY) || '[]');
    return Array.isArray(raw) ? raw.slice(0, 12) : [];
  } catch { return []; }
}

function archiveCampaignOperation(state, reason, stage) {
  if (!state?.seed || !state?.active) return null;
  const map = campaignMap(state.seed);
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const route = [...(state.route || ['start'])];
  const entry = {
    id: `${state.seed}:${Date.now()}`,
    seed: state.seed,
    endedAt: Date.now(),
    reason,
    stage,
    route,
    routeLabels: route.map((id) => byId.get(id)?.label || id),
    relicIds: [...(state.relicIds || [])],
    credits: Math.max(0, Number(state.operationalCredits) || 0),
    cleared: (state.clearedNodeIds || []).length,
  };
  const next = [entry, ...loadCampaignArchive()].slice(0, 12);
  setProfileStorageItem(OPERATION_ARCHIVE_KEY, JSON.stringify(next));
  return entry;
}

export function endCampaign(state, reason = 'retired') {
  const node = campaignNode(state, state?.selectedNodeId || state?.currentNodeId);
  const stage = Math.max(0, Number(node?.stage) || 0);
  if (stage > loadCampaignBestStage()) setProfileStorageItem(BEST_STAGE_KEY, String(stage));
  const archiveEntry = archiveCampaignOperation(state, reason, stage);
  const result = { reason, stage, route: [...(state?.route || ['start'])], archiveEntry };
  saveCampaign(emptyCampaign());
  return result;
}

export function loadCampaignBestStage() {
  const n = Number.parseInt(getStorageItem(STORAGE_LOCAL, BEST_STAGE_KEY) || '0', 10) || 0;
  return Math.max(0, Math.min(CAMPAIGN_BOSS_STAGE, n));
}

export function resetCombatCampaign() {
  removeProfileStorageItem(KEY);
  removeProfileStorageItem(BEST_STAGE_KEY);
  removeProfileStorageItem(OPERATION_ARCHIVE_KEY);
}
