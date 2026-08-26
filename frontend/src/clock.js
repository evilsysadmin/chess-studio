// clock.js — Utilidades puras del reloj de ajedrez. El reloj es enteramente
// del lado del cliente (no vive en el backend): esto es una app casual sin
// anti-trampas, así que no hace falta que el servidor arbitre el tiempo —
// alcanza con que el navegador lleve la cuenta y declare la bandera caída.

export const TIME_CONTROLS = [
  { id: 'none', label: 'Sin reloj', initial: null, increment: 0 },
  { id: '1+0', label: '1 min · Bullet', initial: 60, increment: 0 },
  { id: '3+2', label: '3 min + 2s', initial: 180, increment: 2 },
  { id: '5+0', label: '5 min', initial: 300, increment: 0 },
  { id: '10+0', label: '10 min', initial: 600, increment: 0 },
  { id: '15+10', label: '15 min + 10s', initial: 900, increment: 10 },
];

export function timeControlById(id) {
  return TIME_CONTROLS.find((tc) => tc.id === id) || TIME_CONTROLS[0];
}

// Formatea segundos como "m:ss" (o "h:mm:ss" si pasa de una hora, por las
// dudas con controles largos). Nunca muestra negativo: si ya se acabó, 0:00.
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}


// Resultado reglamentario cuando cae una bandera. El servidor adjunta si
// cada color tiene material insuficiente para dar mate en la posición actual.
// Si el bando que aún conserva tiempo no puede dar mate, es tablas.
export function flagOutcome(flagColor, humanColor, insufficientMatingMaterial = {}) {
  if (flagColor !== 'w' && flagColor !== 'b') return null;
  const survivingColor = flagColor === 'w' ? 'b' : 'w';
  if (insufficientMatingMaterial?.[survivingColor]) return 'draw';
  return flagColor === humanColor ? 'loss' : 'win';
}

export function flagPgnResult(flagColor, insufficientMatingMaterial = {}) {
  if (flagColor !== 'w' && flagColor !== 'b') return '*';
  const survivingColor = flagColor === 'w' ? 'b' : 'w';
  if (insufficientMatingMaterial?.[survivingColor]) return '1/2-1/2';
  return flagColor === 'w' ? '0-1' : '1-0';
}
