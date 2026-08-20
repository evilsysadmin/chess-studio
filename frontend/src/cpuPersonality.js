import { setProfileStorageItem } from './profileKeys.js';

const KEY = 'chess-study-cpu-personality';

export const CPU_PERSONALITIES = [
  { id: 'bco', name: 'BCO', short: 'Sin piedad', glyph: '☠', idle: 'Observando en silencio. De momento.' },
  { id: 'gentleman', name: 'Caballero', short: 'Educado', glyph: '♞', idle: 'Será un placer cruzar piezas contigo.' },
  { id: 'master', name: 'Maestro amargado', short: 'Vieja escuela', glyph: '♜', idle: 'He visto aperturas mejores en servilletas de bar.' },
  { id: 'hal', name: 'HAL 64', short: 'Clínico', glyph: '◉', idle: 'Todos los sistemas tácticos están operativos.' },
  { id: 'caster', name: 'Comentarista', short: 'Retransmisión', glyph: '♬', idle: 'Tablero preparado. Empieza la retransmisión.' },
];

export function loadCpuPersonality() {
  const id = localStorage.getItem(KEY) || 'bco';
  return CPU_PERSONALITIES.some((p) => p.id === id) ? id : 'bco';
}

export function saveCpuPersonality(id) {
  const safe = CPU_PERSONALITIES.some((p) => p.id === id) ? id : 'bco';
  setProfileStorageItem(KEY, safe);
  return safe;
}

export function cpuPersonalityById(id) {
  return CPU_PERSONALITIES.find((p) => p.id === id) || CPU_PERSONALITIES[0];
}
