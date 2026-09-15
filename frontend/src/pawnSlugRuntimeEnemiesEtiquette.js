import { animateSlugEnemy } from './pawnSlugArt.js';
import {
  PAWN_SLUG_ENEMY_ENTRY_META,
  pawnSlugEnemyEntryCombatReady,
  pawnSlugEnemyEntrySpawnX,
  pawnSlugEnemyEntrySprintSpeed,
  pawnSlugRegularEnemyType,
} from './pawnSlugEnemyEntry.js';
import { PAWN_SLUG_VIEW_W } from './pawnSlugRuntimeCore.js';
import { createPawnSlugEnemySystem as createBasePawnSlugEnemySystem } from './pawnSlugRuntimeEnemies.js';

export function createPawnSlugEnemySystem(runtime) {
  const base = createBasePawnSlugEnemySystem(runtime);

  function prepareEntry(enemy) {
    if (!enemy || !pawnSlugRegularEnemyType(enemy.type) || enemy.entryPrepared) return enemy;
    enemy.entryPrepared = true;
    enemy.entrySprint = true;
    enemy.entryBaseSpeed = Math.max(0, Number(enemy.speed) || 0);
    enemy.x = pawnSlugEnemyEntrySpawnX(enemy.x, runtime.camera.position.x, PAWN_SLUG_VIEW_W);
    enemy.model.position.x = enemy.x;
    enemy.fireTelegraph = 0;
    enemy.fireTelegraphProgress = 0;
    enemy.fireCooldown = Math.max(enemy.fireCooldown || 0, PAWN_SLUG_ENEMY_ENTRY_META.fireGrace);
    return enemy;
  }

  function finishEntry(enemy) {
    enemy.entrySprint = false;
    enemy.speed = enemy.entryBaseSpeed;
    enemy.fireCooldown = Math.max(enemy.fireCooldown || 0, 0.2);
  }

  function createEnemy(spawn) {
    return prepareEntry(base.createEnemy(spawn));
  }

  function spawnAhead() {
    const before = new Set(runtime.state.enemies);
    base.spawnAhead();
    for (const enemy of runtime.state.enemies) {
      if (!before.has(enemy)) prepareEntry(enemy);
    }
  }

  function updateEnemies(dt) {
    const entrants = [];
    for (const enemy of runtime.state.enemies) {
      if (!enemy.entrySprint || enemy.dead) continue;
      if (pawnSlugEnemyEntryCombatReady(enemy.x, runtime.camera.position.x, PAWN_SLUG_VIEW_W)) {
        finishEntry(enemy);
        continue;
      }

      const baseSpeed = Math.max(0, Number(enemy.entryBaseSpeed) || 0);
      const sprintSpeed = pawnSlugEnemyEntrySprintSpeed(enemy.type, baseSpeed);
      enemy.x -= sprintSpeed * dt;
      enemy.speed = 0;
      enemy.vx = 0;
      enemy.dir = -1;
      enemy.leapCooldown = Math.max(enemy.leapCooldown || 0, 0.35);
      enemy.fireCooldown = Math.max(enemy.fireCooldown || 0, PAWN_SLUG_ENEMY_ENTRY_META.fireGrace);
      enemy.fireTelegraph = 0;
      enemy.fireTelegraphProgress = 0;
      entrants.push(enemy);
    }

    base.updateEnemies(dt);

    for (const enemy of entrants) {
      if (!runtime.state.enemies.includes(enemy) || enemy.dead) continue;
      enemy.speed = enemy.entryBaseSpeed;
      if (pawnSlugEnemyEntryCombatReady(enemy.x, runtime.camera.position.x, PAWN_SLUG_VIEW_W)) {
        finishEntry(enemy);
        continue;
      }
      enemy.model.scale.x = -Math.abs(enemy.model.scale.x || 1);
      animateSlugEnemy(enemy.model, enemy.type, runtime.state.time, {
        moving: true,
        hurt: enemy.hurt > 0,
        airborne: !enemy.onGround,
        vy: enemy.vy,
      });
    }
  }

  return {
    ...base,
    createEnemy,
    spawnAhead,
    updateEnemies,
  };
}
