// Combat Chess campaign bosses. Each campaign deterministically picks one
// boss from the seed. Mechanics stay deliberately small and legible: one
// visible rule per king, no hidden move scripting and no general piece HP.

export const CAMPAIGN_BOSSES = Object.freeze([
  Object.freeze({
    id: 'iron_king',
    label: 'El Rey de Hierro',
    shortLabel: 'Rey de Hierro',
    spriteId: 'iron',
    maxHp: 6,
    checkDamage: 1,
    mateDamage: 2,
    difficultyDelta: 4,
    mechanicLabel: 'Bastión',
    mechanicDescription: 'Seis HP. Aguanta un castigo extra: cada jaque quita 1 HP y el mate quita 2.',
    description: 'Un rey blindado y lento de quebrar. Su ventaja es simple: resistencia.',
  }),
  Object.freeze({
    id: 'nomad_king',
    label: 'El Rey Nómada',
    shortLabel: 'Rey Nómada',
    spriteId: 'nomad',
    maxHp: 5,
    checkDamage: 1,
    mateDamage: 3,
    difficultyDelta: 6,
    mechanicLabel: 'Golpe decisivo',
    mechanicDescription: 'Cinco HP. Los jaques quitan 1 HP, pero un mate bien construido arranca 3 HP.',
    description: 'Menos blindaje que Hierro, pero exige rematar bien las posiciones.',
  }),
  Object.freeze({
    id: 'shadow_king',
    label: 'El Rey Sombra',
    shortLabel: 'Rey Sombra',
    spriteId: 'shadow',
    maxHp: 4,
    checkDamage: 1,
    mateDamage: 2,
    difficultyDelta: 10,
    mechanicLabel: 'Presión',
    mechanicDescription: 'Sólo cuatro HP, pero dirige la fuerza rival con +10 de dificultad estratégica.',
    description: 'Cae antes si lo alcanzas. El problema es llegar hasta él.',
  }),
]);

const BOSS_BY_ID = Object.fromEntries(CAMPAIGN_BOSSES.map((boss) => [boss.id, boss]));

function hash32(value) {
  let h = 2166136261;
  for (const char of String(value || 'campaign')) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function campaignBossForSeed(seed) {
  return CAMPAIGN_BOSSES[hash32(seed) % CAMPAIGN_BOSSES.length];
}

export function campaignBossById(id) {
  return BOSS_BY_ID[id] || null;
}
