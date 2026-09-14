// Stable boundary for the historical ambient profile bank.
//
// Profile composition imports this module instead of coupling directly to the
// legacy store, so the old catalog can be decomposed without leaking its name
// or storage shape into current audio features.
export { structuredFeel } from './ambientProfilesLegacy.js';
