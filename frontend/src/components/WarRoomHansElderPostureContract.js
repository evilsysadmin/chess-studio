export const WAR_ROOM_HANS_ELDER_POSTURE_VERSION = 'elder-posture-v3-stooped-gait';

export const HANS_ELDER_POSTURE = Object.freeze({
  torsoHunchRadians: 0.095,
  torsoDrop: 0.018,
  headDrop: 0.055,
  headForward: 0.075,
  headTiltRadians: 0.028,
  leftArmRoll: -0.018,
  rightArmRoll: 0.024,

  // Walking deltas are applied on top of the canonical standing posture.
  // Keep them here so Hans has one disciplined elder-body contract rather
  // than independent animation correctors fighting each other.
  gaitHunchDeltaRadians: 0.055,
  gaitHeadNodBaseRadians: 0.020,
  gaitTorsoSway: 0.011,
  gaitTorsoRoll: 0.010,
  gaitTorsoYaw: 0.008,
  gaitBob: 0.010,
  gaitHeadSway: 0.42,
  gaitStrideLength: 0.085,
  gaitFootClearance: 0.021,
  gaitStanceCompression: 0.022,
  gaitMinKneeFlex: 0.075,
  gaitArmSwingGain: 0.92,
  gaitAsymmetry: 0.12,
});
