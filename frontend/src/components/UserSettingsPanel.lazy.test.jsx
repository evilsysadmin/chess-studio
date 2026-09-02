import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import UserSettingsPanel from './UserSettingsPanel.jsx';
import UserSettingsPanelContent from './UserSettingsPanelContent.jsx';

describe('UserSettingsPanel · lazy boundary', () => {
  it('mantiene un fallback accesible mientras se carga el chunk pesado', () => {
    const html = renderToStaticMarkup(<UserSettingsPanel onClose={() => {}} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Cargando ajustes');
    expect(html).toContain('Preparando ajustes');
  });

  it('conserva el diálogo y sus controles cuando carga la implementación real', () => {
    const html = renderToStaticMarkup(<UserSettingsPanelContent onClose={() => {}} isAdminUser={false} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('id="settings-title"');
    expect(html).toContain('Ajustes');
    expect(html).toContain('Representación del tablero');
    expect(html).toContain('Estilo de piezas');
    expect(html).toContain('Música ambiental');
    expect(html).toContain('Efectos de sonido');
    expect(html).toContain('Cerrar');
  });
});
