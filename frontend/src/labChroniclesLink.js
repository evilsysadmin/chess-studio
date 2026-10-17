// Chronicles of Matthias now lives in its own repo and on its own domain
// (evilsysadmin/chronicles-of-matthias). The Lab portals open that site
// instead of mounting the copy that used to ship inside Chess Studio, so the
// player always gets the current version. Tactics opens on its #tactics hash.
//
// `VITE_CHRONICLES_URL` points at production once it is live; until then the
// default is the dedicated staging site.
export const CHRONICLES_STANDALONE_DEFAULT_URL = 'https://staging.chronicles.shadowops.dpdns.org/';

function baseUrl(env) {
  const configured = typeof env?.VITE_CHRONICLES_URL === 'string' ? env.VITE_CHRONICLES_URL.trim() : '';
  try {
    const url = new URL(configured || CHRONICLES_STANDALONE_DEFAULT_URL);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('insecure');
    url.hash = '';
    return url;
  } catch {
    return new URL(CHRONICLES_STANDALONE_DEFAULT_URL);
  }
}

export function chroniclesStandaloneUrl(mode = 'chronicles', env = import.meta.env) {
  const url = baseUrl(env);
  if (mode === 'chronicles-tactics') url.hash = 'tactics';
  return url.toString();
}

// A new tab keeps Chess Studio where the player left it. If the browser
// blocks the tab, navigate this one instead of doing nothing. ('noopener' in
// the features string makes window.open return null even on success, so the
// opener link is cut by hand.)
export function openChroniclesStandalone(mode = 'chronicles', { env = import.meta.env, win = globalThis.window } = {}) {
  const url = chroniclesStandaloneUrl(mode, env);
  const opened = win?.open?.(url, '_blank');
  if (opened) {
    try { opened.opener = null; } catch { /* cross-origin already */ }
  } else if (win?.location) {
    win.location.assign(url);
  }
  return url;
}
