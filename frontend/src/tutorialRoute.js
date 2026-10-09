import { lazy } from 'react';
import { createPrefetchableRoute } from './prefetchableRoute.js';

const tutorialRoute = createPrefetchableRoute(() => import('./components/Tutorial.jsx'));

export const TutorialRoute = lazy(tutorialRoute.load);
export const prefetchTutorialRoute = tutorialRoute.prefetch;
