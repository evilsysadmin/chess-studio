import {
  chroniclesEnemyIsActive,
  chroniclesEnemyPosition,
} from '../chroniclesOfMatthias.js';
import { chroniclesEnemyRenderRoster } from '../chroniclesEnemyRenderRoster.js';
import { chroniclesPartyGridFootprint } from '../chroniclesPartyFootprint.js';
import { chroniclesContentVisualStates } from './chroniclesContentVisualState.js';
import { chroniclesIsometricScenePlan } from './chroniclesIsometricScenePlan.js';

export const CHRONICLES_SCENE_MODEL_VERSION = 1;

function point(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return Object.freeze({ x: Number(value.x), y: Number(value.y) });
}

function runtimeEnemyPosition(state, enemy) {
  const runtime = state?.enemyPositions?.[enemy.id];
  if (runtime && Number.isFinite(runtime.x) && Number.isFinite(runtime.y)) return runtime;
  return chroniclesEnemyPosition(state, enemy);
}

function projectInteraction(interaction) {
  if (!interaction?.mode) return null;
  return Object.freeze({
    mode: interaction.mode,
    legalMoves: Object.freeze((interaction.legalMoves || []).map((move) => Object.freeze({
      x: Number(move.x),
      y: Number(move.y),
    }))),
    legalTargets: Object.freeze((interaction.legalTargets || []).map((target) => Object.freeze({
      enemyId: String(target.enemyId || ''),
      x: Number(target.x),
      y: Number(target.y),
    }))),
  });
}


function assertFiniteCell(cell, label) {
  if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.y)) {
    throw new Error(`Chronicles scene model requires finite ${label}`);
  }
}

function assertUniqueIds(entries, label) {
  const ids = entries.map((entry) => String(entry?.id || ''));
  if (ids.some((id) => !id)) throw new Error(`Chronicles scene model requires ${label} ids`);
  if (new Set(ids).size !== ids.length) throw new Error(`Chronicles scene model has duplicate ${label} ids`);
}

export function chroniclesValidateSceneModel(model) {
  if (!model || typeof model !== 'object') throw new Error('Chronicles scene model is required');
  if (model.version !== CHRONICLES_SCENE_MODEL_VERSION) throw new Error('Unsupported Chronicles scene model version');
  if (typeof model.mapId !== 'string' || !model.mapId) throw new Error('Chronicles scene model requires mapId');
  if (!model.scenePlan || model.scenePlan.mapId !== model.mapId) throw new Error('Chronicles scene model map mismatch');
  assertFiniteCell(model.focusCell, 'focusCell');
  if (!Array.isArray(model.party) || !Array.isArray(model.enemies) || !Array.isArray(model.content)) {
    throw new Error('Chronicles scene model requires party, enemies and content arrays');
  }
  assertUniqueIds(model.party, 'party');
  assertUniqueIds(model.enemies, 'enemy');
  assertUniqueIds(model.content, 'content');

  model.party.forEach((member) => {
    if (member.visible) assertFiniteCell(member.cell, `party cell for ${member.id}`);
    if (!Number.isFinite(member.hpRatio) || member.hpRatio < 0 || member.hpRatio > 1) {
      throw new Error(`Chronicles scene model has invalid hpRatio for ${member.id}`);
    }
  });
  model.enemies.forEach((enemy) => {
    if (enemy.visible) assertFiniteCell(enemy.cell, `enemy cell for ${enemy.id}`);
  });

  if (model.interaction) {
    if (!['move', 'attack', 'hybrid'].includes(model.interaction.mode)) {
      throw new Error('Chronicles scene model has invalid interaction mode');
    }
    (model.interaction.legalMoves || []).forEach((cell) => assertFiniteCell(cell, 'legal move'));
    (model.interaction.legalTargets || []).forEach((target) => {
      if (!target.enemyId) throw new Error('Chronicles scene model target requires enemyId');
      assertFiniteCell(target, `legal target ${target.enemyId}`);
    });
  }

  return model;
}

export function chroniclesSceneWorldObjectStateFromContent(content = []) {
  const firstByKind = (kind) => content.find((entry) => entry.kind === kind) || null;
  return Object.freeze({
    triggerActivated: Boolean(firstByKind('trigger')?.activated),
    leverActivated: Boolean(firstByKind('lever')?.activated),
    pickupVisible: Boolean(firstByKind('pickup')?.visible),
  });
}

export function chroniclesSceneWorldObjectState(state) {
  return chroniclesSceneWorldObjectStateFromContent(chroniclesContentVisualStates(state));
}

export function chroniclesProjectSceneModel(
  state,
  { selectedMemberId = 'matthias', interaction = null } = {},
) {
  if (!state || typeof state !== 'object') throw new Error('Chronicles scene projection requires state');

  const scenePlan = chroniclesIsometricScenePlan(state);
  const footprint = chroniclesPartyGridFootprint(state);
  const content = chroniclesContentVisualStates(state);
  const party = Object.freeze((state.party || []).map((member) => Object.freeze({
    id: member.id,
    visible: Number(member.hp || 0) > 0 && Boolean(footprint[member.id]),
    hpRatio: Math.max(0, Math.min(1, Number(member.maxHp || 0) > 0
      ? Number(member.hp || 0) / Number(member.maxHp)
      : 0)),
    cell: point(footprint[member.id]),
  })));

  const enemies = Object.freeze(chroniclesEnemyRenderRoster(state).map((entry) => {
    const definition = entry.definition;
    const visible = chroniclesEnemyIsActive(state, definition)
      && Number(state[definition.hpKey] || 0) > 0;
    return Object.freeze({
      id: entry.id,
      visualType: entry.visualType,
      visualScale: entry.visualScale,
      visualMotion: entry.visualMotion,
      visible,
      cell: visible ? point(runtimeEnemyPosition(state, definition)) : null,
    });
  }));

  return chroniclesValidateSceneModel(Object.freeze({
    version: CHRONICLES_SCENE_MODEL_VERSION,
    mapId: state.mapId,
    scenePlan,
    focusCell: Object.freeze({ x: Number(state.x), y: Number(state.y) }),
    selectedMemberId: selectedMemberId || 'matthias',
    party,
    enemies,
    content,
    worldObjects: chroniclesSceneWorldObjectStateFromContent(content),
    interaction: projectInteraction(interaction),
  }));
}
