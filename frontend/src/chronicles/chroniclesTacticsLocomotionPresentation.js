import { facingAngle, shortestAngleDelta } from '../chroniclesOfMatthiasIsometricMath.js';
import { tickChroniclesCarriedTorch } from './chroniclesCarriedTorch.js';
import { CHRONICLES_ISO_PARTY_FACING } from './chroniclesTacticsPartyPresentation.js';

export function chroniclesFrameTiming(clock) {
  const deltaSeconds = Math.max(1 / 240, Math.min(0.1, Number(clock?.getDelta?.()) || 1 / 60));
  return Object.freeze({ deltaSeconds, time: Number(clock?.elapsedTime) || 0 });
}

function frameRateIndependentAlpha(ratePerSecond, deltaSeconds) {
  const dt = Math.max(1 / 240, Math.min(0.1, Number(deltaSeconds) || 1 / 60));
  return 1 - Math.exp(-Math.max(0, ratePerSecond) * dt);
}

export function chroniclesExplorationMotion(
  partyPosition,
  desiredParty,
  partyFormation,
  deltaSeconds = 1 / 60,
) {
  const distanceSquared = partyPosition.distanceToSquared(desiredParty);
  const moving = partyFormation === 'explore-compact' && distanceSquared > 0.03;
  return Object.freeze({
    moving,
    yaw: moving ? facingAngle(partyPosition, desiredParty) : CHRONICLES_ISO_PARTY_FACING,
    rootLerp: frameRateIndependentAlpha(moving ? 14 : 17, deltaSeconds),
    memberLerp: frameRateIndependentAlpha(moving ? 18 : 22, deltaSeconds),
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
  deltaSeconds = 1 / 60,
} = {}) {
  const motion = chroniclesExplorationMotion(
    party.root.position,
    desiredParty,
    partyFormation,
    deltaSeconds,
  );
  if (host?.dataset) host.dataset.chroniclesPartyMotion = motion.moving ? 'walking' : 'idle';
  if (!motion.moving && partyFormation === 'explore-compact') party.root.position.copy(desiredParty);
  else party.root.position.lerp(desiredParty, motion.rootLerp);
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
