function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
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
      kind: 'standard',
      title: 'Estandarte de la racha',
      detail: `Récord real: ${bestHumanStreak} victorias seguidas contra Matthias.`,
    };
  }

  if (wins >= 10) {
    return {
      kind: 'trophy',
      title: 'Trofeo de rivalidad',
      detail: `${wins} victorias registradas contra Matthias.`,
    };
  }

  return null;
}

export function buildHomeCastleLife({ rivalry = {}, now = new Date() } = {}) {
  return {
    ambient: homeCastleAmbient(now),
    memory: homeCastleMemory(rivalry),
  };
}
