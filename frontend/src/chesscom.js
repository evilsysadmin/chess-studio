export const CHESSCOM_WIDTH = 10;
export const CHESSCOM_HEIGHT = 8;

export const CHESSCOM_BLOCKED = new Set([
  '0,0','1,0','2,0','3,0','4,0',
  '0,1','4,1','8,1','9,1',
  '0,2','4,2','8,2','9,2',
  '0,3','4,3','9,3',
  '0,4','9,4',
  '0,5','6,5','9,5',
  '0,6','6,6','9,6',
  '0,7','6,7','7,7','8,7','9,7',
]);

export const CHESSCOM_COVER = new Map([
  ['2,2','high'], ['3,2','low'], ['5,2','high'], ['6,2','low'], ['7,2','high'],
  ['2,3','low'], ['6,3','high'], ['8,3','low'], ['1,4','high'], ['5,4','low'],
  ['7,4','high'], ['2,5','high'], ['4,5','low'], ['7,5','low'], ['8,5','high'],
  ['1,6','low'], ['5,6','high'], ['7,6','low'], ['8,6','high'],
]);

export const CHESSCOM_INTEL = { x: 6, y: 2 };
export const CHESSCOM_EXTRACTION = { x: 1, y: 7 };

export function chesscomKey(x, y) {
  return `${x},${y}`;
}

export function chesscomDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function chesscomInside(x, y) {
  return x >= 0 && y >= 0 && x < CHESSCOM_WIDTH && y < CHESSCOM_HEIGHT;
}

export function chesscomOccupied(state, x, y, exceptId = null) {
  return [...state.friendlies, ...state.enemies].some((unit) => unit.id !== exceptId && unit.hp > 0 && unit.x === x && unit.y === y);
}

export function chesscomWalkable(state, x, y, exceptId = null) {
  return chesscomInside(x, y) && !CHESSCOM_BLOCKED.has(chesscomKey(x, y)) && !chesscomOccupied(state, x, y, exceptId);
}

export function chesscomReachable(state, unit) {
  if (!unit || unit.hp <= 0 || unit.ap <= 0) return [];
  const maxCost = Math.min(3, unit.ap);
  const seen = new Map([[chesscomKey(unit.x, unit.y), 0]]);
  const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
  const result = [];

  while (queue.length) {
    const current = queue.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x = current.x + dx;
      const y = current.y + dy;
      const cost = current.cost + 1;
      const key = chesscomKey(x, y);
      if (cost > maxCost || seen.has(key) || !chesscomWalkable(state, x, y, unit.id)) continue;
      seen.set(key, cost);
      queue.push({ x, y, cost });
      result.push({ x, y, cost, cover: CHESSCOM_COVER.get(key) || 'none' });
    }
  }
  return result;
}

export function chesscomCreateState() {
  return {
    turn: 1,
    phase: 'player',
    credits: 12800,
    deploymentCost: 3400,
    selectedId: 'matthias',
    action: 'move',
    log: ['Operación DUST VEIL iniciada. El gobierno niega conocerte con admirable eficiencia.'],
    objectives: { target: false, intel: false, extraction: false },
    friendlies: [
      { id:'matthias', name:'Matthias', role:'Leader', x:3, y:6, hp:8, maxHp:8, ap:4, maxAp:4, weapon:'HK416 (Used)', damage:3, range:5, reliability:90, ammo:30, overwatch:false },
      { id:'dieter', name:'Dieter', role:'Rifleman', x:4, y:6, hp:8, maxHp:8, ap:4, maxAp:4, weapon:'G36C', damage:3, range:4, reliability:96, ammo:30, overwatch:false },
      { id:'sven', name:'Sven', role:'Scout', x:3, y:7, hp:7, maxHp:7, ap:4, maxAp:4, weapon:'MP5SD', damage:2, range:4, reliability:94, ammo:30, overwatch:false },
    ],
    enemies: [
      { id:'target', name:'Cell commander', role:'Target', x:7, y:1, hp:6, maxHp:6, ap:3, maxAp:3, damage:2, range:4, elite:true },
      { id:'guard-a', name:'Guard', role:'Rifleman', x:7, y:3, hp:4, maxHp:4, ap:3, maxAp:3, damage:1, range:3 },
      { id:'guard-b', name:'Guard', role:'Rifleman', x:8, y:4, hp:4, maxHp:4, ap:3, maxAp:3, damage:1, range:3 },
    ],
  };
}

export function chesscomMove(state, unitId, x, y) {
  const unit = state.friendlies.find((candidate) => candidate.id === unitId);
  const target = chesscomReachable(state, unit).find((tile) => tile.x === x && tile.y === y);
  if (!unit || !target) return state;

  const friendlies = state.friendlies.map((candidate) => candidate.id === unitId
    ? { ...candidate, x, y, ap: Math.max(0, candidate.ap - target.cost), overwatch:false }
    : candidate);
  const reachedExtraction = x === CHESSCOM_EXTRACTION.x && y === CHESSCOM_EXTRACTION.y;
  return {
    ...state,
    friendlies,
    objectives: reachedExtraction ? { ...state.objectives, extraction:true } : state.objectives,
    log: [`${unit.name} se desplaza ${target.cost} AP${target.cover !== 'none' ? ` · cobertura ${target.cover}` : ''}.`, ...state.log].slice(0, 5),
  };
}

export function chesscomShoot(state, shooterId, enemyId) {
  const shooter = state.friendlies.find((candidate) => candidate.id === shooterId);
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
  if (!shooter || !enemy || shooter.hp <= 0 || enemy.hp <= 0 || shooter.ap < 2 || shooter.ammo <= 0) return state;
  if (chesscomDistance(shooter, enemy) > shooter.range) return state;

  const cover = CHESSCOM_COVER.get(chesscomKey(enemy.x, enemy.y));
  const damage = Math.max(1, shooter.damage - (cover === 'high' ? 1 : 0));
  let targetDropped = false;
  const enemies = state.enemies.map((candidate) => {
    if (candidate.id !== enemyId) return candidate;
    const hp = Math.max(0, candidate.hp - damage);
    targetDropped = hp === 0 && candidate.id === 'target';
    return { ...candidate, hp };
  });
  const friendlies = state.friendlies.map((candidate) => candidate.id === shooterId
    ? { ...candidate, ap: candidate.ap - 2, ammo: candidate.ammo - 1, overwatch:false }
    : candidate);
  return {
    ...state,
    enemies,
    friendlies,
    objectives: targetDropped ? { ...state.objectives, target:true } : state.objectives,
    log: [`${shooter.name} dispara a ${enemy.name}: ${damage} daño${cover ? ` tras ${cover} cover` : ''}.`, ...state.log].slice(0, 5),
  };
}

export function chesscomInteract(state, unitId) {
  const unit = state.friendlies.find((candidate) => candidate.id === unitId);
  if (!unit || unit.ap < 1) return state;
  const nearIntel = chesscomDistance(unit, CHESSCOM_INTEL) <= 1;
  if (!nearIntel || state.objectives.intel) return state;
  return {
    ...state,
    friendlies: state.friendlies.map((candidate) => candidate.id === unitId ? { ...candidate, ap:candidate.ap - 1 } : candidate),
    objectives: { ...state.objectives, intel:true },
    log: [`${unit.name} recupera el dossier. El cliente insiste en que nunca existió.`, ...state.log].slice(0, 5),
  };
}

function stepEnemyToward(state, enemy, target) {
  const options = [[1,0],[-1,0],[0,1],[0,-1]]
    .map(([dx,dy]) => ({ x:enemy.x+dx, y:enemy.y+dy }))
    .filter((tile) => chesscomWalkable(state, tile.x, tile.y, enemy.id))
    .sort((a,b) => chesscomDistance(a,target)-chesscomDistance(b,target));
  return options[0] || { x:enemy.x, y:enemy.y };
}

function resolveOverwatch(friendlies, enemy, log) {
  let nextEnemy = { ...enemy };
  let nextFriendlies = friendlies.map((unit) => ({ ...unit }));
  for (const watcher of nextFriendlies) {
    if (!watcher.overwatch || watcher.hp <= 0 || watcher.ammo <= 0 || nextEnemy.hp <= 0) continue;
    if (chesscomDistance(watcher,nextEnemy) > watcher.range) continue;
    const cover = CHESSCOM_COVER.get(chesscomKey(nextEnemy.x,nextEnemy.y));
    const damage = Math.max(1, watcher.damage - (cover === 'high' ? 1 : 0));
    nextEnemy.hp = Math.max(0,nextEnemy.hp-damage);
    nextFriendlies = nextFriendlies.map((unit) => unit.id === watcher.id ? { ...unit, ammo:unit.ammo-1, overwatch:false } : unit);
    log.unshift(`${watcher.name} reacciona desde overwatch sobre ${enemy.name}: ${damage} daño.`);
  }
  return { friendlies:nextFriendlies, enemy:nextEnemy };
}

export function chesscomEndTurn(state) {
  let friendlies = state.friendlies.map((unit) => ({ ...unit }));
  let enemies = state.enemies.map((unit) => ({ ...unit }));
  let objectives = { ...state.objectives };
  const log = [...state.log];

  for (let index = 0; index < enemies.length; index += 1) {
    let enemy = enemies[index];
    if (enemy.hp <= 0) continue;
    const living = friendlies.filter((unit) => unit.hp > 0).sort((a,b) => chesscomDistance(enemy,a)-chesscomDistance(enemy,b));
    const target = living[0];
    if (!target) break;
    const distance = chesscomDistance(enemy, target);
    if (distance <= enemy.range) {
      const cover = CHESSCOM_COVER.get(chesscomKey(target.x, target.y));
      const damage = Math.max(1, enemy.damage - (cover === 'high' ? 1 : 0));
      friendlies = friendlies.map((unit) => unit.id === target.id ? { ...unit, hp:Math.max(0, unit.hp-damage) } : unit);
      log.unshift(`${enemy.name} abre fuego sobre ${target.name}: ${damage} daño.`);
    } else {
      const next = stepEnemyToward({ ...state, friendlies, enemies }, enemy, target);
      enemy = { ...enemy, ...next };
      const reaction = resolveOverwatch(friendlies,enemy,log);
      friendlies = reaction.friendlies;
      enemy = reaction.enemy;
      enemies[index] = enemy;
      if (enemy.hp === 0) {
        log.unshift(`${enemy.name} cae durante su movimiento.`);
        if (enemy.id === 'target') objectives.target = true;
        continue;
      }
      log.unshift(`${enemy.name} cambia de posición.`);
    }
  }

  friendlies = friendlies.map((unit) => ({ ...unit, ap:unit.hp > 0 ? unit.maxAp : 0, overwatch:false }));
  return {
    ...state,
    turn: state.turn + 1,
    phase:'player',
    action:'move',
    friendlies,
    enemies,
    objectives,
    log: log.slice(0,5),
  };
}

export function chesscomSetOverwatch(state, unitId) {
  const unit = state.friendlies.find((candidate) => candidate.id === unitId);
  if (!unit || unit.ap < 2 || unit.hp <= 0 || unit.ammo <= 0) return state;
  return {
    ...state,
    friendlies: state.friendlies.map((candidate) => candidate.id === unitId ? { ...candidate, ap:candidate.ap-2, overwatch:true } : candidate),
    log: [`${unit.name} queda en overwatch.`, ...state.log].slice(0,5),
  };
}

export function chesscomMissionStatus(state) {
  const living = state.friendlies.filter((unit) => unit.hp > 0);
  if (!living.length) return 'failed';
  if (state.objectives.target && state.objectives.intel && state.objectives.extraction) return 'complete';
  return 'active';
}
