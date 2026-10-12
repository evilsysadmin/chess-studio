// 2.5D billboards for first-person Chronicles, Might and Magic III style:
// the world stays 3D (walls, forest, light, fog) while creatures and NPCs are
// painted sprites that always face the camera and swap frames for idle,
// menace and hurt. Sheets are SpriteCook-generated pixel art (or procedural
// placeholders from build_chronicles_procedural_sprites.py) packed by
// scripts/art/pack_chronicles_sprites.py (one row, square cells).
import * as THREE from 'three';
import boneHoundSheet from '../assets/chronicles/sprites/bone-hound.webp';
import mournerSheet from '../assets/chronicles/sprites/rookwood-mourner.webp';
import roadBanditSheet from '../assets/chronicles/sprites/road-bandit.webp';
import banditCaptainSheet from '../assets/chronicles/sprites/bandit-captain.webp';
import weaverSpiderSheet from '../assets/chronicles/sprites/weaver-spider.webp';
import sewerRatSheet from '../assets/chronicles/sprites/sewer-rat.webp';
import ashGoblinSheet from '../assets/chronicles/sprites/ash-goblin.webp';
import saltCrabSheet from '../assets/chronicles/sprites/salt-crab.webp';
import drownedSheet from '../assets/chronicles/sprites/drowned.webp';
import mireWitchSheet from '../assets/chronicles/sprites/mire-witch.webp';
import spriteManifest from '../assets/chronicles/sprites/sprites.json';

const SPRITES = Object.freeze({
  'bone-hound': Object.freeze({ url: boneHoundSheet, worldHeight: 2.8, idleFps: 2.2 }),
  'rookwood-mourner': Object.freeze({ url: mournerSheet, worldHeight: 2.6, idleFps: 1.3 }),
  'road-bandit': Object.freeze({ url: roadBanditSheet, worldHeight: 2.55, idleFps: 1.8 }),
  'bandit-captain': Object.freeze({ url: banditCaptainSheet, worldHeight: 3.15, idleFps: 1.4 }),
  'weaver-spider': Object.freeze({ url: weaverSpiderSheet, worldHeight: 2.3, idleFps: 2.6 }),
  // Procedural placeholders until painted SpriteCook art replaces them.
  'sewer-rat': Object.freeze({ url: sewerRatSheet, worldHeight: 1.7, idleFps: 2.6 }),
  'ash-goblin': Object.freeze({ url: ashGoblinSheet, worldHeight: 2.2, idleFps: 2.2 }),
  'salt-crab': Object.freeze({ url: saltCrabSheet, worldHeight: 2.0, idleFps: 1.8 }),
  drowned: Object.freeze({ url: drownedSheet, worldHeight: 2.75, idleFps: 1.2 }),
  'mire-witch': Object.freeze({ url: mireWitchSheet, worldHeight: 3.0, idleFps: 1.4 }),
});

export function chroniclesHasSpriteBillboard(visualType) {
  return Boolean(SPRITES[visualType] && spriteManifest[visualType]?.frames?.length);
}

// Cue priority: dead > hurt > attack > menace > grateful > speak > idle.
export function chroniclesSpriteFrameIndex(frames, {
  time = 0, dead = false, hurt = false, attacking = false, menace = false,
  grateful = false, speaking = false, idleFps = 2,
} = {}) {
  const pick = [
    [dead, 'dead'], [hurt, 'hurt'], [attacking, 'attack'], [menace, 'menace'],
    [grateful, 'grateful'], [speaking, 'speak'],
  ].find(([on, id]) => on && frames.includes(id));
  if (pick) return frames.indexOf(pick[1]);
  const idle = ['idle-a', 'idle-b'].map((id) => frames.indexOf(id)).filter((index) => index >= 0);
  if (!idle.length) return 0;
  return idle[Math.floor(Math.max(0, time) * idleFps) % idle.length];
}

const textureCache = new Map();

function sheetTexture(url, frameCount, pixelArt) {
  if (!textureCache.has(url)) {
    // Headless (tests/SSR) gets an empty texture; browsers load the sheet.
    const texture = typeof document === 'undefined' ? new THREE.Texture() : new THREE.TextureLoader().load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Pixel-art sheets keep their VGA grid up close; minification still
    // mipmaps so distant creatures don't shimmer.
    texture.magFilter = pixelArt ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    textureCache.set(url, texture);
  }
  const texture = textureCache.get(url).clone();
  texture.repeat.set(1 / frameCount, 1);
  texture.needsUpdate = true;
  return texture;
}

// A creature/NPC as a camera-facing sprite standing on its cell. The group
// keeps the enemy runtime contract (position, scale, visibility) and exposes
// `updateChroniclesSprite(time, cues)` for frame selection.
export function buildChroniclesSpriteBillboard(visualType, { tint = 0xffffff } = {}) {
  const spec = SPRITES[visualType];
  const frames = spriteManifest[visualType]?.frames || [];
  if (!spec || !frames.length) return null;

  const texture = sheetTexture(spec.url, frames.length, Boolean(spriteManifest[visualType]?.pixelArt));
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: tint,
    transparent: true,
    alphaTest: 0.08,
    depthWrite: false,
    fog: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0.03);
  sprite.scale.set(spec.worldHeight, spec.worldHeight, 1);
  sprite.name = `chronicles-sprite-${visualType}`;
  sprite.renderOrder = 2;

  const group = new THREE.Group();
  group.name = `chronicles-billboard-${visualType}`;
  group.add(sprite);
  let currentFrame = -1;
  const showFrame = (index) => {
    if (index === currentFrame) return;
    currentFrame = index;
    texture.offset.set(index / frames.length, 0);
  };
  showFrame(0);
  group.userData.chroniclesBillboard = { visualType, frames, sprite };
  group.userData.updateChroniclesSprite = (time, cues = {}) => {
    showFrame(chroniclesSpriteFrameIndex(frames, { ...cues, time, idleFps: spec.idleFps }));
  };
  group.userData.setChroniclesSpriteOpacity = (opacity) => {
    material.opacity = Math.max(0, Math.min(1, opacity));
  };
  group.userData.chroniclesDispose = () => {
    texture.dispose();
    material.dispose();
  };
  return group;
}
