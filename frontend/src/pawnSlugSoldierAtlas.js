import * as THREE from 'three';
import { PAWN_SLUG_ENEMY_ACTIONS } from './pawnSlugEnemyActionMotion.js';

const FRAME = 96;
const COLUMNS = 16;
const TYPES = Object.freeze(['pawn', 'knight', 'rook']);
const ACTIONS = Object.freeze(['idle', 'run', 'jump', 'crouch', 'hurt', 'climb']);
const ROWS = TYPES.length * ACTIONS.length;
let cachedCanvas = null;
let cachedContext = null;
const drawnFrames = new Set();

const COLORS = Object.freeze({
  ink: '#13171a',
  cloth: '#566052',
  clothDark: '#353d35',
  steel: '#7f898f',
  steelDark: '#414b50',
  brass: '#c6a354',
  leather: '#49392d',
  skin: '#c79f79',
  enemy: '#8d332d',
  shade: 'rgba(0,0,0,0.28)',
});

function rowFor(type, action) {
  const typeIndex = Math.max(0, TYPES.indexOf(type));
  const actionIndex = Math.max(0, ACTIONS.indexOf(action));
  return typeIndex * ACTIONS.length + actionIndex;
}

function roundedRect(ctx, x, y, w, h, r, fill) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, rr);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
}

function limb(ctx, x, y, length, width, angle, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  roundedRect(ctx, -width / 2, 0, width, length, width / 2, fill);
  ctx.restore();
}

function pawnHelmet(ctx) {
  ctx.fillStyle = COLORS.steel;
  ctx.beginPath();
  ctx.arc(0, -27, 10, Math.PI, 0);
  ctx.lineTo(10, -21);
  ctx.lineTo(-10, -21);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.brass;
  ctx.beginPath();
  ctx.arc(0, -31, 4.2, 0, Math.PI * 2);
  ctx.fill();
}

function knightHelmet(ctx) {
  ctx.fillStyle = COLORS.steel;
  ctx.beginPath();
  ctx.moveTo(-10, -20);
  ctx.lineTo(-8, -31);
  ctx.lineTo(1, -38);
  ctx.lineTo(12, -31);
  ctx.lineTo(8, -20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.steelDark;
  ctx.beginPath();
  ctx.moveTo(1, -35);
  ctx.lineTo(13, -39);
  ctx.lineTo(8, -31);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.brass;
  ctx.fillRect(-2, -39, 4, 8);
}

function rookHelmet(ctx) {
  ctx.fillStyle = COLORS.steel;
  ctx.fillRect(-11, -31, 22, 12);
  for (const x of [-9, -3, 3]) ctx.fillRect(x, -36, 5, 7);
  ctx.fillStyle = COLORS.brass;
  ctx.fillRect(-7, -24, 14, 2.5);
}

function drawRifle(ctx, heavy = false) {
  ctx.save();
  ctx.rotate(-0.13);
  roundedRect(ctx, 1, -4, heavy ? 30 : 25, heavy ? 6 : 4.5, 2, COLORS.ink);
  ctx.fillStyle = COLORS.leather;
  ctx.fillRect(-5, -3, 9, heavy ? 7 : 5);
  ctx.fillStyle = COLORS.brass;
  ctx.fillRect(heavy ? 24 : 20, -3, 5, 2);
  if (heavy) {
    ctx.fillStyle = COLORS.steelDark;
    ctx.fillRect(8, 2, 10, 5);
  }
  ctx.restore();
}

function poseFor(action, phase, type) {
  const wave = Math.sin(phase * Math.PI * 2);
  const cos = Math.cos(phase * Math.PI * 2);
  const heavy = type === 'rook' ? 0.62 : 1;
  if (action === 'run') return { bob: Math.abs(wave) * 2.3 * heavy, lean: -wave * 0.07, legA: 0.62 * wave, legB: -0.62 * wave, armA: -0.5 * wave, armB: 0.5 * wave };
  if (action === 'jump') return { bob: -2 - Math.sin(phase * Math.PI) * 3, lean: phase < 0.5 ? -0.09 : 0.07, legA: -0.28, legB: 0.4, armA: -0.22, armB: 0.28 };
  if (action === 'crouch') return { bob: 9, lean: 0.02, legA: 0.82, legB: -0.72, armA: -0.15, armB: 0.18, crouch: true };
  if (action === 'hurt') return { bob: Math.sin(phase * Math.PI) * -1.5, lean: 0.22 * (1 - phase), legA: -0.18, legB: 0.24, armA: 0.7, armB: -0.55, hurt: true };
  if (action === 'climb') return { bob: Math.abs(wave) * 2, lean: 0, legA: 0.4 * wave, legB: -0.4 * wave, armA: -0.65 * wave, armB: 0.65 * wave, climb: true };
  return { bob: Math.max(0, wave) * 0.7, lean: cos * 0.008, legA: 0.04 * wave, legB: -0.04 * wave, armA: -0.03 * wave, armB: 0.03 * wave };
}

function drawSoldier(ctx, type, action, frameIndex, frameCount) {
  const phase = frameCount > 1 ? frameIndex / frameCount : 0;
  const pose = poseFor(action, phase, type);
  ctx.save();
  ctx.translate(FRAME / 2, 76 + pose.bob);
  ctx.rotate(pose.lean);

  ctx.fillStyle = COLORS.shade;
  ctx.beginPath();
  ctx.ellipse(0, 7, type === 'rook' ? 18 : 15, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyW = type === 'rook' ? 27 : type === 'knight' ? 22 : 20;
  const bodyH = pose.crouch ? 24 : type === 'rook' ? 31 : 29;
  const bodyY = -bodyH - 3;

  limb(ctx, -7, -6, pose.crouch ? 14 : 20, 7, pose.legA, COLORS.clothDark);
  limb(ctx, 7, -6, pose.crouch ? 14 : 20, 7, pose.legB, COLORS.clothDark);
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(-14, 4, 13, 4);
  ctx.fillRect(2, 4, 13, 4);

  roundedRect(ctx, -bodyW / 2, bodyY, bodyW, bodyH, 6, pose.hurt ? '#65504b' : COLORS.cloth);
  roundedRect(ctx, -bodyW / 2 + 3, bodyY + 4, bodyW - 6, 7, 3, COLORS.clothDark);
  ctx.fillStyle = COLORS.enemy;
  ctx.fillRect(-bodyW / 2 - 1, bodyY + 10, bodyW + 2, 4);
  ctx.fillStyle = COLORS.brass;
  ctx.fillRect(-3, bodyY + 3, 6, 6);

  if (pose.climb) {
    limb(ctx, -10, bodyY + 8, 22, 6, pose.armA, COLORS.cloth);
    limb(ctx, 10, bodyY + 8, 22, 6, pose.armB, COLORS.cloth);
    ctx.fillStyle = COLORS.leather;
    ctx.fillRect(-16, bodyY - 2, 32, 3);
    ctx.fillRect(-16, bodyY + 17, 32, 3);
  } else {
    limb(ctx, -10, bodyY + 8, 20, 6, pose.armA + 0.2, COLORS.cloth);
    limb(ctx, 10, bodyY + 8, 20, 6, pose.armB - 0.55, COLORS.cloth);
    ctx.save();
    ctx.translate(7, bodyY + 17);
    drawRifle(ctx, type === 'rook');
    ctx.restore();
  }

  ctx.fillStyle = COLORS.skin;
  ctx.beginPath();
  ctx.arc(0, bodyY - 7, 7.8, 0, Math.PI * 2);
  ctx.fill();
  if (type === 'knight') knightHelmet(ctx);
  else if (type === 'rook') rookHelmet(ctx);
  else pawnHelmet(ctx);

  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(3, bodyY - 8, 2, 2);
  ctx.restore();
}

function buildCanvas() {
  if (cachedCanvas) return cachedCanvas;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = COLUMNS * FRAME;
  canvas.height = ROWS * FRAME;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  cachedCanvas = canvas;
  cachedContext = ctx;
  return cachedCanvas;
}

function ensureFrameDrawn(type, action, frame) {
  const canvas = buildCanvas();
  if (!canvas || !cachedContext) return;
  const key = `${type}:${action}:${frame}`;
  if (drawnFrames.has(key)) return;
  const row = rowFor(type, action);
  const frameCount = PAWN_SLUG_ENEMY_ACTIONS[action].frames;
  cachedContext.save();
  cachedContext.translate(frame * FRAME, row * FRAME);
  drawSoldier(cachedContext, type, action, frame, frameCount);
  cachedContext.restore();
  drawnFrames.add(key);
}

export function createPawnSlugSoldierAtlasTexture() {
  const canvas = buildCanvas();
  if (!canvas) return null;
  ensureFrameDrawn('pawn', 'idle', 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.userData.pawnSlugSoldierAtlas = true;
  texture.userData.lazyFrameDrawing = true;
  return texture;
}

export function pawnSlugSoldierAtlasWindow(type = 'pawn', action = 'idle', frameIndex = 0, dir = 1) {
  const safeType = TYPES.includes(type) ? type : 'pawn';
  const safeAction = ACTIONS.includes(action) ? action : 'idle';
  const count = PAWN_SLUG_ENEMY_ACTIONS[safeAction].frames;
  const frame = ((Math.floor(frameIndex) % count) + count) % count;
  const row = rowFor(safeType, safeAction);
  ensureFrameDrawn(safeType, safeAction, frame);
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
  theme: 'military-chess-soldiers',
  generatedOnce: true,
  lazyFrameDrawing: true,
});
