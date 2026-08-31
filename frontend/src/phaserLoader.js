const PHASER_3_90_CDN = 'https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js';

let phaserPromise = null;

function existingPhaser() {
  return typeof window !== 'undefined' ? window.Phaser || null : null;
}

export function loadPhaser3() {
  const ready = existingPhaser();
  if (ready) return Promise.resolve(ready);
  if (phaserPromise) return phaserPromise;
  if (typeof document === 'undefined') return Promise.reject(new Error('Phaser requires a browser'));

  phaserPromise = new Promise((resolve, reject) => {
    const previous = document.querySelector('script[data-chess-studio-phaser="3.90.0"]');
    if (previous) {
      previous.addEventListener('load', () => resolve(existingPhaser()), { once: true });
      previous.addEventListener('error', () => reject(new Error('Phaser CDN failed')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = PHASER_3_90_CDN;
    script.async = true;
    script.dataset.chessStudioPhaser = '3.90.0';
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', () => {
      const Phaser = existingPhaser();
      if (Phaser) resolve(Phaser);
      else reject(new Error('Phaser loaded without global'));
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('Phaser CDN failed')), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    phaserPromise = null;
    throw error;
  });

  return phaserPromise;
}

export const PHASER_TRAILBLAZER_VERSION = '3.90.0';
