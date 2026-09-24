export const USER_RELEASE_NOTES_KEY = 'chess-study-user-release-notes-seen';

// The «Nuevo» badge is driven by the newest note, not by the build number: it lights up when
// there is something new to read and only then. Keep this in sync with the first entry of
// userReleaseNotesData.js (a unit test enforces it). It lives here, not in the data file,
// so the shell does not have to download the notes just to decide whether to show a badge.
export const LATEST_USER_NOTE_ID = '2026-09-24-novedades';

let releaseNotesPromise = null;
let archivePromise = null;

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

export function loadUserReleaseArchive() {
  if (!archivePromise) {
    archivePromise = import('./userReleaseNotesArchive.js')
      .then((module) => module.USER_RELEASE_NOTES)
      .catch((error) => {
        archivePromise = null;
        throw error;
      });
  }
  return archivePromise;
}
