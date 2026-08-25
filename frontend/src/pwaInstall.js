export const PWA_INSTALL_AVAILABLE_EVENT = 'chess-studio-pwa-install-available';
let deferredInstallPrompt = null;

export function installChessStudioPwa() {
  if (typeof window === 'undefined') return;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}), { once: true });
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
