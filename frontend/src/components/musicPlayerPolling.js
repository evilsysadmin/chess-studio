export const MUSIC_PLAYER_PROGRESS_POLL_MS = 250;

export function musicPlayerShouldPollProgress({
  expanded = false,
  forceExpanded = false,
  documentVisible = true,
} = {}) {
  return Boolean((expanded || forceExpanded) && documentVisible);
}
