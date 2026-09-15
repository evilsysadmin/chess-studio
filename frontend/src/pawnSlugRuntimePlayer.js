import { PAWN_SLUG_WEAPONS, PAWN_SLUG_WORLD } from './pawnSlug.js';
import { animateMatthiasSlugSprite } from './pawnSlugSprites.js';
import {
  pawnSlugMatthiasLocomotion,
  pawnSlugMatthiasVisualY,
} from './pawnSlugMotionPolish.js';
import { pawnSlugResolvePlatformLanding } from './pawnSlugPlatforms.js';
import {
  PAWN_SLUG_CHECKPOINTS,
  PAWN_SLUG_GRAVITY,
  PAWN_SLUG_GROUND_Y,
  PAWN_SLUG_PLAYER_H,
  PAWN_SLUG_PLAYER_JUMP,
  PAWN_SLUG_PLAYER_SPEED,
  PAWN_SLUG_PLAYER_W,
  pawnSlugClamp,
  pawnSlugNearestCheckpoint,
  pawnSlugWorldX,
} from './pawnSlugRuntimeCore.js';

export function createPawnSlugPlayerSystem(runtime) {
  function placePlayer() {
    const state = runtime.state;
    runtime.playerModel.position.set(
      state.player.x,
      pawnSlugMatthiasVisualY(state.player.y),
      0.2,
    );
    runtime.playerModel.visible = state.phase !== 'gameover';
    runtime.playerWeaponModel.visible = runtime.playerModel.visible;
    runtime.weapons.syncPlayerWeaponVisual();
  }

  function animatePlayer() {
    const state = runtime.state;
    const player = state.player;
    const base = Math.abs(runtime.playerModel.userData.baseScale || runtime.playerModel.scale.x || 1);
    runtime.playerModel.scale.x = base * (player.dir < 0 ? -1 : 1);

    const locomotion = player.onGround && !player.crouch
      ? pawnSlugMatthiasLocomotion({
        time: state.time,
        moving: player.moving,
        speedRatio: Math.abs(player.vx) / PAWN_SLUG_PLAYER_SPEED,
        moveStartedAt: player.moveStartedAt,
      })
      : null;
    const running = locomotion?.action === 'run';

    animateMatthiasSlugSprite(runtime.playerModel, {
      time: state.time,
      // Matthias is the action hero here: ordinary traversal uses the full
      // authored 16-frame run row. Hans is the old gentleman elsewhere.
      running,
      runFrame: running ? locomotion.frame : null,
      crouch: player.crouch,
      airborne: !player.onGround,
      firing: player.recoil > 0,
      dir: player.dir,
      hurt: player.flash > 0,
    });

    const weaponY = player.crouch ? 0.68 : (!player.onGround ? 1.02 : 1.08);
    const weaponX = player.dir * (player.weapon === 'panzerfaust' ? 0.54 : 0.48);
    runtime.playerWeaponModel.userData.setDirection?.(player.dir);
    runtime.playerWeaponModel.position.set(
      player.x + weaponX,
      pawnSlugMatthiasVisualY(player.y) + weaponY,
      0.44,
    );
    runtime.playerWeaponModel.visible = runtime.playerModel.visible && state.phase !== 'gameover';
    if (player.recoil > 0) runtime.playerWeaponModel.position.x -= player.dir * 0.045;

    if (player.landing > 0 && !runtime.reducedMotion) {
      const landing = pawnSlugClamp(player.landing / 0.12, 0, 1);
      runtime.playerModel.scale.y *= 1 - landing * 0.055;
      runtime.playerModel.scale.x *= 1 + landing * 0.035;
    }
  }

  function updatePlayer(dt) {
    const state = runtime.state;
    const player = state.player;
    const input = runtime.input;
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.flash = Math.max(0, player.flash - dt);
    player.recoil = Math.max(0, player.recoil - dt);
    player.landing = Math.max(0, player.landing - dt);
    player.crouch = input.crouch && player.onGround;

    const axis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (axis) player.dir = axis;
    const speed = PAWN_SLUG_PLAYER_SPEED * (player.crouch ? 0.3 : 1);
    const targetVx = axis * speed;
    const response = axis ? (player.onGround ? 11.5 : 5.4) : (player.onGround ? 8.2 : 2.25);
    player.vx += (targetVx - player.vx) * (1 - Math.exp(-response * dt));

    const dropThrough = input.jump && player.crouch && player.onGround && player.y > PAWN_SLUG_GROUND_Y + 0.05;
    if (dropThrough) {
      player.onGround = false;
      player.y = Math.max(PAWN_SLUG_GROUND_Y, player.y - 0.09);
      player.vy = Math.min(player.vy, -1.2);
      input.jump = false;
    } else if (input.jump && player.onGround && !player.crouch) {
      player.vy = PAWN_SLUG_PLAYER_JUMP;
      player.onGround = false;
      input.jump = false;
    }

    const wasOnGround = player.onGround;
    const previousY = player.y;
    player.vy -= PAWN_SLUG_GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    const platformLanding = pawnSlugResolvePlatformLanding({
      previousY,
      nextY: player.y,
      vy: player.vy,
      left: player.x - PAWN_SLUG_PLAYER_W / 2,
      right: player.x + PAWN_SLUG_PLAYER_W / 2,
      dropThrough,
    });
    if (platformLanding) {
      player.y = platformLanding.y;
      player.vy = 0;
      player.onGround = true;
      if (!wasOnGround) player.landing = 0.12;
    } else if (player.y <= PAWN_SLUG_GROUND_Y) {
      player.y = PAWN_SLUG_GROUND_Y;
      player.vy = 0;
      player.onGround = true;
      if (!wasOnGround) player.landing = 0.12;
    } else {
      player.onGround = false;
    }

    const movingNow = Math.abs(player.vx) > 0.18 && player.onGround && !player.crouch;
    if (movingNow && !player.moving) player.moveStartedAt = state.time;
    if (!movingNow && player.moving) player.stoppedAt = state.time;
    player.moving = movingNow;

    const blockingMidBoss = state.enemies.find((enemy) => enemy.type === 'bishop' && !enemy.dead && player.x <= enemy.x && enemy.x - player.x < 7.5);
    if (blockingMidBoss) player.x = Math.min(player.x, blockingMidBoss.x - 1.3);

    const bossAlive = state.enemies.some((enemy) => enemy.type === 'boss' && !enemy.dead);
    const bossArenaLeft = pawnSlugWorldX(PAWN_SLUG_WORLD.bossX - 570);
    const bossArenaRight = pawnSlugWorldX(PAWN_SLUG_WORLD.bossX + 500);
    if (bossAlive && player.x > bossArenaLeft) player.x = pawnSlugClamp(player.x, bossArenaLeft, bossArenaRight);
    else player.x = pawnSlugClamp(player.x, PAWN_SLUG_CHECKPOINTS[0], pawnSlugWorldX(PAWN_SLUG_WORLD.extractionX));

    const weapon = PAWN_SLUG_WEAPONS[player.weapon] || PAWN_SLUG_WEAPONS.pistol;
    const wantsFire = weapon.trigger === 'auto' ? input.fire : input.firePressed;
    if (wantsFire) runtime.weapons.firePlayerWeapon();
    input.firePressed = false;

    if (input.grenade) {
      runtime.weapons.throwGrenade();
      input.grenade = false;
    }

    state.checkpoint = pawnSlugNearestCheckpoint(player.x);
    runtime.playerModel.position.set(player.x, pawnSlugMatthiasVisualY(player.y), 0.2);
    runtime.playerModel.visible = !(player.invuln > 0 && Math.floor(state.time * 18) % 2 === 0);
    animatePlayer();
  }

  return { placePlayer, animatePlayer, updatePlayer };
}
