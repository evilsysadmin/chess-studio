import { installWarRoomV3StoveFireSprites } from './WarRoomFireSprites.js';

export function warRoomV3FireFrame({
  elapsedMs = 0,
  coarsePointer = false,
  reducedMotion = false,
} = {}) {
  if (reducedMotion) {
    return Object.freeze({ width: 1, height: 1, depth: 1, lift: 0, intensity: 1 });
  }
  const power = coarsePointer ? 0.62 : 1;
  const slow = Math.sin(elapsedMs * 0.0043);
  const flutter = Math.sin(elapsedMs * 0.0107 + 0.9);
  const lick = Math.sin(elapsedMs * 0.0231 + Math.sin(elapsedMs * 0.0019) * 1.7);
  return Object.freeze({
    width: 1 + (flutter * 0.045 - lick * 0.022) * power,
    height: 1 + (slow * 0.075 + lick * 0.055) * power,
    depth: 1 - flutter * 0.026 * power,
    lift: (slow * 0.013 + lick * 0.009) * power,
    intensity: 1 + (slow * 0.065 + flutter * 0.055 + lick * 0.035) * power,
  });
}

export const WAR_ROOM_V3_FLAME_NAMES = Object.freeze([
  'WR3_ARM_hearth_flame_body',
  'WR3_ARM_hearth_flame_0',
  'WR3_ARM_hearth_flame_1',
  'WR3_ARM_hearth_flame_2',
]);

export function installWarRoomV3FireAnimation(
  root,
  {
    coarsePointer = false,
    reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false,
    flameNames = WAR_ROOM_V3_FLAME_NAMES,
    spriteShape = {},
  } = {},
) {
  const flames = flameNames.map((name) => root?.getObjectByName?.(name)).filter(Boolean);
  if (!flames.length) return () => {};

  const bases = flames.map((flame) => ({
    position: flame.position.clone(),
    scale: flame.scale.clone(),
  }));
  const materials = [...new Set(flames.flatMap((flame) => (
    Array.isArray(flame.material) ? flame.material : [flame.material]
  )).filter(Boolean))];
  const materialBases = new Map(materials.map((material) => [
    material,
    Number.isFinite(material.emissiveIntensity) ? material.emissiveIntensity : 1,
  ]));
  const practical = root.getObjectByName('WR_ANCHOR_fireplace_practical')
    ?.getObjectByProperty?.('isPointLight', true);
  const practicalBase = practical?.intensity;
  const practicalColorBase = practical?.color?.clone?.();
  const disposeSprites = installWarRoomV3StoveFireSprites(flames, { coarsePointer, reducedMotion, shape: spriteShape });
  const driver = flames[0];
  const previous = driver.onBeforeRender;

  const animate = (renderer) => {
    const rendererNow = renderer?.userData?.board3DMotionNowMs;
    const elapsedMs = Number.isFinite(rendererNow)
      ? rendererNow
      : (globalThis.performance?.now?.() ?? Date.now());
    const lightFrame = warRoomV3FireFrame({ elapsedMs, coarsePointer, reducedMotion });
    // When Hans tends this hearth he dims and revives it through stand-ins
    // (WarRoomHansStage); their scale and intensity multiply the flicker.
    const dimmer = root.userData?.warRoomHansFireDimmer;
    const dimWidthValue = Number(dimmer?.core?.scale?.x);
    const dimHeightValue = Number(dimmer?.core?.scale?.y);
    const dimWidth = Number.isFinite(dimWidthValue) ? dimWidthValue : 1;
    const dimHeight = dimmer?.core?.visible === false
      ? 0
      : (Number.isFinite(dimHeightValue) ? dimHeightValue : 1);
    const dimLight = Number.isFinite(dimmer?.light?.intensity) ? dimmer.light.intensity : 1;
    flames.forEach((flame, index) => {
      const base = bases[index];
      const frame = warRoomV3FireFrame({
        elapsedMs: elapsedMs + index * 137,
        coarsePointer,
        reducedMotion,
      });
      flame.scale.set(
        base.scale.x * frame.width * dimWidth,
        base.scale.y * frame.height * dimHeight,
        base.scale.z * frame.depth * dimWidth,
      );
      flame.position.y = base.position.y + frame.lift;
    });
    materials.forEach((material) => {
      material.emissiveIntensity = materialBases.get(material) * lightFrame.intensity * dimLight;
    });
    if (practical && Number.isFinite(practicalBase)) {
      practical.intensity = practicalBase * lightFrame.intensity * dimLight;
      practical.color.setHSL(
        0.065 + (lightFrame.intensity - 1) * 0.018,
        0.94,
        0.57,
      );
    }
  };

  driver.userData.warRoomV3FireDriver = true;
  driver.onBeforeRender = (...args) => {
    previous?.(...args);
    animate(args[0]);
  };
  root.userData.warRoomV3FireAnimation = reducedMotion ? 'static-reduced-motion' : 'authored-flicker-v1';

  return () => {
    disposeSprites();
    driver.onBeforeRender = previous;
    delete driver.userData.warRoomV3FireDriver;
    flames.forEach((flame, index) => {
      flame.position.copy(bases[index].position);
      flame.scale.copy(bases[index].scale);
    });
    materials.forEach((material) => {
      material.emissiveIntensity = materialBases.get(material);
    });
    if (practical && Number.isFinite(practicalBase)) practical.intensity = practicalBase;
    if (practicalColorBase) practical.color.copy(practicalColorBase);
    delete root.userData.warRoomV3FireAnimation;
  };
}
