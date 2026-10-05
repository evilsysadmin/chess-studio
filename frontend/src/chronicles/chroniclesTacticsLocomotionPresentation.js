import { facingAngle, shortestAngleDelta } from '../chroniclesOfMatthiasIsometricMath.js';
import { tickChroniclesCarriedTorch } from './chroniclesCarriedTorch.js';
import { CHRONICLES_ISO_PARTY_FACING } from './chroniclesTacticsPartyPresentation.js';

export function chroniclesExplorationMotion(partyPosition, desiredParty, partyFormation) {
  const moving = partyFormation === 'explore-compact'
    && partyPosition.distanceToSquared(desiredParty) > 0.0025;
  return Object.freeze({
    moving,
    yaw: moving ? facingAngle(partyPosition, desiredParty) : CHRONICLES_ISO_PARTY_FACING,
    rootLerp: moving ? 0.12 : 0.14,
    memberLerp: moving ? 0.16 : 0.2,
  });
}

export function applyChroniclesExplorationGait(model, {
  moving,
  yaw,
  time,
  phaseSeed = 0,
  hpRatio = 1,
} = {}) {
  if (!model) return;
  if (moving) {
    const phase = time * 8.4 + phaseSeed * 1.7;
    const currentYaw = model.userData.chroniclesIsoWalkYaw ?? model.rotation.y;
    const nextYaw = currentYaw + shortestAngleDelta(currentYaw, yaw) * 0.24;
    model.userData.chroniclesIsoWalkYaw = nextYaw;
    model.rotation.y = nextYaw;
    model.rotation.z = Math.sin(phase) * 0.028;
    model.position.y = Math.abs(Math.sin(phase)) * 0.028 - (1 - hpRatio) * 0.025;
    return;
  }

  model.userData.chroniclesIsoWalkYaw = model.rotation.y;
  model.rotation.y = CHRONICLES_ISO_PARTY_FACING + Math.sin(time * 0.55 + phaseSeed) * 0.025;
  model.rotation.z *= 0.82;
  model.position.y = Math.sin(time * 0.8 + phaseSeed) * 0.006 - (1 - hpRatio) * 0.025;
}


export function tickChroniclesExplorationParty(party, {
  desiredParty,
  partyFormation,
  time,
  host = null,
} = {}) {
  const motion = chroniclesExplorationMotion(party.root.position, desiredParty, partyFormation);
  if (host?.dataset) host.dataset.chroniclesPartyMotion = motion.moving ? 'walking' : 'idle';
  party.root.position.lerp(desiredParty, motion.rootLerp);
  party.models.forEach((model, id) => {
    if (!model.visible) return;
    const target = model.userData.chroniclesIsoTarget;
    if (target) model.position.lerp(target, motion.memberLerp);
    model.userData.chroniclesArtTick?.(time);
    applyChroniclesExplorationGait(model, {
      moving: motion.moving,
      yaw: motion.yaw,
      time,
      phaseSeed: id.length,
      hpRatio: model.userData.chroniclesIsoHpRatio ?? 1,
    });
    tickChroniclesCarriedTorch(party.carriedTorches.get(id), time);
  });
  return motion;
}
