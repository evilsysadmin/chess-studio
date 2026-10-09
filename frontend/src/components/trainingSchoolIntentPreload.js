import { getBoardRenderer } from '../userPreferences.js';
import { prefetchTutorialRoute } from '../tutorialRoute.js';
import { preloadBoard3DRenderer } from './Board3DRegistration.js';

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

export function shouldPreloadTrainingSchoolOnIntent({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  navigatorRef = globalThis.navigator,
} = {}) {
  if (!windowRef || !documentRef) return false;
  if (documentRef.visibilityState === 'hidden') return false;

  const connection = navigatorRef?.connection;
  if (connection?.saveData) return false;
  if (SLOW_EFFECTIVE_TYPES.has(String(connection?.effectiveType || '').toLowerCase())) return false;
  return true;
}

export async function preloadTrainingSchoolOnIntent({
  boardRenderer = getBoardRenderer(),
  loadSchoolRoomModule = () => import('./SchoolRoomClassicShell.js'),
  ...policyOptions
} = {}) {
  if (!shouldPreloadTrainingSchoolOnIntent(policyOptions)) return false;

  const jobs = [prefetchTutorialRoute()];
  if (boardRenderer === '3d') {
    jobs.push(preloadBoard3DRenderer(), loadSchoolRoomModule());
  }

  const [routeResult] = await Promise.allSettled(jobs);
  return routeResult.status === 'fulfilled' && routeResult.value !== false;
}
