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

  return Object.freeze({
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
  });
}
