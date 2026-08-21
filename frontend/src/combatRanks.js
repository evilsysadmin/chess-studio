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
