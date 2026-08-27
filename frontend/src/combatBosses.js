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
    rookShield: true,
    difficultyDelta: 4,
    mechanicLabel: 'Bastión de torres',
    mechanicDescription: 'Mientras conserve una torre, un jaque normal no daña y el mate sólo arranca 1 HP. Sin torres: jaque 1, mate 2.',
    description: 'Primero desmonta su fortaleza. Después el rey empieza a sangrar HP con normalidad.',
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
    description: 'Premia preparar el remate: perseguir jaques sin plan es bastante menos eficiente.',
  }),
  Object.freeze({
    id: 'shadow_king',
    label: 'El Rey Sombra',
    shortLabel: 'Rey Sombra',
    spriteId: 'shadow',
    maxHp: 4,
    checkDamage: 2,
    mateDamage: 2,
    difficultyDelta: 10,
    mechanicLabel: 'Rey expuesto',
    mechanicDescription: 'Sólo cuatro HP y cada jaque arranca 2. A cambio, su ejército pelea con +10 de dificultad estratégica.',
    description: 'Es frágil cuando lo alcanzas; su escolta es el verdadero muro.',
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
