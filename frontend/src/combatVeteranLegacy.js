import { unitDecorations } from './combatUnitService.js';

function n(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function latestDecoration(record) {
  const rows = unitDecorations(record)
    .filter((medal) => medal.earnedAt)
    .sort((a, b) => new Date(b.earnedAt || 0) - new Date(a.earnedAt || 0));
  return rows[0] || null;
}

export function veteranLegacy(record) {
  const stats = record?.stats || {};
  const battles = n(stats.battles);
  const survivals = n(stats.survivals);
  const kills = n(stats.kills);
  const bossVictories = n(stats.bossVictories);
  const bossFinishes = n(stats.bossFinishes);
  const revives = n(stats.revives);
  const bestSurvivalStreak = n(stats.bestSurvivalStreak);
  const medals = unitDecorations(record);

  let title = 'Sin bautismo de fuego';
  let reason = 'Todavía no hay servicio de campaña suficiente para construir una leyenda.';

  if (bossFinishes > 0) {
    title = 'Verdugo de jefe';
    reason = `Remató ${bossFinishes} jefe${bossFinishes === 1 ? '' : 's'} en combate.`;
  } else if (bossVictories >= 2) {
    title = 'Cazajefes';
    reason = `Sobrevivió a ${bossVictories} victorias contra jefes.`;
  } else if (kills >= 10) {
    title = 'As de combate';
    reason = `Acumula ${kills} bajas enemigas confirmadas.`;
  } else if (bestSurvivalStreak >= 5) {
    title = 'Vieja guardia';
    reason = `Encadenó ${bestSurvivalStreak} batallas consecutivas sobreviviendo.`;
  } else if (revives > 0) {
    title = 'Volvió al frente';
    reason = `Ha sido revivido ${revives} ${revives === 1 ? 'vez' : 'veces'} sin perder su identidad.`;
  } else if (battles >= 10) {
    title = 'Veterano de campaña';
    reason = `${battles} batallas registradas y ${survivals} supervivencias.`;
  } else if (battles > 0) {
    title = 'Bautizado en combate';
    reason = `${battles} batalla${battles === 1 ? '' : 's'} · ${survivals} supervivencia${survivals === 1 ? '' : 's'} · ${kills} bajas.`;
  }

  return {
    title,
    reason,
    battles,
    survivals,
    kills,
    medals: medals.length,
    latestDecoration: latestDecoration(record),
  };
}
