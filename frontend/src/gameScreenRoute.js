import { lazy } from 'react';
import { createPrefetchableRoute } from './prefetchableRoute.js';

const gameScreenRoute = createPrefetchableRoute(() => import('./components/GameScreen.jsx'));

export const GameScreenRoute = lazy(gameScreenRoute.load);
export const prefetchGameScreenRoute = gameScreenRoute.prefetch;
