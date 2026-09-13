export function chroniclesPartyCondition(member) {
  const hp = Number(member?.hp || 0);
  const maxHp = Math.max(1, Number(member?.maxHp || 1));
  if (hp <= 0) return 'down';
  const ratio = hp / maxHp;
  if (ratio <= 0.33) return 'critical';
  if (ratio <= 0.66) return 'worn';
  return 'fresh';
}
