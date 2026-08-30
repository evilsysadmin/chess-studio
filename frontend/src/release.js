import { normalizeBuildSha } from './releaseManifest.js';

export const APP_RELEASE = 'v16.6dm46zfrp';

// Vite replaces this free constant in browser builds. `typeof` keeps the same
// module safely importable from Playwright/Node, where no build injection
// exists. Local/dev therefore falls back to the human release label.
const injectedBuildId = typeof __CHESS_BUILD_ID__ !== 'undefined' ? __CHESS_BUILD_ID__ : '';
export const APP_BUILD_ID = normalizeBuildSha(injectedBuildId) || APP_RELEASE;
