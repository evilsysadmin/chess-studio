from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'missing patch anchor: {label}')
    return text.replace(old, new, 1)


board = Path('frontend/src/components/Board3D.jsx')
text = board.read_text(encoding='utf-8')
import_anchor = "import { adaptiveRenderScale, clamp01, deriveMoveKinetics, easeOutCubic, inferCapturedPiece, reactiveLightProfile, smoothstep } from './WarRoom3DMotion.js';\n"
import_line = "import { warRoomAmbientFramePlan } from './WarRoom3DAnimation.js';\n"
if import_line not in text:
    text = replace_once(text, import_anchor, import_anchor + import_line, 'Board3D import')

old = """    let lastAmbientPaint = 0;
    function ambientFrame(now) {
      const motion = cameraMotionRef.current;
      const reduced = getEffectiveReducedMotion();
      if (!document.hidden && !reduced && !coarsePointer && inspectModeRef.current && now - lastAmbientPaint >= 16) {
        lastAmbientPaint = now;
        const basePosition = camera.userData.basePosition;
        const baseTarget = camera.userData.baseTarget;
        if (basePosition && baseTarget) {
          const offset = basePosition.clone().sub(baseTarget).applyEuler(new THREE.Euler(motion.pitch, motion.yaw, 0, 'YXZ'));
          camera.position.copy(baseTarget).add(offset);
          camera.lookAt(baseTarget);
          render();
        }
      }
      ambientFrameRef.current = window.requestAnimationFrame(ambientFrame);
    }
    if (!coarsePointer) ambientFrameRef.current = window.requestAnimationFrame(ambientFrame);
"""
new = """    let lastAmbientPaint = 0;
    function ambientFrame(now) {
      const motion = cameraMotionRef.current;
      const plan = warRoomAmbientFramePlan({
        documentHidden: document.hidden,
        reducedMotion: getEffectiveReducedMotion(),
        coarsePointer,
        inspectMode: inspectModeRef.current,
        elapsedMs: now - lastAmbientPaint,
      });
      if (plan.shouldRender) {
        lastAmbientPaint = now;
        if (plan.updateCamera) {
          const basePosition = camera.userData.basePosition;
          const baseTarget = camera.userData.baseTarget;
          if (basePosition && baseTarget) {
            const offset = basePosition.clone().sub(baseTarget).applyEuler(new THREE.Euler(motion.pitch, motion.yaw, 0, 'YXZ'));
            camera.position.copy(baseTarget).add(offset);
            camera.lookAt(baseTarget);
          }
        }
        // The castle fire updates from onBeforeRender, so desktop needs a
        // quiet scene heartbeat even when the player does not move the mouse.
        render();
      }
      ambientFrameRef.current = window.requestAnimationFrame(ambientFrame);
    }
    if (!coarsePointer) ambientFrameRef.current = window.requestAnimationFrame(ambientFrame);
"""
text = replace_once(text, old, new, 'Board3D ambient loop')
board.write_text(text, encoding='utf-8')

castle = Path('frontend/src/components/WarRoomCastleArchitecture.js')
text = castle.read_text(encoding='utf-8')
anchor = 'function addSideWalls(group, wallZ, towardBoard, coarsePointer) {\n'
texture_fn = """function createCastleWallTexture(coarsePointer = false) {
  if (coarsePointer) return null;
  const width = 48;
  const height = 96;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const broad = Math.sin(x * 0.31 + y * 0.095) * 8 + Math.cos(y * 0.17) * 7;
      const grain = Math.sin((x + y) * 0.63) * 3 + Math.cos(x * 1.17 - y * 0.21) * 2;
      const fleck = ((x * 17 + y * 29 + x * y * 3) % 19) - 9;
      const value = THREE.MathUtils.clamp(Math.round(214 + broad + grain + fleck * 0.42), 174, 239);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'war-room-warm-limestone-texture';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.15, 3.4);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  texture.userData.warRoomWallTexture = 'warm-limestone-plaster-v1';
  return texture;
}

"""
if 'function createCastleWallTexture(' not in text:
    text = replace_once(text, anchor, texture_fn + anchor, 'castle wall texture hook')

old_materials = """  const wallMaterial = material(CASTLE.stoneDark, { roughness: 0.9, clearcoat: 0.035, specularIntensity: 0.16 });
  const trimMaterial = material(CASTLE.stoneLight, { roughness: 0.72, clearcoat: 0.12, specularIntensity: 0.3 });
  const recessMaterial = material(CASTLE.recess, { roughness: 0.96, clearcoat: 0, specularIntensity: 0.04 });
"""
new_materials = """  const wallTexture = createCastleWallTexture(coarsePointer);
  const wallMaterial = coarsePointer
    ? material(CASTLE.stoneDark, { roughness: 0.9, clearcoat: 0.035, specularIntensity: 0.16 })
    : new THREE.MeshPhysicalMaterial({
        color: 0xa9977b,
        map: wallTexture,
        roughness: 0.74,
        roughnessMap: wallTexture,
        bumpMap: wallTexture,
        bumpScale: 0.014,
        metalness: 0,
        clearcoat: 0.075,
        clearcoatRoughness: 0.62,
        specularIntensity: 0.24,
        envMapIntensity: 0.34,
      });
  wallMaterial.userData.warRoomWallFinish = coarsePointer ? 'simplified-castle-stone' : 'warm-limestone-plaster-v1';
  const trimMaterial = material(coarsePointer ? CASTLE.stoneLight : 0xb7a78e, {
    roughness: coarsePointer ? 0.72 : 0.62,
    clearcoat: coarsePointer ? 0.12 : 0.14,
    specularIntensity: coarsePointer ? 0.3 : 0.34,
  });
  const recessMaterial = material(coarsePointer ? CASTLE.recess : 0x5f5448, { roughness: 0.9, clearcoat: 0.015, specularIntensity: 0.1 });
  const panelMaterial = coarsePointer ? null : material(0x8f806b, {
    roughness: 0.68,
    clearcoat: 0.06,
    clearcoatRoughness: 0.68,
    specularIntensity: 0.2,
  });
"""
text = replace_once(text, old_materials, new_materials, 'castle wall materials')

old_slits = """    if (!coarsePointer) {
      for (const offset of [2.08, 6.18, 10.18]) {
        if (offset >= depth - 0.4) continue;
        const slit = addBox(walls, [0.035, 1.38, 0.34], recessMaterial, [side * 7.755, 3.25, wallZ + towardBoard * offset]);
        slit.castShadow = false;
      }
    }
"""
new_panels = """    if (!coarsePointer) {
      for (const [index, offset] of [2.15, 6.25, 10.35].entries()) {
        if (offset >= depth - 0.55) continue;
        const panelZ = wallZ + towardBoard * offset;
        const panel = addBox(
          walls,
          [0.055, 2.48, 1.42],
          panelMaterial,
          [side * 7.755, 2.62, panelZ],
          `war-room-castle-wall-panel-${side < 0 ? 'left' : 'right'}-${index + 1}`,
        );
        panel.castShadow = false;
        panel.userData.warRoomWallPanel = 'limestone-inset';
        addBox(walls, [0.075, 0.11, 1.62], trimMaterial, [side * 7.72, 3.91, panelZ]);
        addBox(walls, [0.075, 0.11, 1.62], trimMaterial, [side * 7.72, 1.33, panelZ]);
        addBox(walls, [0.075, 2.68, 0.1], trimMaterial, [side * 7.72, 2.62, panelZ - 0.76]);
        addBox(walls, [0.075, 2.68, 0.1], trimMaterial, [side * 7.72, 2.62, panelZ + 0.76]);
      }
    }
"""
text = replace_once(text, old_slits, new_panels, 'castle prison slits')
castle.write_text(text, encoding='utf-8')

print('War Room hotfix source patches applied')
