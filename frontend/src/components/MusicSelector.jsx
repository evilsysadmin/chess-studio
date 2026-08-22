import React, { useState } from 'react';
import { AMBIENT_THEME_GROUPS, AMBIENT_THEME_OPTIONS, getAmbientThemeId, setAmbientTheme } from '../sound.js';

export default function MusicSelector() {
  const [themeId, setThemeId] = useState(() => getAmbientThemeId());

  function handleChange(event) {
    const nextId = setAmbientTheme(event.target.value);
    setThemeId(nextId);
  }

  const current = AMBIENT_THEME_OPTIONS.find((theme) => theme.id === themeId);

  return (
    <label className="music-selector" title={current?.description || 'Melodía ambiental'}>
      <span className="music-selector-icon" aria-hidden="true">♫</span>
      <select value={themeId} onChange={handleChange} aria-label="Melodía ambiental">
        {AMBIENT_THEME_GROUPS.map((group) => (
          <optgroup key={group.genre} label={group.genre}>
            {group.themes.map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
