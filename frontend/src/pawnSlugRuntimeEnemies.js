import {
  PAWN_SLUG_ENEMIES,
  PAWN_SLUG_PICKUPS,
  PAWN_SLUG_SPAWNS,
  PAWN_SLUG_WORLD,
} from './pawnSlug.js';
import { createSlugEnemyModel, disposePawnSlugObject, animateSlugEnemy } from './pawnSlugArt.js';
import { createPickupModel } from './pawnSlugPickupArt.js';
import { pawnSlugMicroAmbushUnlockedForSpawn } from './pawnSlugMicroAmbushes.js';
import { pawnSlugPlatformAtX, pawnSlugResolvePlatformLanding } from './pawnSlugPlatforms.js';
import {
  PAWN_SLUG_STURM_BISHOP_META,
  animateSturmBishopModel,
  createSturmBishopModel,
  pawnSlugSturmBishopCooldownTick,
  pawnSlugSturmBishopSuppressionTelegraph,
  pawnSlugSturmBishopTelegraph,
} from './pawnSlugMidBoss.js';
import {
  pawnSlugEnemyFireCooldown,
  pawnSlugEnemyWeaponFor,
  pawnSlugSpawnDestructiblesAhead,
  pawnSlugSpawnPowsAhead,
} from './pawnSlugRuntimeHotPath.js';
import { animatePawnSlugWantedInsignia, attachPawnSlugWantedInsignia } from './pawnSlugWantedArt.js';
import { pawnSlugWantedCombatProfile, pawnSlugWantedOfficerFor } from './pawnSlugWantedOfficers.js';
import {
  PAWN_SLUG_GRAVITY,
  PAWN_SLUG_PLAYER_H,
  PAWN_SLUG_VIEW_W,
  PAWN_SLUG_WORLD_SCALE,
  pawnSlugClamp,
  pawnSlugStableEnemyVariant,
  pawnSlugWorldX,
} from './pawnSlugRuntimeCore.js';

export function createPawnSlugEnemySystem(runtime) {
  function createEnemy(spawn) {
    const stats = PAWN_SLUG_ENEMIES[spawn.type];
    const midBoss = spawn.type === 'bishop';
    const model = midBoss ? createSturmBishopModel() : createSlugEnemyModel(spawn.type);
    const wantedOfficer = pawnSlugWantedOfficerFor({ id: spawn.id, type: spawn.type });
    const wantedProfile = pawnSlugWantedCombatProfile(wantedOfficer);
    attachPawnSlugWantedInsignia(model, wantedOfficer, { reducedMotion: runtime.reducedMotion });
    const x = pawnSlugWorldX(spawn.x);
    model.position.set(x, 0, midBoss ? 0.08 : 0);
    runtime.dynamic.add(model);
    const weapon = pawnSlugEnemyWeaponFor(spawn.type, pawnSlugStableEnemyVariant(spawn.id));
    const enemy = {
      id: spawn.id,
      type: spawn.type,
      weapon,
      wantedOfficer,
      wantedProfile,
      x,
      y: 0,
      w: stats.width * PAWN_SLUG_WORLD_SCALE * 0.92,
      h: Math.max(1.25, stats.height * PAWN_SLUG_WORLD_SCALE),
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed * PAWN_SLUG_WORLD_SCALE * wantedProfile.mobility,
      score: stats.score,
      dir: -1,
      vx: 0,
      vy: 0,
      onGround: true,
      fireCooldown: midBoss ? 0.75 : pawnSlugEnemyFireCooldown(weapon, Math.random()) * wantedProfile.cadence,
      fireTelegraph: 0,
      fireTelegraphProgress: 0,
      shellCooldown: midBoss ? 1.65 + Math.random() * 0.45 : null,
      suppressionCooldown: midBoss ? 2.35 + Math.random() * 0.7 : null,
      suppressionShots: 0,
      suppressionShotIndex: 0,
      suppressionShotCooldown: 0,
      leapCooldown: (0.7 + Math.random() * 1.2) / wantedProfile.aggression,
      hurt: 0,
      dead: false,
      model,
    };
    runtime.state.enemies.push(enemy);
    if (midBoss) {
      runtime.state.hitStop = Math.max(runtime.state.hitStop, runtime.reducedMotion ? 0 : 0.08);
      runtime.state.shake = Math.max(runtime.state.shake, runtime.reducedMotion ? 0 : 0.18);
      runtime.setToast(`${PAWN_SLUG_STURM_BISHOP_META.label} // ${runtime.matthiasLine('midBoss')}`, 3);
      runtime.sfx.play('boss');
    }
    return enemy;
  }

  function createBoss() {
    const state = runtime.state;
    if (state.bossSpawned || state.bossDefeated) return;
    state.bossSpawned = true;
    const stats = PAWN_SLUG_ENEMIES.boss;
    const model = createSlugEnemyModel('boss');
    const x = pawnSlugWorldX(PAWN_SLUG_WORLD.bossX);
    model.position.set(x, 0, -0.15);
    runtime.dynamic.add(model);
    const weapon = pawnSlugEnemyWeaponFor('boss', 0);
    state.enemies.push({
      id: 'boss-panzer-rook', type: 'boss', weapon, x, y: 0, w: 4.6, h: 3.2,
      hp: stats.hp, maxHp: stats.hp, speed: 0, score: stats.score, dir: -1,
      vx: 0, vy: 0, onGround: true, fireCooldown: pawnSlugEnemyFireCooldown(weapon, 0.45), fireTelegraph: 0, fireTelegraphProgress: 0, shellCooldown: 1.55,
      hurt: 0, dead: false, model,
    });
    state.hitStop = runtime.reducedMotion ? 0 : 0.18;
    state.shake = runtime.reducedMotion ? 0 : 0.45;
    runtime.setToast(runtime.matthiasLine('boss'), 3.2);
    runtime.sfx.play('boss');
  }

  function createPickup(pickup, index) {
    const state = runtime.state;
    if (state.takenPickups.has(index)) return;
    const model = createPickupModel(pickup.type);
    const x = pawnSlugWorldX(pickup.x);
    const support = pawnSlugPlatformAtX(x);
    const y = (support?.y || 0) + 0.18;
    model.position.set(x, y, 0.35);
    runtime.dynamic.add(model);
    state.pickups.push({ id: index, type: pickup.type, x, y, w: 0.9, h: 0.9, model, bob: Math.random() * Math.PI * 2 });
  }

  function spawnAhead() {
    const state = runtime.state;
    const right = runtime.camera.position.x + PAWN_SLUG_VIEW_W * 0.72;
    const playerMissionX = state.player.x / PAWN_SLUG_WORLD_SCALE;
    for (const spawn of PAWN_SLUG_SPAWNS) {
      if (state.spawned.has(spawn.id)) continue;
      if (!pawnSlugMicroAmbushUnlockedForSpawn(spawn, playerMissionX)) continue;
      const x = pawnSlugWorldX(spawn.x);
      if (x <= right) {
        state.spawned.add(spawn.id);
        createEnemy(spawn);
      }
    }
    for (let index = 0; index < PAWN_SLUG_PICKUPS.length; index += 1) {
      if (state.takenPickups.has(index) || state.pickups.some((pickup) => pickup.id === index)) continue;
      if (pawnSlugWorldX(PAWN_SLUG_PICKUPS[index].x) <= right) createPickup(PAWN_SLUG_PICKUPS[index], index);
    }
    pawnSlugSpawnDestructiblesAhead({
      rightEdge: right,
      active: state.destructibles,
      destroyedIds: state.destroyedDestructibles,
      resolveY: (x) => pawnSlugPlatformAtX(x)?.y || 0,
      addModel: (model) => runtime.dynamic.add(model),
      coarse: runtime.coarse,
    });
    pawnSlugSpawnPowsAhead(state, runtime.dynamic, right, {
      coarse: runtime.coarse,
      supportAtX: pawnSlugPlatformAtX,
    });
    if (state.player.x >= pawnSlugWorldX(PAWN_SLUG_WORLD.bossX - 720)) createBoss();
  }

  function updateEnemies(dt) {
    const state = runtime.state;
    const player = state.player;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      enemy.hurt = Math.max(0, enemy.hurt - dt);
      enemy.fireCooldown -= dt;
      enemy.leapCooldown = Math.max(0, (enemy.leapCooldown || 0) - dt);
      const dx = player.x - enemy.x;
      const distance = Math.abs(dx);
      enemy.dir = dx >= 0 ? 1 : -1;
      const wantedProfile = enemy.wantedProfile || pawnSlugWantedCombatProfile(null);
      const aggression = wantedProfile.aggression;
      const cadence = wantedProfile.cadence;

      if (enemy.type === 'pawn') {
        enemy.vx = distance > 4.6 / aggression ? enemy.dir * enemy.speed : 0;
        runtime.weapons.updateEnemyRegularFire(enemy, distance, 9 * aggression, cadence, dt);
      } else if (enemy.type === 'knight') {
        enemy.vx = distance > 2.1 / aggression ? enemy.dir * enemy.speed : enemy.dir * enemy.speed * 0.25;
        if (enemy.leapCooldown <= 0 && distance < 7.5 * aggression && enemy.onGround) {
          enemy.vy = 7.5;
          enemy.onGround = false;
          enemy.leapCooldown = (2.2 + Math.random() * 1.4) / aggression;
        }
        runtime.weapons.updateEnemyRegularFire(enemy, distance, 8 * aggression, cadence, dt);
      } else if (enemy.type === 'rook') {
        enemy.vx = 0;
        runtime.weapons.updateEnemyRegularFire(enemy, distance, 12 * aggression, cadence, dt);
      } else if (enemy.type === 'bishop') {
        enemy.shellCooldown = pawnSlugSturmBishopCooldownTick(enemy.shellCooldown, distance, PAWN_SLUG_STURM_BISHOP_META.shellRange, PAWN_SLUG_STURM_BISHOP_META.shellTelegraphSeconds, dt);
        enemy.suppressionCooldown = pawnSlugSturmBishopCooldownTick(enemy.suppressionCooldown, distance, PAWN_SLUG_STURM_BISHOP_META.suppressionRange, PAWN_SLUG_STURM_BISHOP_META.suppressionTelegraphSeconds, dt);
        enemy.suppressionShotCooldown = Math.max(0, enemy.suppressionShotCooldown - dt);
        const shellClearForSuppression = enemy.shellCooldown > PAWN_SLUG_STURM_BISHOP_META.shellTelegraphSeconds + 0.35;
        const suppressionCharging = enemy.suppressionShots <= 0
          && shellClearForSuppression
          && distance < PAWN_SLUG_STURM_BISHOP_META.suppressionRange
          && enemy.suppressionCooldown > 0
          && enemy.suppressionCooldown <= PAWN_SLUG_STURM_BISHOP_META.suppressionTelegraphSeconds;

        if (enemy.suppressionShots > 0) {
          enemy.vx = 0;
          enemy.fireTelegraph = 0;
          enemy.fireTelegraphProgress = 0;
          enemy.shellCooldown = Math.max(enemy.shellCooldown, PAWN_SLUG_STURM_BISHOP_META.shellTelegraphSeconds + 0.55);
          if (enemy.suppressionShotCooldown <= 0) {
            runtime.weapons.fireBishopSuppression(enemy, enemy.suppressionShotIndex);
            enemy.suppressionShotIndex += 1;
            enemy.suppressionShots -= 1;
            enemy.suppressionShotCooldown = PAWN_SLUG_STURM_BISHOP_META.suppressionShotInterval;
            if (enemy.suppressionShots <= 0) {
              enemy.suppressionCooldown = 3.15 + Math.random() * 0.65;
              enemy.fireCooldown = Math.max(enemy.fireCooldown, 0.32);
            }
          }
        } else {
          enemy.vx = suppressionCharging ? 0 : (distance > 4.8 ? enemy.dir * enemy.speed : 0);
          const regularFireClear = !suppressionCharging && enemy.shellCooldown > PAWN_SLUG_STURM_BISHOP_META.shellTelegraphSeconds;
          runtime.weapons.updateEnemyRegularFire(enemy, distance, regularFireClear ? 11 : 0, 1, dt);
          if (shellClearForSuppression && distance < PAWN_SLUG_STURM_BISHOP_META.suppressionRange && enemy.suppressionCooldown <= 0) {
            enemy.suppressionShots = PAWN_SLUG_STURM_BISHOP_META.suppressionBurstShots;
            enemy.suppressionShotIndex = 0;
            enemy.suppressionShotCooldown = 0;
            enemy.vx = 0;
            enemy.fireTelegraph = 0;
            enemy.fireTelegraphProgress = 0;
            enemy.shellCooldown = Math.max(enemy.shellCooldown, PAWN_SLUG_STURM_BISHOP_META.shellTelegraphSeconds + 0.7);
          } else if (distance < PAWN_SLUG_STURM_BISHOP_META.shellRange && enemy.shellCooldown <= 0) {
            enemy.fireTelegraph = 0;
            enemy.fireTelegraphProgress = 0;
            runtime.weapons.fireEnemy(enemy, true);
            enemy.shellCooldown = 2.05 + Math.random() * 0.55;
          }
        }
      } else if (enemy.type === 'boss') {
        enemy.vx = 0;
        runtime.weapons.updateEnemyRegularFire(enemy, distance, 16, 1, dt);
        enemy.shellCooldown -= dt;
        if (distance < 18 && enemy.shellCooldown <= 0) {
          runtime.weapons.fireEnemy(enemy, true);
          enemy.shellCooldown = 1.65 + Math.random() * 0.45;
        }
      }

      const previousEnemyY = enemy.y;
      enemy.vy -= PAWN_SLUG_GRAVITY * dt;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      const enemyLanding = enemy.type === 'boss' || enemy.type === 'bishop'
        ? null
        : pawnSlugResolvePlatformLanding({ previousY: previousEnemyY, nextY: enemy.y, vy: enemy.vy, left: enemy.x - enemy.w / 2, right: enemy.x + enemy.w / 2 });
      if (enemyLanding) {
        enemy.y = enemyLanding.y;
        enemy.vy = 0;
        enemy.onGround = true;
      } else if (enemy.y <= 0) {
        enemy.y = 0;
        enemy.vy = 0;
        enemy.onGround = true;
      } else {
        enemy.onGround = false;
      }
      enemy.model.position.set(enemy.x, enemy.y, enemy.type === 'boss' ? -0.15 : enemy.type === 'bishop' ? 0.08 : 0);
      if (enemy.type === 'bishop') {
        enemy.model.userData.baseY = enemy.y;
        const telegraph = pawnSlugSturmBishopTelegraph(enemy.shellCooldown, distance);
        const suppressionTelegraph = enemy.suppressionShots > 0
          ? 1
          : (enemy.shellCooldown > PAWN_SLUG_STURM_BISHOP_META.shellTelegraphSeconds + 0.35 ? pawnSlugSturmBishopSuppressionTelegraph(enemy.suppressionCooldown, distance) : 0);
        animateSturmBishopModel(enemy.model, state.time, {
          moving: Math.abs(enemy.vx) > 0.2,
          hurt: enemy.hurt > 0,
          dir: enemy.dir,
          telegraph,
          suppressionTelegraph,
        });
        if (enemy.fireTelegraphProgress > 0) {
          const rawStrength = pawnSlugClamp(enemy.fireTelegraphProgress, 0, 1);
          const pulse = runtime.reducedMotion ? rawStrength : rawStrength * (0.72 + Math.max(0, Math.sin(state.time * (18 + rawStrength * 14))) * 0.5);
          enemy.model.traverse((node) => {
            if (!node.userData?.warningHalo) return;
            node.visible = true;
            node.material.opacity = Math.max(node.material.opacity || 0, Math.min(0.78, 0.2 + pulse * 0.52));
            node.material.color.setHex(0xff8a34);
            if (runtime.reducedMotion) node.scale.setScalar(Math.max(node.scale.x || 1, 1.04));
            else node.scale.setScalar(Math.max(node.scale.x || 1, 0.94 + pulse * 0.2));
          });
        }
      } else {
        enemy.model.scale.x = Math.abs(enemy.model.scale.x || 1) * enemy.dir;
        animateSlugEnemy(enemy.model, enemy.type, state.time, { moving: Math.abs(enemy.vx) > 0.2, hurt: enemy.hurt > 0 });
        if (enemy.fireTelegraphProgress > 0 && enemy.hurt <= 0 && enemy.model.material?.color) {
          const rawStrength = pawnSlugClamp(enemy.fireTelegraphProgress, 0, 1);
          const pulse = runtime.reducedMotion ? rawStrength : rawStrength * (0.72 + Math.max(0, Math.sin(state.time * (18 + rawStrength * 14))) * 0.5);
          enemy.model.material.color.setRGB(1, 1 - pulse * 0.38, 1 - pulse * 0.68);
        }
      }
      animatePawnSlugWantedInsignia(enemy.model, state.time);

      if (!runtime.reducedMotion && (enemy.type === 'bishop' || enemy.type === 'boss')) {
        const moving = Math.abs(enemy.vx) > 0.2;
        const phase = enemy.model.userData.motionPhase ?? ((enemy.model.id || 0) * 0.73);
        const rate = enemy.type === 'bishop' ? 5.2 : 2.2;
        const bob = enemy.type === 'bishop' ? 0.065 : 0.045;
        const lean = enemy.type === 'bishop' ? 0.018 : 0.008;
        const stride = Math.sin(state.time * rate + phase);
        enemy.model.position.y += moving ? Math.abs(stride) * bob : Math.max(0, stride) * bob * 0.35;
        const tilt = stride * lean * (moving ? 1 : 0.35) * enemy.dir;
        if (enemy.model.material) enemy.model.material.rotation += tilt;
        else enemy.model.rotation.z = tilt;
      }
      if (!runtime.reducedMotion && enemy.type === 'knight' && !enemy.onGround) {
        if (enemy.model.material) enemy.model.material.rotation += enemy.dir * 0.08;
        else enemy.model.rotation.z += enemy.dir * 0.08;
      }

      const contact = enemy.type === 'boss' ? 3.5 : enemy.type === 'bishop' ? 1.15 : enemy.type === 'rook' ? 0.85 : 0.58;
      if (distance < contact && player.y < enemy.y + enemy.h && player.y + PAWN_SLUG_PLAYER_H > enemy.y) {
        runtime.combat.hurtPlayer(enemy.type === 'boss' ? 38 : enemy.type === 'bishop' ? 28 : 18);
      }
    }

    for (let index = 0; index < state.enemies.length;) {
      const enemy = state.enemies[index];
      if (!enemy.dead) {
        index += 1;
        continue;
      }
      runtime.dynamic.remove(enemy.model);
      disposePawnSlugObject(enemy.model);
      state.enemies.splice(index, 1);
    }
  }

  return { createEnemy, createBoss, createPickup, spawnAhead, updateEnemies };
}
