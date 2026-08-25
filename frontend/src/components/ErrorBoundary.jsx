import React from 'react';
import { buildClientDiagnostic, copyDiagnosticText } from '../clientDiagnostics.js';

// Red de seguridad a nivel de toda la app. Si una pantalla revienta durante
// render, mantenemos la app viva y, cuando existe una partida activa, damos
// prioridad a rehidratarla desde el snapshot + backend antes de abandonar el
// tablero. El fallback nunca borra la sesión guardada por su cuenta.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, recovering: false, recoveryError: null, lastError: null, diagnosticCopied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, lastError: error, diagnosticCopied: false };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Error atrapado por ErrorBoundary:', error, info);
  }

  handleRecover = async () => {
    if (!this.props.onRecover || this.state.recovering) return;
    this.setState({ recovering: true, recoveryError: null });
    try {
      const recovered = await this.props.onRecover();
      if (!recovered) {
        this.setState({
          recovering: false,
          recoveryError: 'No se pudo recuperar ahora. La partida sigue guardada; puedes reintentar.',
        });
        return;
      }
      this.setState({ hasError: false, recovering: false, recoveryError: null, diagnosticCopied: false });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Falló la recuperación desde ErrorBoundary:', error);
      this.setState({
        recovering: false,
        recoveryError: 'La recuperación falló, pero la partida sigue guardada. Inténtalo otra vez.',
      });
    }
  };

  handleRetry = () => {
    this.setState({ hasError: false, recovering: false, recoveryError: null, diagnosticCopied: false });
  };

  handleCopyDiagnostic = async () => {
    const text = buildClientDiagnostic({
      error: this.state.lastError,
      view: this.props.view,
      canRecover: Boolean(this.props.canRecover),
    });
    const copied = await copyDiagnosticText(text).catch(() => false);
    this.setState({ diagnosticCopied: copied });
  };

  handleReset = () => {
    this.setState({ hasError: false, recovering: false, recoveryError: null, diagnosticCopied: false });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const canRecover = Boolean(this.props.canRecover && this.props.onRecover);
      return (
        <div className="error-boundary-screen" role="alert">
          <span className="eyebrow">Incidencia recuperable</span>
          <h2>La pantalla ha tropezado</h2>
          <p className="hint-text">
            Algo falló en la interfaz. Tu progreso guardado sigue intacto y no vamos a borrar la partida por este error.
          </p>

          {canRecover && (
            <div className="error-boundary-recovery">
              <strong>Hay una partida en curso.</strong>
              <span>Podemos reconstruir el tablero desde la sesión guardada y el estado del servidor.</span>
              {this.state.recoveryError && <span className="error-boundary-recovery-error">{this.state.recoveryError}</span>}
              <button
                type="button"
                className="primary-btn"
                onClick={this.handleRecover}
                disabled={this.state.recovering}
              >
                {this.state.recovering ? 'Recuperando partida…' : 'Recuperar partida'}
              </button>
            </div>
          )}

          {!canRecover && (
            <p className="hint-text">No hay una partida activa recuperable en esta sesión.</p>
          )}

          <div className="error-boundary-actions">
            <button type="button" className="secondary-btn" onClick={this.handleRetry} disabled={this.state.recovering}>
              Reintentar pantalla
            </button>
            <button type="button" className="secondary-btn" onClick={this.handleReset} disabled={this.state.recovering}>
              Volver al menú
            </button>
            <button type="button" className="secondary-btn" onClick={this.handleCopyDiagnostic}>
              {this.state.diagnosticCopied ? 'Diagnóstico copiado ✓' : 'Copiar diagnóstico'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
