import { lazy } from 'react';
import { createPrefetchableRoute } from './prefetchableRoute.js';

const quickMatchRoute = createPrefetchableRoute(() => import('./components/QuickMatchModal.jsx'));

export const QuickMatchReadyRoomRoute = lazy(quickMatchRoute.load);
export const prefetchQuickMatchReadyRoom = quickMatchRoute.prefetch;
