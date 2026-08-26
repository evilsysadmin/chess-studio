import { describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './components/ErrorBoundary.jsx';

function boundaryWith(props = {}) {
  const boundary = new ErrorBoundary(props);
  // No necesitamos montar DOM para validar la máquina de estados del fallback.
  boundary.setState = (update) => {
    const patch = typeof update === 'function' ? update(boundary.state, boundary.props) : update;
    boundary.state = { ...boundary.state, ...patch };
  };
  boundary.state = { ...boundary.state, hasError: true };
  return boundary;
}

describe('ErrorBoundary · recuperación de partida', () => {
  it('cierra el fallback sólo cuando la restauración confirma éxito', async () => {
    const onRecover = vi.fn().mockResolvedValue(true);
    const boundary = boundaryWith({ onRecover });

    await boundary.handleRecover();

    expect(onRecover).toHaveBeenCalledTimes(1);
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.recovering).toBe(false);
    expect(boundary.state.recoveryError).toBeNull();
  });

  it('si backend no recupera, mantiene el fallback y permite reintentar', async () => {
    const onRecover = vi.fn().mockResolvedValue(false);
    const boundary = boundaryWith({ onRecover });

    await boundary.handleRecover();

    expect(boundary.state.hasError).toBe(true);
    expect(boundary.state.recovering).toBe(false);
    expect(boundary.state.recoveryError).toContain('sigue guardada');

    await boundary.handleRecover();
    expect(onRecover).toHaveBeenCalledTimes(2);
  });


  it('reintentar pantalla limpia sólo el fallback y conserva la navegación actual', () => {
    const boundary = boundaryWith({});
    boundary.state.recoveryError = 'fallo previo';
    boundary.state.diagnosticCopied = true;

    boundary.handleRetry();

    expect(boundary.state).toMatchObject({ hasError: false, recovering: false, recoveryError: null, diagnosticCopied: false });
  });

  it('volver al menú limpia sólo el error visual y delega la navegación', () => {
    const onReset = vi.fn();
    const boundary = boundaryWith({ onReset });
    boundary.state.recoveryError = 'fallo previo';

    boundary.handleReset();

    expect(boundary.state).toMatchObject({ hasError: false, recovering: false, recoveryError: null });
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
