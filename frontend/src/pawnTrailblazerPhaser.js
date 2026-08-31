import Phaser from 'phaser';
import { TRAIL_SPRITES } from './pawnTrailblazerSprites.js';
import { TRAIL_LANES, trailSpriteMotion } from './pawnTrailblazer.js';

const MAX_DEPTH = 34;
const BISHOP_AIM_MS = 700;

const ENEMY_TEXTURES = Object.freeze({
  pawn: 'enemyPawn',
  knight: 'enemyKnight',
  bishop: 'enemyBishop',
  rook: 'enemyRook',
});

const POWER_TEXTURES = Object.freeze({
  rook: 'powerRook',
  bishop: 'powerBishop',
  queen: 'powerQueen',
});

export function trailProject(lane, z, width, height) {
  const depth = Math.max(0, Math.min(1, z / MAX_DEPTH));
  const near = 1 - depth;
  const horizon = height * 0.17;
  const floor = height * 0.9;
  const y = horizon + (floor - horizon) * Math.pow(near, 1.35);
  const halfWidth = width * (0.075 + 0.43 * Math.pow(near, 1.05));
  const laneWidth = (halfWidth * 2) / TRAIL_LANES;
  const x = width / 2 - halfWidth + laneWidth * (lane + 0.5);
  const scale = 0.18 + Math.pow(near, 1.3) * 0.95;
  return { x, y, laneWidth, scale, halfWidth };
}

function drawTrack(graphics, width, height, distance, reducedMotion) {
  graphics.clear();
  graphics.fillStyle(0x07090d, 1);
  graphics.fillRect(0, 0, width, height);

  graphics.fillStyle(0x171b27, 1);
  graphics.fillRect(0, 0, width, height * 0.5);
  graphics.fillStyle(0x0c1018, 0.95);
  graphics.fillRect(0, height * 0.12, width, height * 0.17);

  const safeDistance = reducedMotion ? 0 : Math.max(0, Number(distance) || 0);
  const scroll = safeDistance % 1;
  const checkerPhase = Math.floor(safeDistance);

  for (let row = Math.ceil(MAX_DEPTH) + 1; row >= 0; row -= 1) {
    const farZ = Math.max(0, row + 1 - scroll);
    const nearZ = Math.max(0, row - scroll);
    const far = trailProject(0, farZ, width, height);
    const near = trailProject(0, nearZ, width, height);

    for (let lane = 0; lane < TRAIL_LANES; lane += 1) {
      const f = trailProject(lane, farZ, width, height);
      const n = trailProject(lane, nearZ, width, height);
      graphics.fillStyle((row + lane + checkerPhase) % 2 ? 0x5a4636 : 0xd9d0bb, 0.86);
      graphics.lineStyle(Math.max(0.6, 1.3 * n.scale), 0x0a0a0a, 0.28);
      graphics.beginPath();
      graphics.moveTo(f.x - f.laneWidth / 2, f.y);
      graphics.lineTo(f.x + f.laneWidth / 2, f.y);
      graphics.lineTo(n.x + n.laneWidth / 2, n.y);
      graphics.lineTo(n.x - n.laneWidth / 2, n.y);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
    }

    if (far.halfWidth < 1 || near.halfWidth < 1) break;
  }

  const leftFar = trailProject(0, MAX_DEPTH, width, height);
  const leftNear = trailProject(0, 0, width, height);
  const rightFar = trailProject(TRAIL_LANES - 1, MAX_DEPTH, width, height);
  const rightNear = trailProject(TRAIL_LANES - 1, 0, width, height);
  graphics.lineStyle(2, 0xc9a227, 0.38);
  graphics.beginPath();
  graphics.moveTo(leftFar.x - leftFar.laneWidth / 2, leftFar.y);
  graphics.lineTo(leftNear.x - leftNear.laneWidth / 2, leftNear.y);
  graphics.moveTo(rightFar.x + rightFar.laneWidth / 2, rightFar.y);
  graphics.lineTo(rightNear.x + rightNear.laneWidth / 2, rightNear.y);
  graphics.strokePath();
}

function drawDashedLine(graphics, from, to, dashLength, gapLength) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length) return;
  const ux = dx / length;
  const uy = dy / length;
  for (let cursor = 0; cursor < length; cursor += dashLength + gapLength) {
    const end = Math.min(length, cursor + dashLength);
    graphics.beginPath();
    graphics.moveTo(from.x + ux * cursor, from.y + uy * cursor);
    graphics.lineTo(from.x + ux * end, from.y + uy * end);
    graphics.strokePath();
  }
}

class PawnTrailblazerScene extends Phaser.Scene {
  constructor(onReady) {
    super({ key: 'PawnTrailblazerScene' });
    this.onReadyCallback = onReady;
    this.snapshot = null;
    this.snapshotNow = 0;
    this.reducedMotion = false;
    this.nodes = new Map();
    this.previousLives = null;
    this.wasSlashing = false;
    this.ready = false;
  }

  preload() {
    for (const [key, src] of Object.entries(TRAIL_SPRITES)) this.load.image(key, src);
  }

  create() {
    this.trackGraphics = this.add.graphics().setDepth(0);
    this.aimGraphics = this.add.graphics().setDepth(1400);
    this.fxGraphics = this.add.graphics().setDepth(2100);
    this.shadowGraphics = this.add.graphics().setDepth(1900);
    this.matthias = this.add.image(0, 0, 'matthiasRun').setOrigin(0.5).setDepth(2000);
    this.powerBadge = this.add.image(0, 0, 'powerQueen').setOrigin(0.5).setDepth(2050).setVisible(false);
    this.ready = true;
    this.onReadyCallback?.(this.game.renderer.type === Phaser.WEBGL ? 'WEBGL' : 'CANVAS');
    if (this.snapshot) this.renderSnapshot();
  }

  sync(snapshot, now, reducedMotion = false) {
    this.snapshot = snapshot;
    this.snapshotNow = now;
    this.reducedMotion = reducedMotion;
    if (this.ready) this.renderSnapshot();
  }

  ensureNode(item, textureKey) {
    const existing = this.nodes.get(item.id);
    if (existing) {
      if (existing.kind === 'image' && existing.object.texture.key !== textureKey) existing.object.setTexture(textureKey);
      return existing;
    }

    const node = item.kind === 'obstacle'
      ? { kind: 'rect', object: this.add.rectangle(0, 0, 28, 28, 0x7c2f2a, 1).setStrokeStyle(2, 0xdb8e75, 0.95) }
      : { kind: 'image', object: this.add.image(0, 0, textureKey).setOrigin(0.5) };
    this.nodes.set(item.id, node);
    return node;
  }

  removeMissingNodes(objects) {
    const live = new Set(objects.map((item) => item.id));
    for (const [id, node] of this.nodes.entries()) {
      if (live.has(id)) continue;
      node.object.destroy();
      this.nodes.delete(id);
    }
  }

  renderObject(item, width, height, now, game) {
    const p = trailProject(item.lane, item.z, width, height);
    const size = Math.max(16, 58 * p.scale);
    const duelActive = game.phase === 'duel' && game.duel?.enemyId === item.id;
    let textureKey = '';
    if (item.kind === 'enemy') {
      textureKey = duelActive && item.enemyType === 'pawn'
        ? 'enemyDuelist'
        : (ENEMY_TEXTURES[item.enemyType] || ENEMY_TEXTURES.pawn);
    } else if (item.kind === 'power') {
      textureKey = POWER_TEXTURES[item.power] || POWER_TEXTURES.queen;
    }

    const node = this.ensureNode(item, textureKey);
    const depth = 400 + Math.round((MAX_DEPTH - item.z) * 28);
    node.object.setDepth(depth);

    if (node.kind === 'rect') {
      node.object.setPosition(p.x, p.y - size * 0.42);
      node.object.setSize(size * 0.64, size * 0.56);
      node.object.setDisplaySize(size * 0.64, size * 0.56);
      node.object.setRotation(0);
      node.object.setAlpha(0.82 + p.scale * 0.16);
      return;
    }

    const motionKind = item.kind === 'power'
      ? 'power'
      : duelActive && item.enemyType === 'pawn' ? 'duelist' : item.enemyType;
    const motionState = this.reducedMotion
      ? 'reduced'
      : item.enemyType === 'bishop' && item.aimed && !item.fired ? 'aiming' : 'running';
    const motion = trailSpriteMotion(motionKind, now, item.id, motionState);
    const targetSize = item.kind === 'power' ? size * 0.92 : size;
    const baseScale = targetSize / Math.max(1, node.object.width);
    node.object.setPosition(
      p.x + motion.x * targetSize,
      p.y - size * 0.48 + motion.y * targetSize,
    );
    node.object.setRotation(motion.rotation || 0);
    node.object.setScale(baseScale * (motion.scaleX || 1), baseScale * (motion.scaleY || 1));
    node.object.setAlpha(Phaser.Math.Clamp(0.45 + p.scale * 0.62, 0.45, 1));
  }

  renderBishopAims(objects, width, height, now) {
    this.aimGraphics.clear();
    for (const item of objects) {
      if (item.enemyType !== 'bishop' || !item.aimed || item.fired || item.aimLane == null || now >= item.aimUntil) continue;
      const from = trailProject(item.lane, item.z, width, height);
      const to = trailProject(item.aimLane, 0.25, width, height);
      const remaining = Phaser.Math.Clamp((item.aimUntil - now) / BISHOP_AIM_MS, 0, 1);
      this.aimGraphics.lineStyle(Math.max(2, 5 * from.scale), 0xff5b4f, 0.35 + (1 - remaining) * 0.55);
      drawDashedLine(
        this.aimGraphics,
        { x: from.x, y: from.y - 18 * from.scale },
        { x: to.x, y: to.y - 38 },
        8,
        6,
      );
    }
  }

  renderMatthias(game, width, height, now) {
    const p = trailProject(game.lane, 0.2, width, height);
    const size = Math.max(72, Math.min(116, width * 0.13));
    const slash = now < game.slashUntil;
    const state = this.reducedMotion ? 'reduced' : slash ? 'slash' : game.phase === 'duel' ? 'duel' : 'running';
    const motion = trailSpriteMotion('matthias', now, 0, state);
    const textureKey = slash ? 'matthiasCapture' : 'matthiasRun';
    if (this.matthias.texture.key !== textureKey) this.matthias.setTexture(textureKey);

    this.shadowGraphics.clear();
    const lift = Math.min(0.15, Math.abs(motion.y));
    this.shadowGraphics.fillStyle(0x000000, 0.34);
    this.shadowGraphics.fillEllipse(
      p.x,
      p.y - size * 0.03,
      size * (0.60 - lift * 1.4),
      size * (0.15 - lift * 0.32),
    );

    const baseScale = size / Math.max(1, this.matthias.width);
    this.matthias.setPosition(p.x + motion.x * size, p.y - size * 0.5 + motion.y * size);
    this.matthias.setRotation(motion.rotation || 0);
    this.matthias.setScale(baseScale * (motion.scaleX || 1), baseScale * (motion.scaleY || 1));
    this.matthias.setAlpha(now < game.flashUntil ? 0.72 : 1);

    this.powerBadge.setVisible(Boolean(game.power));
    if (game.power) {
      const badgeKey = POWER_TEXTURES[game.power] || POWER_TEXTURES.queen;
      if (this.powerBadge.texture.key !== badgeKey) this.powerBadge.setTexture(badgeKey);
      const badgeMotion = trailSpriteMotion('power', now, 11, this.reducedMotion ? 'reduced' : 'running');
      const badgeSize = size * 0.34;
      const badgeScale = badgeSize / Math.max(1, this.powerBadge.width);
      this.powerBadge.setPosition(
        p.x + size * 0.42 + badgeMotion.x * badgeSize,
        p.y - size * 0.88 + badgeMotion.y * badgeSize,
      );
      this.powerBadge.setRotation(badgeMotion.rotation || 0);
      this.powerBadge.setScale(badgeScale * (badgeMotion.scaleX || 1), badgeScale * (badgeMotion.scaleY || 1));
    }

    this.fxGraphics.clear();
    if (slash) {
      this.fxGraphics.lineStyle(Math.max(3, size * 0.045), 0xffefae, 0.9);
      this.fxGraphics.beginPath();
      this.fxGraphics.moveTo(p.x - size * 0.5, p.y - size * 0.72);
      this.fxGraphics.lineTo(p.x + size * 0.52, p.y - size * 0.25);
      this.fxGraphics.strokePath();
    }

    if (!this.reducedMotion && this.previousLives != null && game.lives < this.previousLives) {
      this.cameras.main.shake(140, 0.008);
    }
    if (!this.reducedMotion && slash && !this.wasSlashing) {
      this.cameras.main.shake(65, 0.0022);
    }
    this.previousLives = game.lives;
    this.wasSlashing = slash;
  }

  renderSnapshot() {
    const game = this.snapshot;
    if (!game) return;
    const width = Math.max(320, this.scale.width || this.game.canvas.width || 320);
    const height = Math.max(420, this.scale.height || this.game.canvas.height || 420);
    const now = this.snapshotNow;
    drawTrack(this.trackGraphics, width, height, game.distance, this.reducedMotion);
    this.renderBishopAims(game.objects, width, height, now);
    this.removeMissingNodes(game.objects);
    for (const item of [...game.objects].sort((a, b) => b.z - a.z)) {
      this.renderObject(item, width, height, now, game);
    }
    this.renderMatthias(game, width, height, now);
  }
}

export function createPawnTrailblazerRenderer(host, { onReady } = {}) {
  if (!host) throw new Error('Pawn Trailblazer Phaser renderer requires a host element');
  const scene = new PawnTrailblazerScene(onReady);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    backgroundColor: '#07090d',
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    banner: false,
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: Math.max(320, host.clientWidth || 320),
      height: Math.max(420, host.clientHeight || 420),
    },
    scene,
  });

  return {
    sync(snapshot, now, reducedMotion = false) {
      scene.sync(snapshot, now, reducedMotion);
    },
    destroy() {
      game.destroy(true);
      host.replaceChildren();
    },
  };
}
