// Stable ambient-profile boundary.
//
// Current audio composition consumes historical profile data through this
// module so ambientProfilesLegacy.js can be decomposed without leaking its
// implementation name into modern audio orchestration.
import { structuredFeel as legacyStructuredFeel } from './ambientProfilesLegacy.js';
import {
  AMBIENT_GENRE_ORDER,
  AMBIENT_THEMES,
  AMBIENT_THEME_GROUPS,
  AMBIENT_THEME_OPTIONS,
} from './ambientCatalog.js';
import {
  installNightDriveJazz,
  withNightDriveJazzProduction,
} from './ambientNightDriveJazz.js';

installNightDriveJazz({
  themes: AMBIENT_THEMES,
  options: AMBIENT_THEME_OPTIONS,
  groups: AMBIENT_THEME_GROUPS,
  genreOrder: AMBIENT_GENRE_ORDER,
});

export function structuredFeel(theme) {
  return withNightDriveJazzProduction(theme, legacyStructuredFeel(theme));
}
