function collectNamedMeshes(root, name) {
  const matches = [];
  root?.traverse?.((object) => {
    if (object?.isMesh && object.name === name) matches.push(object);
  });
  return matches;
}

function gauntletForSide(armor, handSide) {
  return collectNamedMeshes(armor, 'war-room-armor-gauntlet')
    .find((gauntlet) => Math.sign(gauntlet.position.x) === handSide) || null;
}

export function bindArmorGauntletFingerPlates(armor, towardBoard = 1) {
  if (!armor || armor.userData.warRoomGauntletArticulation === 'parented-finger-plates-v1') return 0;

  const plates = collectNamedMeshes(armor, 'war-room-armor-gauntlet-finger-plate');
  let bound = 0;

  for (const handSide of [-1, 1]) {
    const gauntlet = gauntletForSide(armor, handSide);
    if (!gauntlet) continue;
    const sidePlates = plates
      .filter((plate) => Math.sign(plate.position.x) === handSide)
      .sort((a, b) => Math.abs(a.position.y - gauntlet.position.y) - Math.abs(b.position.y - gauntlet.position.y));

    sidePlates.forEach((plate, finger) => {
      plate.parent?.remove?.(plate);
      gauntlet.add(plate);
      plate.position.set(
        -handSide * (0.005 + finger * 0.007),
        (-0.03 - finger * 0.018) / Math.max(0.001, gauntlet.scale.y),
        towardBoard * (0.035 + finger * 0.015) / Math.max(0.001, gauntlet.scale.z),
      );
      plate.rotation.set(0, 0, handSide * 0.08);
      plate.userData.warRoomArticulation = 'gauntlet-local-v1';
      bound += 1;
    });
  }

  armor.userData.warRoomGauntletArticulation = 'parented-finger-plates-v1';
  armor.userData.warRoomGauntletFingerPlateCount = bound;
  return bound;
}

export function bindWarRoomArmorArticulation(root, towardBoard = 1) {
  let bound = 0;
  for (const name of ['war-room-teutonic-armor-left', 'war-room-teutonic-armor-right']) {
    bound += bindArmorGauntletFingerPlates(root?.getObjectByName?.(name), towardBoard);
  }
  if (root?.userData) root.userData.warRoomArmorArticulation = 'gauntlet-local-v1';
  return bound;
}
