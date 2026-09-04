export const USER_RELEASE_NOTES_KEY = 'chess-study-user-release-notes-seen';

let releaseNotesPromise = null;

export function loadUserReleaseNotes() {
  if (!releaseNotesPromise) {
    releaseNotesPromise = import('./userReleaseNotesData.js')
      .then((module) => module.USER_RELEASE_NOTES)
      .catch((error) => {
        releaseNotesPromise = null;
        throw error;
      });
  }
  return releaseNotesPromise;
}
