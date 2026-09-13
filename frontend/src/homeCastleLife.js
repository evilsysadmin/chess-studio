function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function localDaySignature(now = new Date()) {
  const year = Number(now?.getFullYear?.());
  const month = Number(now?.getMonth?.());
  const day = Number(now?.getDate?.());
  if (![year, month, day].every(Number.isFinite)) return null;
  return (year * 372) + ((month + 1) * 31) + day;
}

export function homeCastleAmbient(now = new Date()) {
  const hour = Number(now?.getHours?.());
  if (!Number.isFinite(hour)) return 'day';
  if (hour >= 5 && hour < 10) return 'dawn';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'dusk';
  return 'night';
}

export function homeCastleMemory(rivalry = {}) {
  const record = rivalry?.record || {};
  const bestHumanStreak = finiteNonNegative(record.bestHumanStreak);
  const wins = finiteNonNegative(record.wins);

  if (bestHumanStreak >= 5) {
    return {
      id: 'rivalry-streak',
      kind: 'standard',
      destination: 'history',
      title: 'Estandarte de la racha',
      detail: `Récord real: ${bestHumanStreak} victorias seguidas contra Matthias.`,
    };
  }

  if (wins >= 10) {
    return {
      id: 'rivalry-wins',
      kind: 'trophy',
      destination: 'history',
      title: 'Trofeo de rivalidad',
      detail: `${wins} victorias registradas contra Matthias.`,
    };
  }

  return null;
}

export function homeCastleDailyMemory(dailyStats = {}) {
  const bestStreak = finiteNonNegative(dailyStats?.bestStreak);
  if (bestStreak < 7) return null;
  return {
    id: 'daily-streak',
    kind: 'daily-seal',
    destination: 'daily',
    title: 'Sello de constancia',
    detail: `Mejor racha real del Desafío diario: ${bestStreak} días.`,
  };
}

export function homeCastlePrecisionMemory(dailyStats = {}) {
  const cleanFullDays = finiteNonNegative(dailyStats?.cleanFullDays);
  if (cleanFullDays < 3) return null;
  return {
    id: 'daily-clean-full',
    kind: 'precision-relic',
    destination: 'daily',
    title: 'Medallón de precisión',
    detail: `${cleanFullDays} plenos diarios 3/3 resueltos sin una sola mancha.`,
  };
}

export function homeCastleMemories({ rivalry = {}, dailyStats = {} } = {}) {
  return [
    homeCastleMemory(rivalry),
    homeCastleDailyMemory(dailyStats),
    homeCastlePrecisionMemory(dailyStats),
  ].filter(Boolean).slice(0, 3);
}

export function homeCastleRareSighting(now = new Date()) {
  const daySignature = localDaySignature(now);
  if (daySignature === null) return null;

  // Determinista por fecha local: aproximadamente un día de cada 47.
  // No hay RNG por render, timers de elegibilidad ni estado persistido.
  return daySignature % 47 === 0 ? 'gallery-glint' : null;
}

export function homeMatthiasRareMoment(rivalry = {}, now = new Date()) {
  const hour = Number(now?.getHours?.());
  const losses = finiteNonNegative(rivalry?.record?.losses);
  const daySignature = localDaySignature(now);
  if (!Number.isFinite(hour) || hour < 6 || daySignature === null) return null;

  // Nada de expedientes inventados: este momento sólo existe si hay al menos
  // una derrota humana realmente registrada contra Matthias.
  if (losses >= 1 && daySignature % 37 === 11) {
    return {
      id: 'loss-dossier',
      kind: 'loss-dossier',
      visualKey: 'dossier',
      label: 'Revisando viejas heridas',
      detail: losses === 1
        ? '1 derrota tuya registrada contra Matthias.'
        : `${losses} derrotas tuyas registradas contra Matthias.`,
      zone: 'desk',
    };
  }

  // Rareza puramente ambiental: un día concreto puede vencerle el manual.
  // Sólo ocurre a horas razonables de lectura y es estable durante todo el día.
  if (hour >= 12 && hour < 19 && daySignature % 43 === 17) {
    return {
      id: 'book-doze-sleep',
      kind: 'book-doze',
      visualKey: 'reading',
      label: 'Dormido sobre el manual',
      detail: 'La teoría ha ganado esta ronda.',
      zone: 'library',
    };
  }

  return null;
}

export function buildHomeCastleLife({ rivalry = {}, dailyStats = {}, now = new Date() } = {}) {
  const memories = homeCastleMemories({ rivalry, dailyStats });
  return {
    ambient: homeCastleAmbient(now),
    memory: memories[0] || null,
    memories,
    rareSighting: homeCastleRareSighting(now),
    matthiasMoment: homeMatthiasRareMoment(rivalry, now),
  };
}
