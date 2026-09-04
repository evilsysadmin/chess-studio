import { lazy } from 'react';
import { registerBoard3D } from './boardRendererRegistry.js';

// App bootstrap owns the lazy 3D registration. Board consumes the registered
// renderer without importing it, which keeps the WebGL fallback acyclic:
// Board3D -> Board (fallback) -> registry, never Board -> Board3D.
registerBoard3D(lazy(() => import('./Board3D.jsx')));
