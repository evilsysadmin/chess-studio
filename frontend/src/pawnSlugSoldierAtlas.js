import * as THREE from 'three';
import { PAWN_SLUG_ENEMY_ACTIONS } from './pawnSlugEnemyActionMotion.js';
import { R2_ASSET_BASE_URL, r2AssetUrl } from './r2Assets.js';

const FRAME = 96;
const COLUMNS = 16;
const TYPES = Object.freeze(['pawn', 'knight', 'rook']);
const ACTIONS = Object.freeze(['idle', 'run', 'jump', 'crouch', 'hurt', 'climb', 'death']);
const ROWS = TYPES.length * ACTIONS.length;
const R2_ASSET_ORIGIN = `${String(R2_ASSET_BASE_URL || '').replace(/\/+$/, '')}/`;
let cachedBaseTexture = null;
let pawnSlugSoldierAtlasStatus = null;
const liveClones = new Set();

export const PAWN_SLUG_SOLDIER_ATLAS_LOGICAL_ID = 'pawnSlug.enemy.actionAtlas';
export const PAWN_SLUG_SOLDIER_ATLAS_URL = r2AssetUrl(PAWN_SLUG_SOLDIER_ATLAS_LOGICAL_ID);

function pawnSlugSoldierAtlasTransport() {
  return R2_ASSET_ORIGIN && PAWN_SLUG_SOLDIER_ATLAS_URL.startsWith(R2_ASSET_ORIGIN)
    ? 'r2'
    : 'missing';
}

function publishPawnSlugSoldierAtlasStatus(status) {
  pawnSlugSoldierAtlasStatus = `${pawnSlugSoldierAtlasTransport()}-${status}`;
  if (typeof document === 'undefined') return pawnSlugSoldierAtlasStatus;
  const stage = document.querySelector?.('[data-pawn-slug-renderer="three"]');
  if (stage?.dataset) stage.dataset.pawnSlugActionAtlas = pawnSlugSoldierAtlasStatus;
  return pawnSlugSoldierAtlasStatus;
}

export function pawnSlugSoldierAtlasBrowserStatus() {
  if (typeof document !== 'undefined') {
    const stage = document.querySelector?.('[data-pawn-slug-renderer="three"]');
    if (stage?.dataset && pawnSlugSoldierAtlasStatus) {
      stage.dataset.pawnSlugActionAtlas = pawnSlugSoldierAtlasStatus;
    }
  }
  return pawnSlugSoldierAtlasStatus;
}

function rowFor(type, action) {
  const typeIndex = Math.max(0, TYPES.indexOf(type));
  const actionIndex = Math.max(0, ACTIONS.indexOf(action));
  return typeIndex * ACTIONS.length + actionIndex;
}

function configureTexture(texture, { sharedSource = false } = {}) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.userData = {
    ...texture.userData,
    pawnSlugSoldierAtlas: true,
    pawnSlugEnemyBlenderAtlas: true,
    sourceVersion: 'blender-enemy-v1',
    sharedSource,
  };
  return texture;
}

function baseAtlasTexture() {
  if (cachedBaseTexture) return cachedBaseTexture;
  if (!PAWN_SLUG_SOLDIER_ATLAS_URL) {
    publishPawnSlugSoldierAtlasStatus('failed');
    return null;
  }
  const loader = new THREE.TextureLoader();
  publishPawnSlugSoldierAtlasStatus('loading');
  cachedBaseTexture = configureTexture(loader.load(
    PAWN_SLUG_SOLDIER_ATLAS_URL,
    () => {
      publishPawnSlugSoldierAtlasStatus('ready');
      for (const clone of liveClones) clone.needsUpdate = true;
    },
    undefined,
    () => {
      publishPawnSlugSoldierAtlasStatus('failed');
      for (const clone of liveClones) clone.userData.loadFailed = true;
    },
  ), { sharedSource: true });
  return cachedBaseTexture;
}

export function createPawnSlugSoldierAtlasTexture() {
  const base = baseAtlasTexture();
  if (!base) return null;
  const texture = configureTexture(base.clone());
  texture.userData.pawnSlugSoldierAtlasClone = true;
  liveClones.add(texture);
  return texture;
}

export function pawnSlugSoldierAtlasWindow(type = 'pawn', action = 'idle', frameIndex = 0, dir = 1) {
  const safeType = TYPES.includes(type) ? type : 'pawn';
  const safeAction = ACTIONS.includes(action) ? action : 'idle';
  const count = PAWN_SLUG_ENEMY_ACTIONS[safeAction].frames;
  const frame = ((Math.floor(frameIndex) % count) + count) % count;
  const row = rowFor(safeType, safeAction);
  const direction = dir < 0 ? -1 : 1;
  const mirrored = direction > 0;
  return Object.freeze({
    type: safeType,
    action: safeAction,
    frame,
    row,
    direction,
    mirrored,
    repeatX: (mirrored ? -1 : 1) / COLUMNS,
    repeatY: 1 / ROWS,
    offsetX: (mirrored ? frame + 1 : frame) / COLUMNS,
    offsetY: 1 - ((row + 1) / ROWS),
  });
}

export const PAWN_SLUG_SOLDIER_ATLAS_META = Object.freeze({
  frameWidth: FRAME,
  frameHeight: FRAME,
  columns: COLUMNS,
  rows: ROWS,
  types: TYPES,
  actions: ACTIONS,
  theme: 'military-chess-soldiers-blender',
  sourceVersion: 'blender-enemy-v1',
  authoredBy: 'Blender',
  sourceFacing: 'left',
  runtimeComposite: true,
  generatedOnce: false,
  lazyFrameDrawing: false,
  prewarmedBeforeUpload: true,
  sharedTextureSource: true,
  mipmaps: false,
  logicalId: PAWN_SLUG_SOLDIER_ATLAS_LOGICAL_ID,
  transport: 'r2-cdn-required',
  browserRenderContract: 'data-pawn-slug-action-atlas',
  browserR2Contract: 'r2-ready',
});
