import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import UserSettingsPanel from './UserSettingsPanel.jsx';
import UserSettingsPanelContent, {
  applyStagedRendererAfterSettingsUnmount,
  stageRendererForSettingsClose,
} from './UserSettingsPanelContent.jsx';

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

  it('prepara el cambio 2D↔3D antes de cerrar y sólo lo aplica al desmontar', () => {
    const calls = [];
    const pendingRendererRef = { current: null };

    stageRendererForSettingsClose({
      boardRenderer: '3d',
      currentBoardRenderer: '2d',
      pendingRendererRef,
      onClose: () => calls.push(`close:${pendingRendererRef.current}`),
    });

    expect(calls).toEqual(['close:3d']);
    expect(pendingRendererRef.current).toBe('3d');

    applyStagedRendererAfterSettingsUnmount({
      pendingRendererRef,
      applyBoardRenderer: (renderer) => calls.push(`renderer:${renderer}`),
    });

    expect(calls).toEqual(['close:3d', 'renderer:3d']);
    expect(pendingRendererRef.current).toBeNull();
  });

  it('no deja trabajo pendiente si el renderer no cambia', () => {
    const calls = [];
    const pendingRendererRef = { current: 'stale-value' };

    stageRendererForSettingsClose({
      boardRenderer: '2d',
      currentBoardRenderer: '2d',
      pendingRendererRef,
      onClose: () => calls.push('close'),
    });

    expect(calls).toEqual(['close']);
    expect(pendingRendererRef.current).toBeNull();

    expect(applyStagedRendererAfterSettingsUnmount({
      pendingRendererRef,
      applyBoardRenderer: (renderer) => calls.push(`renderer:${renderer}`),
    })).toBeNull();
    expect(calls).toEqual(['close']);
  });
});
