import { lazy } from 'react';
import { registerBoard3D } from './boardRendererRegistry.js';

// Register the renderer without downloading it. Home and login must not pay the
// Three/WebGL download + parse cost merely because the browser became idle;
// the first real 3D board mount remains the deliberate loading boundary.
const loadBoard3D = () => import('./Board3D.jsx');

registerBoard3D(lazy(loadBoard3D));
