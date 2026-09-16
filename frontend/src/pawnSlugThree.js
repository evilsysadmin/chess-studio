// Stable compatibility facade. Runtime systems live in focused modules so this
// public entry point never becomes the Pawn Slug dumping ground again.
export { createPawnSlugRuntime as createPawnSlugGame } from './pawnSlugRuntime.js';
export {
  PAWN_SLUG_DEFAULT_STAGE_ID,
  PAWN_SLUG_DIRECTOR_SCHEMA_VERSION,
  PAWN_SLUG_STAGE_CONTENT_VERSION,
  pawnSlugLocalStageManifest,
  pawnSlugResolveStageManifest,
  pawnSlugValidateStageEnvelope,
  pawnSlugValidateStageManifest,
} from './pawnSlugGameDirector.js';
