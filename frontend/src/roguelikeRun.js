import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';
import { perkById } from './roguelikePerks.js';
import { loadCombatHistory } from './combatHistory.js';
import { adaptiveCombatDifficulty } from './combatAdaptiveDifficulty.js';

// Estado persistente de un INTENTO Roguelike.
//
// La torre principal tiene diez pisos. Entre pisos se elige una mejora
// temporal; el piso 10 es el Rey Boss. Tras completarlo se puede seguir en
// infinito, pero el objetivo principal queda cumplido y registrado.

const KEY = 'chess-study-roguelike-run';
const BEST_FLOOR_KEY = 'chess-study-roguelike-best-floor';
const COMPLETED_KEY = 'chess-study-roguelike-tower-completed';

export const ROGUELIKE_TOWER_FLOORS = 10;

function defaultRun() {
  return {
    floor: 1,
    inRun: false,
    phase: 'idle',
    seed: null,
    mode: 'tower',
    perks: [],
    rewardChosenForFloor: null,
  };
}

function makeSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `${values[0].toString(36)}${values[1].toString(36)}`;
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

function normalizeRun(parsed) {
  const base = defaultRun();
  if (!parsed || typeof parsed !== 'object') return base;
  const floor = Math.max(1, Number.parseInt(parsed.floor, 10) || 1);
  const inRun = parsed.inRun === true;
  const allowedPhases = new Set(['battle', 'fighting', 'cleared', 'completed']);
  const phase = inRun ? (allowedPhases.has(parsed.phase) ? parsed.phase : 'battle') : 'idle';
  const seed = inRun ? String(parsed.seed || `legacy-${floor}`) : null;
  const mode = parsed.mode === 'endless' ? 'endless' : 'tower';
  const perks = Array.isArray(parsed.perks) ? parsed.perks.filter((id) => perkById(id)) : [];
  const rewardChosenForFloor = Number.isFinite(Number(parsed.rewardChosenForFloor))
    ? Number(parsed.rewardChosenForFloor)
    : null;
  return { floor, inRun, phase, seed, mode, perks, rewardChosenForFloor };
}

export function loadRun() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, KEY);
    if (!raw) return defaultRun();
    return normalizeRun(JSON.parse(raw));
  } catch {
    return defaultRun();
  }
}

function saveRun(run) {
  const normalized = normalizeRun(run);
  setProfileStorageItem(KEY, JSON.stringify(normalized));
  return normalized;
}

export function startNewRun(seed = makeSeed()) {
  return saveRun({ ...defaultRun(), floor: 1, inRun: true, phase: 'battle', seed: String(seed) });
}

export function markBattleStarted(run) {
  if (!run?.inRun || run.phase !== 'battle') return run;
  return saveRun({ ...run, phase: 'fighting' });
}

export function recoverInterruptedRun(run) {
  if (!run?.inRun || run.phase !== 'fighting') return run;
  return saveRun({ ...run, phase: 'battle' });
}

export function markFloorCleared(run) {
  if (!run?.inRun || run.phase === 'cleared' || run.phase === 'completed') return run;
  if (run.phase !== 'fighting') return run;
  return saveRun({ ...run, phase: 'cleared', rewardChosenForFloor: null });
}

export function chooseRunReward(run, perkId) {
  if (!run?.inRun || run.phase !== 'cleared' || !perkById(perkId)) return run;
  if (run.rewardChosenForFloor === run.floor) return run;
  return saveRun({
    ...run,
    perks: [...(run.perks || []), perkId],
    rewardChosenForFloor: run.floor,
  });
}

export function advanceFloor(run) {
  if (!run?.inRun || run.phase !== 'cleared') return run;
  // En la torre y en infinito, superar un piso implica elegir su recompensa
  // antes de seguir. El boss final se gestiona como `completed`, no llega acá.
  if (run.rewardChosenForFloor !== run.floor) return run;
  return saveRun({ ...run, floor: run.floor + 1, phase: 'battle', rewardChosenForFloor: null });
}

export function completeTower(run) {
  if (!run?.inRun || run.floor !== ROGUELIKE_TOWER_FLOORS || run.phase !== 'fighting') return run;
  setProfileStorageItem(COMPLETED_KEY, '1');
  if (run.floor > loadBestFloor()) setProfileStorageItem(BEST_FLOOR_KEY, String(run.floor));
  return saveRun({ ...run, phase: 'completed' });
}

export function continueIntoEndless(run) {
  if (!run?.inRun || run.phase !== 'completed') return run;
  return saveRun({ ...run, mode: 'endless', floor: ROGUELIKE_TOWER_FLOORS + 1, phase: 'battle', rewardChosenForFloor: null });
}

export function loadTowerCompleted() {
  return getStorageItem(STORAGE_LOCAL, COMPLETED_KEY) === '1';
}

export function endRun(run) {
  const reached = Math.max(1, Number(run?.floor) || 1);
  if (reached > loadBestFloor()) setProfileStorageItem(BEST_FLOOR_KEY, String(reached));
  saveRun(defaultRun());
  return reached;
}

export function loadBestFloor() {
  const raw = getStorageItem(STORAGE_LOCAL, BEST_FLOOR_KEY);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function resetRoguelikeRun() {
  removeProfileStorageItem(KEY);
  removeProfileStorageItem(BEST_FLOOR_KEY);
  removeProfileStorageItem(COMPLETED_KEY);
}

// Curva deliberadamente más amable que la anterior. El usuario ya llega al
// boss con nueve batallas y perks encima; no hace falta convertir el piso 10
// en Stockfish con resaca. En infinito sí sigue escalando hasta 95. La forma
// reciente de Combat puede rebajar sólo la SIGUIENTE batalla; nunca sube la
// curva y nunca cambia la fuerza de la CPU a mitad de partida.
export function difficultyForFloor(floor, combatHistory = loadCombatHistory()) {
  const f = Math.max(1, Number(floor) || 1);
  const base = f <= ROGUELIKE_TOWER_FLOORS
    ? Math.min(60, 20 + f * 4) // 24..60
    : Math.min(95, 60 + (f - ROGUELIKE_TOWER_FLOORS) * 3);
  return adaptiveCombatDifficulty(base, combatHistory).adjusted;
}
