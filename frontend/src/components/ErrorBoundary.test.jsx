import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary.jsx';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary · continuidad entre deploys', () => {
  it('reconstruye el runtime automáticamente cuando React.lazy entrega undefined.default', () => {
    const reload = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const boundary = new ErrorBoundary({ onReload: reload });

    boundary.componentDidCatch(
      new TypeError("Cannot read properties of undefined (reading 'default')"),
      { componentStack: '\n    at Lazy' },
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('no recarga automáticamente ante un error normal de la interfaz', () => {
    const reload = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const boundary = new ErrorBoundary({ onReload: reload });

    boundary.componentDidCatch(new Error('fallo de render normal'), { componentStack: '\n    at View' });

    expect(reload).not.toHaveBeenCalled();
  });
});
