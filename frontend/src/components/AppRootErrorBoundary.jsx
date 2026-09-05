import React from 'react';
import { loadActiveGameSession } from '../activeGameSession.js';
import { STORAGE_KEY } from '../api.js';
import { STORAGE_LOCAL, getStorageItem } from '../safeStorage.js';
import { buildClientDiagnostic, copyDiagnosticText } from '../clientDiagnostics.js';
import { loadCampaign } from '../combatCampaign.js';
import { loadRun } from '../roguelikeRun.js';
import { hasCombatSession } from '../combatSession.js';
import { isLikelyModuleLoadError } from '../moduleLoadRecovery.js';
import { requestReleaseReload } from '../releaseContinuity.js';

function hasRecoverableGame() {
  if (loadActiveGameSession()) return true;
  if (getStorageItem(STORAGE_LOCAL, STORAGE_KEY)) return true;
  return loadCampaign().active || loadRun().inRun || hasCombatSession('free');
}

// Último fusible, montado por encima de <App /> en main.jsx. El boundary
// recuperable interno sigue encargándose de errores de pantallas concretas;
// éste existe para fallos de App/AppInner durante render o inicialización,
// que un boundary declarado dentro de AppInner nunca podría capturar.
export default class AppRootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, lastError: null, diagnosticCopied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, lastError: error, diagnosticCopied: false };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Error atrapado por AppRootErrorBoundary:', error, info);

    // Los componentes globales viven por encima del ErrorBoundary interno. Si un
    // deploy sustituye sus chunks mientras un cliente conserva el runtime previo,
    // React.lazy puede llegar aquí como `undefined.default`. Trátalo igual que el
    // boundary interno: una sola reconstrucción automática del runtime, usando el
    // guard compartido para impedir bucles si la generación nueva también falla.
    if (isLikelyModuleLoadError(error)) {
      requestReleaseReload({ reload: this.props.onReload || undefined });
    }
  }

  handleCopyDiagnostic = async () => {
    const text = buildClientDiagnostic({ error: this.state.lastError, canRecover: hasRecoverableGame() });
    const copied = await copyDiagnosticText(text).catch(() => false);
    this.setState({ diagnosticCopied: copied });
  };

  handleReload = () => {
    const reload = this.props.onReload || (() => window.location.reload());
    reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const canRecover = hasRecoverableGame();
    return (
      <div className="error-boundary-screen" role="alert">
        <span className="eyebrow">Fallo de interfaz</span>
        <h2>Chess Studio necesita reconstruir la pantalla</h2>
        <p className="hint-text">
          El último estado guardado no se borra por este error. Recargaremos únicamente la interfaz.
        </p>
        {canRecover && (
          <p className="error-boundary-recovery">
            <strong>Hay una sesión guardada.</strong>
            <span>Al recargar, la continuidad de sesión intentará reconstruirla.</span>
          </p>
        )}
        <div className="error-boundary-actions">
          <button type="button" className="primary-btn" onClick={this.handleReload}>
            {canRecover ? 'Recargar y recuperar sesión' : 'Recargar interfaz'}
          </button>
          <button type="button" className="secondary-btn" onClick={this.handleCopyDiagnostic}>
            {this.state.diagnosticCopied ? 'Diagnóstico copiado ✓' : 'Copiar diagnóstico'}
          </button>
        </div>
      </div>
    );
  }
}
