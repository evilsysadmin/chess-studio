import { installWarRoomV3StoveFireSprites } from './WarRoomFireSprites.js';

// Hot path: share the same arithmetic with the public immutable frame API,
// without allocating/freeze-churning five frame objects on every render tick.
function sampleWarRoomV3FireFrameInto(target, elapsedMs, coarsePointer, reducedMotion) {
  if (reducedMotion) {
    target.width = 1;
    target.height = 1;
    target.depth = 1;
    target.lift = 0;
    target.intensity = 1;
    return target;
  }
  const power = coarsePointer ? 0.62 : 1;
  const slow = Math.sin(elapsedMs * 0.0043);
  const flutter = Math.sin(elapsedMs * 0.0107 + 0.9);
  const lick = Math.sin(elapsedMs * 0.0231 + Math.sin(elapsedMs * 0.0019) * 1.7);
  target.width = 1 + (flutter * 0.045 - lick * 0.022) * power;
  target.height = 1 + (slow * 0.075 + lick * 0.055) * power;
  target.depth = 1 - flutter * 0.026 * power;
  target.lift = (slow * 0.013 + lick * 0.009) * power;
  target.intensity = 1 + (slow * 0.065 + flutter * 0.055 + lick * 0.035) * power;
  return target;
}

export function warRoomV3FireFrame({
  elapsedMs = 0,
  coarsePointer = false,
  reducedMotion = false,
} = {}) {
  // Preserve the stable, immutable external contract used by tests/tools.
  return Object.freeze(sampleWarRoomV3FireFrameInto(
    {}, elapsedMs, coarsePointer, reducedMotion,
  ));
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
  const fireSprites = root.getObjectByName?.('war-room-v3-stove-fire-sprites') || null;
  const spriteUniforms = fireSprites?.material?.uniforms || null;
  // Particle-driven hearths hide every authored flame except the render
  // callback driver. Avoid transforming the three hidden GLB objects on every
  // frame; reduced-motion / missing-sprite fallback still animates all meshes.
  const animatedFlameCount = fireSprites && spriteUniforms ? 1 : flames.length;
  const spriteBaseHeight = Number(spriteUniforms?.uHeight?.value);
  const spriteBaseSize = Number(spriteUniforms?.uSize?.value);
  const spriteBaseOpacity = Number(spriteUniforms?.uOpacity?.value);
  const driver = flames[0];
  const previous = driver.onBeforeRender;
  // One pair of reusable workspaces per mounted hearth. Never shared across
  // rooms, sessions or animations; avoids per-frame garbage collection.
  const lightFrame = {};
  const flameFrame = {};

  const animate = (renderer) => {
    const rendererNow = renderer?.userData?.board3DMotionNowMs;
    const elapsedMs = Number.isFinite(rendererNow)
      ? rendererNow
      : (globalThis.performance?.now?.() ?? Date.now());
    sampleWarRoomV3FireFrameInto(lightFrame, elapsedMs, coarsePointer, reducedMotion);
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
    // The visible V3/V4 flame is a shader-particle sibling of the authored
    // flame meshes, not their child. It therefore must consume Hans' dimmer
    // explicitly; scaling the transparent authored meshes alone leaves an
    // apparently healthy fire burning while Matthias calls Hans to relight it.
    if (fireSprites && spriteUniforms) {
      const spriteLife = Math.max(0, Math.min(1, dimHeight));
      fireSprites.visible = spriteLife > 0.001;
      if (Number.isFinite(spriteBaseHeight)) spriteUniforms.uHeight.value = spriteBaseHeight * spriteLife;
      if (Number.isFinite(spriteBaseSize)) spriteUniforms.uSize.value = spriteBaseSize * Math.max(0.25, dimWidth);
      if (Number.isFinite(spriteBaseOpacity)) spriteUniforms.uOpacity.value = spriteBaseOpacity * spriteLife;
    }
    for (let index = 0; index < animatedFlameCount; index += 1) {
      const flame = flames[index];
      const base = bases[index];
      // Flame zero uses the lighting sample. Extra phase samples only run
      // when no sprite fire is installed and authored flames are rendered.
      const frame = index === 0
        ? lightFrame
        : sampleWarRoomV3FireFrameInto(
          flameFrame, elapsedMs + index * 137, coarsePointer, reducedMotion,
        );
      flame.scale.set(
        base.scale.x * frame.width * dimWidth,
        base.scale.y * frame.height * dimHeight,
        base.scale.z * frame.depth * dimWidth,
      );
      flame.position.y = base.position.y + frame.lift;
    }
    for (const material of materials) {
      material.emissiveIntensity = materialBases.get(material) * lightFrame.intensity * dimLight;
    }
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
  root.userData.warRoomV3FireAnimation = reducedMotion ? 'static-reduced-motion' : 'authored-flicker-v2-hans-dimmer';

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
