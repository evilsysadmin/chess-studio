import { lazy } from 'react';
import { createPrefetchableRoute } from './prefetchableRoute.js';

const trainingRoomRoute = createPrefetchableRoute(() => import('./components/PuzzleScreen.jsx'));

export const TrainingRoomRoute = lazy(trainingRoomRoute.load);
export const prefetchTrainingRoomRoute = trainingRoomRoute.prefetch;
