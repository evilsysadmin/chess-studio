// roguelikePerks.js — Mejoras TEMPORALES de un intento Roguelike.
//
// Viven únicamente dentro de `roguelikeRun`: jamás se escriben en el roster
// permanente. Para conseguirlo no tocamos `strengthPoints/speedPoints`; se
// aplican como `runStrengthBonus/runSpeedBonus`, campos que combatRoster
// ignora al guardar supervivientes.

export const ROGUELIKE_PERKS = [
  {
    id: 'steel_pulse',
    label: 'Pulso de acero',
    description: '+0,75 Fuerza a todas tus piezas (salvo el rey) durante este intento.',
  },
  {
    id: 'silk_shoes',
    label: 'Zapatos de seda',
    description: '+2 Velocidad a todas tus piezas (salvo el rey) durante este intento.',
  },
  {
    id: 'pawn_union',
    label: 'Sindicato de peones',
    description: '+1,5 Fuerza a todos tus peones durante este intento.',
  },
  {
    id: 'cavalry_instinct',
    label: 'Instinto de caballería',
    description: '+5 Velocidad a tus caballos durante este intento.',
  },
  {
    id: 'rook_pressure',
    label: 'Torres de presión',
    description: '+1,5 Fuerza a tus torres durante este intento.',
  },
  {
    id: 'bishop_footwork',
    label: 'Alfiles con oficio',
    description: '+4 Velocidad a tus alfiles durante este intento.',
  },
];

const BY_ID = Object.fromEntries(ROGUELIKE_PERKS.map((perk) => [perk.id, perk]));

function hash32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Devuelve tres opciones estables para seed+piso. No usamos Math.random en
// render: refrescar no cambia el premio que te tocó.
export function rewardOptionsForFloor(seed, floor) {
  const pool = [...ROGUELIKE_PERKS];
  let state = hash32(`${String(seed || 'run')}:reward:${Math.max(1, Number(floor) || 1)}`) || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export function perkById(id) {
  return BY_ID[id] || null;
}

function perkStacks(perks = []) {
  const stacks = {};
  for (const id of perks) stacks[id] = (stacks[id] || 0) + 1;
  return stacks;
}

export function applyRunPerksToRegistry(registry, perks = [], humanColor = 'w') {
  const stacks = perkStacks(perks);
  const next = {};
  for (const [square, piece] of Object.entries(registry || {})) {
    if (piece.color !== humanColor || piece.type === 'k') {
      next[square] = piece;
      continue;
    }
    // Cada fuente temporal conserva su identidad. La especialidad del
    // mercenario es la base operacional y los perks de campaña se calculan
    // encima en cada aplicación; así no se duplican si una fase de boss vuelve
    // a construir el registro y ninguno de estos bonus se confunde con nivel.
    let strength = Number(piece.mercenaryStrengthBonus) || 0;
    let speed = Number(piece.mercenarySpeedBonus) || 0;
    strength += (stacks.steel_pulse || 0) * 0.75;
    speed += (stacks.silk_shoes || 0) * 2;
    if (piece.type === 'p') strength += (stacks.pawn_union || 0) * 1.5;
    if (piece.type === 'n') speed += (stacks.cavalry_instinct || 0) * 5;
    if (piece.type === 'r') strength += (stacks.rook_pressure || 0) * 1.5;
    if (piece.type === 'b') speed += (stacks.bishop_footwork || 0) * 4;
    next[square] = { ...piece, runStrengthBonus: strength, runSpeedBonus: speed };
  }
  return next;
}
