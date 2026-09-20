import { chroniclesProjectSceneModel, chroniclesValidateSceneModel } from './chroniclesSceneModel.js';

function cellKey(cell) {
  return cell ? `${cell.x},${cell.y}` : null;
}

function freezeList(values) {
  return Object.freeze(values.map((value) => Object.freeze(value)));
}

export function chroniclesHeadlessSceneSnapshot(
  state,
  { selectedMemberId = 'matthias', interaction = null } = {},
) {
  const model = chroniclesValidateSceneModel(chroniclesProjectSceneModel(state, {
    selectedMemberId,
    interaction,
  }));
  const plan = model.scenePlan;

  return Object.freeze({
    version: model.version,
    mapId: model.mapId,
    geometry: Object.freeze({
      width: Number(plan.width || 0),
      height: Number(plan.height || 0),
      floors: Object.freeze((plan.floors || []).map((cell) => `${cell.x},${cell.y}:${cell.tile || '.'}`)),
      walls: Object.freeze((plan.walls || []).map(cellKey)),
      wallFaces: Object.freeze((plan.wallFaces || []).map((face) => `${face.x},${face.y}:${face.side}`)),
    }),
    focusCell: cellKey(model.focusCell),
    selectedMemberId: model.selectedMemberId,
    party: freezeList(model.party.map((member) => ({
      id: member.id,
      visible: member.visible,
      hpRatio: Number(member.hpRatio.toFixed(4)),
      cell: cellKey(member.cell),
    }))),
    enemies: freezeList(model.enemies.map((enemy) => ({
      id: enemy.id,
      visualType: enemy.visualType,
      visible: enemy.visible,
      cell: cellKey(enemy.cell),
    }))),
    content: freezeList(model.content.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      visible: Boolean(entry.visible),
      activated: Boolean(entry.activated),
      position: cellKey(entry.position),
    }))),
    interaction: model.interaction ? Object.freeze({
      mode: model.interaction.mode,
      legalMoves: Object.freeze(model.interaction.legalMoves.map(cellKey)),
      legalTargets: Object.freeze(model.interaction.legalTargets.map((target) => (
        `${target.enemyId}@${cellKey(target)}`
      ))),
    }) : null,
  });
}

export function chroniclesHeadlessSceneSignature(state, options = {}) {
  return JSON.stringify(chroniclesHeadlessSceneSnapshot(state, options));
}
