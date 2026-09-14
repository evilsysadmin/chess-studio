import { pawnSlugDamageMultiplier } from './pawnSlug.js';
import { disposePawnSlugObject } from './pawnSlugArt.js';
import { animatePremiumProjectile } from './pawnSlugPremiumFx.js';
import {
  pawnSlugFirstHitDestructibleIndex,
  pawnSlugFirstHitEnemyIndex,
  pawnSlugRectsOverlap,
} from './pawnSlugRuntimeHotPath.js';
import {
  PAWN_SLUG_GRAVITY,
  PAWN_SLUG_PLAYER_H,
  PAWN_SLUG_PLAYER_W,
  PAWN_SLUG_VIEW_W,
} from './pawnSlugRuntimeCore.js';

export function createPawnSlugProjectileSystem(runtime, {
  explode,
  hurtPlayer,
  damageDestructible,
  damageEnemy,
} = {}) {
  const animationOptions = { time: 0, explosive: false };

  function retireBullet(state, index, bullet) {
    runtime.projectileLayer.remove(bullet.model);
    disposePawnSlugObject(bullet.model);
    state.bullets.splice(index, 1);
  }

  function updateBullets(dt) {
    const state = runtime.state;
    const playerLeft = state.player.x - PAWN_SLUG_PLAYER_W / 2;
    const playerTop = state.player.y;
    const playerHeight = state.player.crouch ? 1.05 : PAWN_SLUG_PLAYER_H;

    for (let index = 0; index < state.bullets.length;) {
      const bullet = state.bullets[index];
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.model.position.set(bullet.x, bullet.y, 0.3);
      animationOptions.time = state.time;
      animationOptions.explosive = bullet.explosive;
      animatePremiumProjectile(bullet.model, animationOptions);

      let remove = bullet.life <= 0
        || bullet.y < -1
        || bullet.x < state.cameraX - PAWN_SLUG_VIEW_W
        || bullet.x > state.cameraX + PAWN_SLUG_VIEW_W * 1.8;
      const bulletLeft = bullet.x - bullet.w / 2;
      const bulletTop = bullet.y - bullet.h / 2;

      if (!remove && bullet.enemy) {
        if (pawnSlugRectsOverlap(
          bulletLeft,
          bulletTop,
          bullet.w,
          bullet.h,
          playerLeft,
          playerTop,
          PAWN_SLUG_PLAYER_W,
          playerHeight,
        )) {
          if (bullet.explosive) explode?.(bullet.x, bullet.y, 1.8, 0, true);
          else hurtPlayer?.(bullet.damage);
          remove = true;
        }
      } else if (!remove) {
        const destructibleIndex = pawnSlugFirstHitDestructibleIndex(
          state.destructibles,
          bulletLeft,
          bulletTop,
          bullet.w,
          bullet.h,
        );
        if (destructibleIndex >= 0) {
          const item = state.destructibles[destructibleIndex];
          if (bullet.explosive) explode?.(bullet.x, bullet.y, 1.9, bullet.damage);
          else damageDestructible?.(item, bullet.damage);
          remove = true;
        } else {
          const enemyIndex = pawnSlugFirstHitEnemyIndex(
            state.enemies,
            bulletLeft,
            bulletTop,
            bullet.w,
            bullet.h,
          );
          if (enemyIndex >= 0) {
            const enemy = state.enemies[enemyIndex];
            if (bullet.explosive) explode?.(bullet.x, bullet.y, 1.9, bullet.damage);
            else damageEnemy?.(enemy, bullet.damage);
            remove = true;
          }
        }
      }

      if (remove) {
        retireBullet(state, index, bullet);
        continue;
      }
      index += 1;
    }
  }

  function updateGrenades(dt) {
    const state = runtime.state;
    for (let index = 0; index < state.grenades.length;) {
      const grenade = state.grenades[index];
      grenade.fuse -= dt;
      grenade.vy -= PAWN_SLUG_GRAVITY * 0.72 * dt;
      grenade.x += grenade.vx * dt;
      grenade.y += grenade.vy * dt;
      if (grenade.y <= 0.12) {
        grenade.y = 0.12;
        grenade.vy = Math.abs(grenade.vy) * 0.38;
        grenade.vx *= 0.72;
      }
      grenade.model.position.set(grenade.x, grenade.y, 0.4);
      grenade.model.rotation.z += dt * 8;
      if (grenade.fuse > 0) {
        index += 1;
        continue;
      }
      explode?.(grenade.x, grenade.y + 0.2, 2.65, 125 * pawnSlugDamageMultiplier(state.player.level));
      runtime.projectileLayer.remove(grenade.model);
      disposePawnSlugObject(grenade.model);
      state.grenades.splice(index, 1);
    }
  }

  return { updateBullets, updateGrenades };
}
