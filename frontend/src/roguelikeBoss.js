// roguelikeBoss.js — Mecánica experimental de HP SOLO para el Rey Boss.
// El resto de piezas conserva 1 captura = fuera. No hay HP generalizado.

export const ROGUELIKE_BOSS_FLOOR = 10;
export const ROGUELIKE_BOSS_MAX_HP = 5;

export const ROGUELIKE_BOSS = {
  id: 'old_king',
  label: 'El Rey Viejo',
  description: 'Jefe final. Su rey tiene 5 HP: cada jaque le quita 1; un jaque mate le quita 2 y rompe la fase. A 0 HP, el intento está completado.',
  maxHp: ROGUELIKE_BOSS_MAX_HP,
};

// Se llama DESPUÉS de una jugada humana ya aplicada. `chessAfter.turn()` es
// el bando que debe responder; por tanto sólo hacemos daño si le toca a la
// CPU y su rey está en jaque.
export function bossDamageAfterHumanMove(chessAfter, humanColor) {
  if (!chessAfter || chessAfter.turn() === humanColor || !chessAfter.inCheck()) return 0;
  return chessAfter.isCheckmate() ? 2 : 1;
}

export function bossPhaseForHp(hp, maxHp = ROGUELIKE_BOSS_MAX_HP) {
  const value = Math.max(0, Number(hp) || 0);
  if (value <= 1) return 3;
  if (value <= Math.ceil(maxHp * 0.6)) return 2;
  return 1;
}
