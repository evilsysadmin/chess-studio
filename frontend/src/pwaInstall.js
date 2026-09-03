import { APP_BUILD_ID } from './release.js';

export const PWA_INSTALL_AVAILABLE_EVENT = 'chess-studio-pwa-install-available';
let deferredInstallPrompt = null;

export function serviceWorkerRegistrationUrl(baseUrl = import.meta.env.BASE_URL, buildId = APP_BUILD_ID) {
  const base = String(baseUrl || './');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const build = String(buildId || 'unknown').trim() || 'unknown';
  return `${normalizedBase}sw.js?build=${encodeURIComponent(build)}`;
}

export function installChessStudioPwa() {
  if (typeof window === 'undefined') return;
  if ('serviceWorker' in navigator) {
    // sw.js vive en public y su contenido no cambia necesariamente en cada release.
    // Versionar la URL de registro con el build obliga al navegador a instalar una
    // revisión nueva y refrescar el shell offline en cada deploy, sin acoplar el
    // nombre interno de la caché a la versión humana de Chess Studio.
    window.addEventListener('load', () => navigator.serviceWorker.register(serviceWorkerRegistrationUrl()).catch(() => {}), { once: true });
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    window.dispatchEvent(new Event(PWA_INSTALL_AVAILABLE_EVENT));
  });
  window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; });
}

export function canInstallChessStudio() {
  return Boolean(deferredInstallPrompt);
}

export async function promptChessStudioInstall() {
  if (!deferredInstallPrompt) return false;
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice?.outcome === 'accepted';
}
