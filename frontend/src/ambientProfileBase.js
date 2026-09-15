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
import {
  BEIRUT_SONGBOOK_IDS,
  installBeirutSongbook,
  withBeirutProduction,
} from './ambientBeirutSongbook.js';
import {
  ISTANBUL_SONGBOOK_IDS,
  installIstanbulSongbook,
  withIstanbulProduction,
} from './ambientIstanbulSongbook.js';

installNightDriveJazz({
  themes: AMBIENT_THEMES,
  options: AMBIENT_THEME_OPTIONS,
  groups: AMBIENT_THEME_GROUPS,
  genreOrder: AMBIENT_GENRE_ORDER,
});
installBeirutSongbook({ themes: AMBIENT_THEMES });
installIstanbulSongbook({ themes: AMBIENT_THEMES });
for (const id of [...BEIRUT_SONGBOOK_IDS, ...ISTANBUL_SONGBOOK_IDS]) {
  const option = AMBIENT_THEME_OPTIONS.find((entry) => entry.id === id);
  if (option && AMBIENT_THEMES[id]) option.description = AMBIENT_THEMES[id].description;
}

export function structuredFeel(theme) {
  const legacy = legacyStructuredFeel(theme);
  const regional = withIstanbulProduction(theme, withBeirutProduction(theme, legacy));
  return withNightDriveJazzProduction(theme, regional);
}
