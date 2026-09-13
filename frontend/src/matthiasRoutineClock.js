export function msUntilNextLocalHour(now = new Date()) {
  const currentMs = Number(now?.getTime?.());
  if (!Number.isFinite(currentMs)) return 60_000;

  const next = new Date(currentMs);
  next.setMinutes(60, 0, 0);
  const delay = next.getTime() - currentMs;
  return Number.isFinite(delay) && delay > 0 ? delay : 60_000;
}
