export const MATTHIAS_HOME_PROP_ERGONOMICS_VERSION = 'home-props-v1-handheld';

function normalizedProfile(value = '') {
  return String(value || '').trim().toLowerCase();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function setScalar(group, value) {
  group?.scale?.setScalar?.(value);
}

function setPose(group, position, rotation, scale = 1) {
  if (!group) return;
  group.position.set(...position);
  group.rotation.set(...rotation);
  setScalar(group, scale);
}

function setLimb(stem, glove, stemPosition, stemRotationZ, glovePosition) {
  if (!stem || !glove) return;
  stem.position.set(...stemPosition);
  stem.rotation.z = stemRotationZ;
  glove.position.set(...glovePosition);
}

function ensurePress(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  if (activityRig.press) return activityRig.press;

  const source = rig.root?.getObjectByName?.('breakfast-newspaper');
  if (!source) return null;

  const press = source.clone(true);
  press.name = 'activity-press';
  press.position.set(0, 0, 0);
  press.rotation.set(0, 0, 0);
  press.scale.setScalar(1);
  press.visible = false;
  activityRig.root.add(press);
  activityRig.press = press;
  return press;
}

export function matthiasHomeErgonomicActivityProp(profile = '', baseProp = 'none') {
  return normalizedProfile(profile) === 'press' ? 'press' : baseProp;
}

export function applyMatthiasHomePropErgonomics(rig, pose = {}) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return 'none';

  const profile = normalizedProfile(pose.activityProfile);
  const baseProp = String(rig.root?.userData?.activityProp || 'none');
  const prop = matthiasHomeErgonomicActivityProp(profile, baseProp);
  const reach = clamp01(rig.root?.userData?.activityReach ?? pose.reach);
  const yaw = Number(pose.headYaw) || 0;
  const press = ensurePress(rig);

  if (press) press.visible = prop === 'press';

  const {
    cup,
    beer,
    breakfast,
    ration,
    book,
    dossier,
    write,
    chess,
    blanket,
    support,
    supportStem,
    supportGlove,
    assist,
    assistStem,
    assistGlove,
  } = activityRig;

  // A prop must either be gripped or visibly resting on a deliberate low surface.
  // Nothing is allowed to sit flat against Matthias' torso like a badge or label.
  if (prop === 'cup') {
    setPose(cup, [.50 - reach * .18, -.34 + reach * .46, .76], [.08 + reach * .08, -.14, -.16], .82);
    support.visible = true;
    assist.visible = false;
    setLimb(
      supportStem,
      supportGlove,
      [.39 - reach * .04, -.34 + reach * .18, .47],
      -.58 - reach * .10,
      [cup.position.x + .10, cup.position.y - .02, .72],
    );
  } else if (prop === 'beer') {
    setPose(beer, [.49 - reach * .16, -.37 + reach * .40, .76], [.08 + reach * .06, -.16, -.14], .86);
    support.visible = true;
    assist.visible = false;
    setLimb(
      supportStem,
      supportGlove,
      [.39 - reach * .03, -.36 + reach * .16, .47],
      -.60 - reach * .08,
      [beer.position.x + .11, beer.position.y - .03, .72],
    );
  } else if (prop === 'breakfast') {
    // Carry one compact breakfast tray instead of levitating three unrelated props.
    setPose(breakfast, [.15, -.66 + reach * .04, .75], [-.48, -.08, -.06], .76);
    setPose(cup, [-.16, -.58 + reach * .06, .77], [.08, .08, .05], .68);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.34, -.45, .48], -.58, [.34, -.47, .70]);
    setLimb(assistStem, assistGlove, [-.34, -.45, .47], .58, [-.22, -.47, .70]);
  } else if (prop === 'ration') {
    // Plate low and offset, held from below. It should read as lunch, never as armour.
    setPose(ration, [.25, -.64 + reach * .06, .75], [-.46 + reach * .04, -.12, -.10], .86);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.36, -.44, .48], -.56, [.39, -.45, .70]);
    setLimb(assistStem, assistGlove, [-.27, -.44, .47], .66, [.02, -.46, .69]);
  } else if (prop === 'book') {
    // Open book between both hands, slightly off-axis toward Matthias' current gaze.
    setPose(book, [-.14, -.57 + reach * .05, .78], [-.50, .18 + yaw * .28, .07], .86);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.31, -.39, .48], -.66, [.16, -.40, .71]);
    setLimb(assistStem, assistGlove, [-.34, -.39, .47], .62, [-.38, -.40, .70]);
  } else if (prop === 'dossier') {
    // The dossier is deliberately smaller, lateral and foreshortened: one hand
    // carries its lower edge while the other can turn a page.
    setPose(dossier, [.27, -.60 + reach * .04, .77], [-.44, -.34 + yaw * .18, -.15], .84);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.35, -.40, .48], -.61, [.43, -.42, .71]);
    setLimb(assistStem, assistGlove, [-.25, -.36, .47], .76, [.08, -.34, .72]);
  } else if (prop === 'write') {
    // Writing is a low clipboard posture. One hand pins the page, the other meets
    // the pen, so the dossier no longer floats under Matthias' chin.
    setPose(write, [.20, -.64 + reach * .04, .76], [-.58, -.24 + yaw * .12, -.12], .80);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.34, -.39, .48], -.68, [.35, -.43, .72]);
    setLimb(assistStem, assistGlove, [-.29, -.42, .47], .66, [-.02, -.45, .69]);
  } else if (prop === 'chess') {
    // The board is a low analysis surface, not a checkerboard breastplate.
    setPose(chess, [.25, -.72 + reach * .03, .79], [-.66, -.08 + yaw * .06, -.11], .80);
    support.visible = true;
    assist.visible = false;
    setLimb(supportStem, supportGlove, [.37, -.42, .48], -.72, [.39, -.38, .72]);
  } else if (prop === 'press') {
    // Chess Weekly: folded press held with both hands, not the strategy book.
    setPose(press, [-.10, -.57 + reach * .04, .78], [-.48, .16 + yaw * .24, .06], .92);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.31, -.39, .48], -.64, [.14, -.40, .71]);
    setLimb(assistStem, assistGlove, [-.32, -.39, .47], .62, [-.32, -.40, .70]);
  } else if (prop === 'blanket') {
    // Sleep is already a dedicated wrapped composition. Preserve it verbatim.
    support.visible = false;
    assist.visible = false;
    setScalar(blanket, 1);
  }

  activityRig.currentProp = prop;
  rig.root.userData.activityProp = prop;
  rig.root.userData.activityErgonomicsVersion = MATTHIAS_HOME_PROP_ERGONOMICS_VERSION;
  return prop;
}
