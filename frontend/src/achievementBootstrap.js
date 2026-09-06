// App only needs a fire-and-forget reconciliation when the coarse view changes.
// Keep the synchronous achievement evaluator in its feature chunks instead of
// pulling its tournament/rating/Combat/puzzle dependencies into bootstrap.
export function scheduleAchievementCheck() {
  return import('./achievements.js')
    .then(({ checkAchievements }) => checkAchievements())
    .catch(() => null);
}
