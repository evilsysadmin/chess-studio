// Compatibility alias kept for the screens migrated during the first 3D
// rollout. Board itself is now the single renderer-aware entrypoint, so every
// chess surface gets the same default, explicit-2D and WebGL-fallback contract.
export { default } from './Board.jsx';
