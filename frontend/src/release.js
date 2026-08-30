import { normalizeBuildSha } from './releaseManifest.js';

export const APP_RELEASE = 'v16.6dm46zfrp';

// Human-facing releases can span several small deploys. Update discovery must
// distinguish those deploys, so Pages injects the tested commit SHA at build
// time. Local/dev builds deliberately fall back to the human release label.
export const APP_BUILD_ID = normalizeBuildSha(import.meta.env?.VITE_BUILD_SHA) || APP_RELEASE;
