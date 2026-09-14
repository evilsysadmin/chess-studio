// Stable ambient-profile boundary.
//
// Current audio composition consumes historical profile data through this
// module so ambientProfilesLegacy.js can be decomposed without leaking its
// implementation name into modern audio orchestration.
export { structuredFeel } from './ambientProfilesLegacy.js';
