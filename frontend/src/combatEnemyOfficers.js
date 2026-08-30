import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { seededUnit } from './roguelikeModifiers.js';

export const COMBAT_ENEMY_OFFICERS_KEY = 'chess-study-combat-enemy-officers-v1';

const OFFICERS = Object.freeze([
  Object.freeze({ id: 'adler', rank: 'Teniente', name: 'Viktor Adler', callsign: 'Alfil Gris' }),
  Object.freeze({ id: 'falk', rank: 'Teniente', name: 'Mara Falk', callsign: 'Aguja' }),
  Object.freeze({ id: 'vega', rank: 'Capitán', name: 'Inés Vega', callsign: 'Farol' }),
  Object.freeze({ id: 'krall', rank: 'Capitán', name: 'Otto Krall', callsign: 'Yunque' }),
  Object.freeze({ id: 'saeed', rank: 'Mayor', name: 'Nadir Saeed', callsign: 'Sombra' }),
  Object.freeze({ id: 'volkov', rank: 'Mayor', name: 'Irina Volkov', callsign: 'Torre Roja' }),
  Object.freeze({ id: 'mercier', rank: 'Coronel', name: 'Luc Mercier', callsign: 'Compás' }),
  Object.freeze({ id: 'ibarra', rank: 'Coronel', name: 'Elena Ibarra', callsign: 'Centinela' }),
]);

const OFFICER_RANKS = Object.freeze(['Teniente', 'Capitán', 'Mayor', 'Comandante', 'Coronel', 'General']);
const VALID_OUTCOMES = new Set(['win', 'loss', 'draw', 'retired']);
const CAMPAIGN_SESSION_RE = /^campaign:([^:]+):(s(\d+)-l(\d+)-(battle|elite|boss))$/;

function boundedInt(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeRecord(record = {}) {
  return {
    officerId: String(record.officerId || ''),
    encounters: boundedInt(record.encounters),
    playerWins: boundedInt(record.playerWins),
    officerWins: boundedInt(record.officerWins),
    draws: boundedInt(record.draws),
    retreats: boundedInt(record.retreats),
    firstSeenAt: boundedInt(record.firstSeenAt),
    lastSeenAt: boundedInt(record.lastSeenAt),
    lastOutcome: VALID_OUTCOMES.has(record.lastOutcome) ? record.lastOutcome : null,
    lastCampaignSeed: record.lastCampaignSeed ? String(record.lastCampaignSeed) : null,
    lastNodeId: record.lastNodeId ? String(record.lastNodeId) : null,
    lastNodeLabel: record.lastNodeLabel ? String(record.lastNodeLabel) : null,
    recentEncounters: Array.isArray(record.recentEncounters)
      ? record.recentEncounters.slice(0, 10).map((entry) => ({
          id: String(entry?.id || ''),
          outcome: VALID_OUTCOMES.has(entry?.outcome) ? entry.outcome : null,
          at: boundedInt(entry?.at),
          campaignSeed: entry?.campaignSeed ? String(entry.campaignSeed) : null,
          nodeId: entry?.nodeId ? String(entry.nodeId) : null,
          nodeLabel: entry?.nodeLabel ? String(entry.nodeLabel) : null,
        })).filter((entry) => entry.id && entry.outcome)
      : [],
  };
}

export function officerServiceRank(officer, rawRecord = {}) {
  if (!officer) return null;
  const record = normalizeRecord(rawRecord);
  const baseIndex = Math.max(0, OFFICER_RANKS.indexOf(officer.rank));
  // Ascenso narrativo por resultados reales: vencer al jugador pesa, las tablas
  // algo, y la veteranía aporta muy poco. Ser apaleado muchas veces no basta.
  const serviceScore = (record.officerWins * 3) + record.draws + Math.min(2, Math.floor(record.encounters / 4));
  const earnedSteps = serviceScore >= 10 ? 2 : serviceScore >= 4 ? 1 : 0;
  const rankIndex = Math.min(OFFICER_RANKS.length - 1, baseIndex + earnedSteps);
  const promotions = Math.max(0, rankIndex - baseIndex);
  const nextThreshold = rankIndex >= OFFICER_RANKS.length - 1
    ? null
    : serviceScore < 4 ? 4 : serviceScore < 10 ? 10 : null;
  return {
    rank: OFFICER_RANKS[rankIndex],
    baseRank: officer.rank,
    serviceScore,
    promotions,
    nextPromotionIn: nextThreshold == null ? null : Math.max(0, nextThreshold - serviceScore),
  };
}

export function loadEnemyOfficerHistory() {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_LOCAL, COMBAT_ENEMY_OFFICERS_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .map(([id, record]) => [id, normalizeRecord(record)])
      .filter(([id, record]) => id && record.officerId === id));
  } catch {
    return {};
  }
}

function officerPoolForNode(node) {
  if (node?.type === 'elite') return OFFICERS.slice(2);
  return OFFICERS;
}

export function enemyOfficerForNode(campaignSeed, node) {
  if (!campaignSeed || !node || !['battle', 'elite'].includes(node.type)) return null;
  const pool = officerPoolForNode(node);
  const roll = seededUnit(`enemy-officer:${campaignSeed}:${node.stage}:${node.lane}`, 1);
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))] || null;
}

export function campaignOfficerContext(combatSessionId, nodeLabel = '') {
  const match = String(combatSessionId || '').match(CAMPAIGN_SESSION_RE);
  if (!match) return null;
  const [, campaignSeed, nodeId, stage, lane, type] = match;
  if (type === 'boss') return null;
  return {
    campaignSeed,
    node: {
      id: nodeId,
      stage: Number(stage),
      lane: Number(lane),
      type,
      label: String(nodeLabel || nodeId),
    },
  };
}

export function enemyOfficerBriefing(campaignSeed, node, history = loadEnemyOfficerHistory()) {
  const officer = enemyOfficerForNode(campaignSeed, node);
  if (!officer) return null;
  const record = normalizeRecord(history?.[officer.id]);
  const known = record.encounters > 0;
  const service = officerServiceRank(officer, record);
  const score = known ? `${record.playerWins}–${record.officerWins}` : null;
  const drawSuffix = record.draws > 0 ? ` · ${record.draws} tablas` : '';
  const promotionSuffix = service.promotions > 0
    ? ` Ascendido ${service.promotions === 1 ? 'una vez' : `${service.promotions} veces`} por servicio registrado.`
    : '';
  const resultNote = !known
    ? 'Primer contacto confirmado.'
    : record.lastOutcome === 'loss'
      ? `Te venció la última vez · balance ${score}${drawSuffix}.`
      : record.lastOutcome === 'win'
        ? `Lo venciste la última vez · balance ${score}${drawSuffix}.`
        : record.lastOutcome === 'draw'
          ? `La última quedó en tablas · balance ${score}${drawSuffix}.`
          : `Último contacto: retirada · balance ${score}${drawSuffix}.`;
  const note = `${resultNote}${promotionSuffix} El rango es expediente narrativo: no altera la fuerza de la CPU.`;
  return {
    ...officer,
    rank: service.rank,
    baseRank: service.baseRank,
    serviceScore: service.serviceScore,
    promotions: service.promotions,
    nextPromotionIn: service.nextPromotionIn,
    known,
    record,
    score,
    note,
  };
}

export function recordEnemyOfficerEncounter({ campaignSeed, node, outcome, encounterId, at = Date.now() } = {}) {
  if (!VALID_OUTCOMES.has(outcome) || !encounterId) return loadEnemyOfficerHistory();
  const officer = enemyOfficerForNode(campaignSeed, node);
  if (!officer) return loadEnemyOfficerHistory();

  const history = loadEnemyOfficerHistory();
  const current = normalizeRecord({ officerId: officer.id, ...(history[officer.id] || {}) });
  if (current.recentEncounters.some((entry) => entry.id === String(encounterId))) return history;

  const encounter = {
    id: String(encounterId),
    outcome,
    at: boundedInt(at),
    campaignSeed: String(campaignSeed),
    nodeId: String(node.id || ''),
    nodeLabel: String(node.label || ''),
  };
  const nextRecord = {
    ...current,
    officerId: officer.id,
    encounters: current.encounters + 1,
    playerWins: current.playerWins + (outcome === 'win' ? 1 : 0),
    officerWins: current.officerWins + (outcome === 'loss' ? 1 : 0),
    draws: current.draws + (outcome === 'draw' ? 1 : 0),
    retreats: current.retreats + (outcome === 'retired' ? 1 : 0),
    firstSeenAt: current.firstSeenAt || encounter.at,
    lastSeenAt: encounter.at,
    lastOutcome: outcome,
    lastCampaignSeed: encounter.campaignSeed,
    lastNodeId: encounter.nodeId,
    lastNodeLabel: encounter.nodeLabel,
    recentEncounters: [encounter, ...current.recentEncounters].slice(0, 10),
  };
  const next = { ...history, [officer.id]: nextRecord };
  setProfileStorageItem(COMBAT_ENEMY_OFFICERS_KEY, JSON.stringify(next));
  return next;
}

export function recordEnemyOfficerSessionEncounter({ combatSessionId, encounterLabel, outcome, encounterId, at } = {}) {
  const context = campaignOfficerContext(combatSessionId, encounterLabel);
  if (!context) return loadEnemyOfficerHistory();
  return recordEnemyOfficerEncounter({ ...context, outcome, encounterId, at });
}

export { OFFICERS as COMBAT_ENEMY_OFFICERS, OFFICER_RANKS as COMBAT_ENEMY_OFFICER_RANKS };
