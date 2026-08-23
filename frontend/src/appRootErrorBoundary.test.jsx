import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppRootErrorBoundary from './components/AppRootErrorBoundary.jsx';
import { ACTIVE_GAME_SESSION_KEY } from './activeGameSession.js';

function boundaryWith(props = {}) {
  const boundary = new AppRootErrorBoundary(props);
  boundary.state = { hasError: true };
  return boundary;
}

describe('AppRootErrorBoundary · último fusible', () => {
  beforeEach(() => localStorage.clear());

  it('recarga bajo demanda y no borra una partida guardada', () => {
    localStorage.setItem(ACTIVE_GAME_SESSION_KEY, JSON.stringify({ version: 1, route: 'game', gameId: 'g-1' }));
    const onReload = vi.fn();
    const boundary = boundaryWith({ onReload });

    boundary.handleReload();

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ACTIVE_GAME_SESSION_KEY)).not.toBeNull();
  });

  it('el error raíz no se limpia solo y requiere una acción explícita', () => {
    const boundary = boundaryWith();
    expect(boundary.state.hasError).toBe(true);
    expect(AppRootErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  });
});
