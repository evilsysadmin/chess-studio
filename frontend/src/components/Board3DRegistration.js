import { lazy } from 'react';
import { registerBoard3D } from './boardRendererRegistry.js';
import { shouldPrewarmBoard3D } from './board3DPrewarm.js';

// 3D is now the product default, so keep the renderer lazy for bootstrap but
// opportunistically warm its chunk once the browser has genuine idle time.
// Dynamic import is module-cached: if the user starts a game first, React.lazy
// wins the race; if Home/login is idle first, the War Room avoids paying the
// Three/WebGL download + parse cost on the click that should open the board.
const loadBoard3D = () => import('./Board3D.jsx');

registerBoard3D(lazy(loadBoard3D));

if (
  typeof window !== 'undefined'
  && typeof window.requestIdleCallback === 'function'
  && typeof navigator !== 'undefined'
  && navigator.connection?.saveData !== true
) {
  window.requestIdleCallback(() => {
    // A user who explicitly chose 2D already paid the preference cost. Respect
    // that choice even after reload instead of silently pulling Board3D during
    // idle time; this also keeps the lazy 3D failure/recovery path meaningful.
    if (!shouldPrewarmBoard3D()) return;

    loadBoard3D().catch(() => {
      // Prefetch is best-effort only. The normal React.lazy path remains the
      // source of truth and will surface a real loading error if one exists.
    });
  });
}
