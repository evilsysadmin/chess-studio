// Rangos militares de CADA pieza veterana de Combate.
// Se derivan únicamente de su nivel real (puntos comprados): no son XP
// cosmética ni conceden estadísticas por sí mismos. A partir de Comandante
// una pieza puede ser elegible para metamorfosis en reglas Roguelike.

export const PIECE_RANKS = [
  { id: 'recruit', label: 'Recluta', short: 'REC', minLevel: 1 },
  { id: 'soldier', label: 'Soldado', short: 'SLD', minLevel: 2 },
  { id: 'corporal', label: 'Cabo', short: 'CBO', minLevel: 3 },
  { id: 'sergeant', label: 'Sargento', short: 'SGT', minLevel: 4 },
  { id: 'lieutenant', label: 'Teniente', short: 'TTE', minLevel: 5 },
  { id: 'captain', label: 'Capitán', short: 'CAP', minLevel: 6 },
  { id: 'commander', label: 'Comandante', short: 'CMD', minLevel: 8 },
  { id: 'colonel', label: 'Coronel', short: 'COL', minLevel: 10 },
  { id: 'general', label: 'General', short: 'GEN', minLevel: 12 },
];

export const METAMORPHOSIS_MIN_RANK_ID = 'commander';

// Insignia compacta para UI. Cada rango usa una silueta propia para que
// se identifique de un vistazo incluso sobre una casilla pequeña. Las formas
// se inspiran en familias de insignias militares (chevrón, escudo, barras,
// hoja, águila y estrella) sin copiar un ejército concreto. No cambian reglas.
const PIECE_RANK_INSIGNIA = {
  recruit: { icon: 'none', family: 'none' },
  soldier: { icon: 'diamond', family: 'enlisted' },
  corporal: { icon: 'chevron', family: 'nco' },
  sergeant: { icon: 'shield', family: 'nco' },
  lieutenant: { icon: 'bar', family: 'officer' },
  captain: { icon: 'double-bar', family: 'officer' },
  commander: { icon: 'leaf', family: 'senior' },
  colonel: { icon: 'eagle', family: 'senior' },
  general: { icon: 'star', family: 'general' },
};

export function pieceRankInsignia(rankOrLevel) {
  const rank = typeof rankOrLevel === 'object' && rankOrLevel?.id
    ? rankOrLevel
    : pieceRankForLevel(rankOrLevel);
  const visual = PIECE_RANK_INSIGNIA[rank.id] || PIECE_RANK_INSIGNIA.recruit;
  return { ...visual, rankId: rank.id, label: rank.label, short: rank.short };
}

export function pieceRankTooltip(rankOrLevel) {
  const rank = typeof rankOrLevel === 'object' && rankOrLevel?.id
    ? rankOrLevel
    : pieceRankForLevel(rankOrLevel);
  const index = PIECE_RANKS.findIndex((candidate) => candidate.id === rank.id);
  const next = PIECE_RANKS[index + 1] || null;
  const upperLevel = next ? next.minLevel - 1 : null;
  const levelRange = upperLevel && upperLevel > rank.minLevel
    ? `niveles ${rank.minLevel}–${upperLevel}`
    : upperLevel === rank.minLevel
      ? `nivel ${rank.minLevel}`
      : `nivel ${rank.minLevel}+`;
  const family = rank.minLevel >= 12
    ? 'mando superior'
    : rank.minLevel >= 8
      ? 'mando'
      : rank.minLevel >= 5
        ? 'oficial'
        : rank.minLevel >= 3
          ? 'suboficial'
          : 'tropa';

  const lines = [
    `${rank.label} · rango ${index + 1}/${PIECE_RANKS.length}`,
    `${levelRange} · ${family}`,
  ];

  if (rank.id === METAMORPHOSIS_MIN_RANK_ID) {
    lines.push('Primer rango elegible para metamorfosis; las formas exigen además méritos de servicio.');
  } else if (rank.minLevel < 8) {
    lines.push('La metamorfosis empieza en Comandante (nivel 8).');
  } else if (rank.id === 'general') {
    lines.push('Rango máximo de una unidad veterana.');
  } else {
    lines.push('Rango veterano: las metamorfosis disponibles dependen también del historial de servicio.');
  }

  if (next) lines.push(`Siguiente: ${next.label} · nivel ${next.minLevel}.`);
  return lines.join('\n');
}


export function pieceRankForLevel(level) {
  const normalized = Math.max(1, Math.floor(Number(level) || 1));
  let rank = PIECE_RANKS[0];
  for (const candidate of PIECE_RANKS) {
    if (normalized >= candidate.minLevel) rank = candidate;
  }
  return rank;
}

export function pieceRankAtLeast(level, rankId) {
  const target = PIECE_RANKS.find((rank) => rank.id === rankId);
  if (!target) return false;
  return Math.max(1, Math.floor(Number(level) || 1)) >= target.minLevel;
}
