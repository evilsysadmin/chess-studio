import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  chroniclesClearRuntimeMapDefinitions,
} from '../chronicles/chroniclesMapCatalog.js';
import {
  CHRONICLES_BOOTSTRAP_ERROR_CODES,
  chroniclesBootstrapTacticsWorld,
} from '../chronicles/chroniclesGameBootstrap.js';
import {
  ensureChroniclesTacticsRun,
  loadChroniclesProgression,
  renewChroniclesTacticsRun,
  saveChroniclesProgression,
  setChroniclesCharacterBuild,
} from '../chroniclesOfMatthiasProgression.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import ChroniclesCharacterSetup from './ChroniclesCharacterSetup.jsx';
import './ChroniclesOfMatthiasTactics.css';
import './ChroniclesOfMatthiasTacticsPremium.css';

const ChroniclesOfMatthiasTacticsRuntime = lazy(() => import('./ChroniclesOfMatthiasTacticsRuntime.jsx'));

function BootstrapStatus() {
  return (
    <div className="chronicles-tactics" role="status" aria-live="polite">
      <div className="chronicles-tactics__loading">Preparando expedición…</div>
    </div>
  );
}

function BootstrapFailure({ error, onRetry, onExit }) {
  const aborted = error?.code === CHRONICLES_BOOTSTRAP_ERROR_CODES.aborted;
  const requestId = error?.requestId || null;
  return (
    <div className="chronicles-tactics">
      <section className="chronicles-tactics__bootstrap-error" role="alert" aria-live="assertive">
        <span className="section-label">EXPEDICIÓN NO INICIADA</span>
        <h2>No se pudo preparar Chronicles</h2>
        <p>
          El mundo autoritativo no superó el arranque. No se ha cargado ningún mapa local de sustitución.
        </p>
        <strong className="chronicles-tactics__bootstrap-code">
          Código {error?.code || CHRONICLES_BOOTSTRAP_ERROR_CODES.unknown}
        </strong>
        {requestId && <small>Request ID · {requestId}</small>}
        {!aborted && (
          <div className="chronicles-tactics__bootstrap-actions">
            <button type="button" className="primary-btn" onClick={onRetry}>Reintentar</button>
            <button type="button" className="secondary-btn" onClick={onExit}>Salir de Chronicles</button>
          </div>
        )}
        <details>
          <summary>Detalle técnico</summary>
          <code>{error?.reason || 'unknown'}</code>
        </details>
      </section>
    </div>
  );
}

export default function ChroniclesOfMatthiasTactics({ onExit }) {
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(null);
  const [bootstrapRevision, setBootstrapRevision] = useState(0);
  const [progression, setProgression] = useState(() => loadChroniclesProgression());
  const [characterSetupDone, setCharacterSetupDone] = useState(false);
  const staleRunRecoveryAttemptedRef = useRef(false);
  useEscapeToClose(onExit, { disabled: ready });

  const confirmCharacterBuild = useCallback((build) => {
    const selected = setChroniclesCharacterBuild(progression, build);
    if (!selected.updated) return;
    const saved = saveChroniclesProgression(selected.progression);
    setProgression(saved);
    setReady(false);
    setBootstrapError(null);
    setCharacterSetupDone(true);
    setBootstrapRevision((revision) => revision + 1);
  }, [progression]);

  const retryBootstrap = useCallback(() => {
    staleRunRecoveryAttemptedRef.current = false;
    setReady(false);
    setBootstrapError(null);
    setBootstrapRevision((revision) => revision + 1);
  }, []);

  const restartExpedition = useCallback(() => {
    retryBootstrap();
  }, [retryBootstrap]);

  useEffect(() => {
    if (!characterSetupDone) return undefined;
    const controller = new AbortController();
    let active = true;

    setBootstrapError(null);
    const operationId = ensureChroniclesTacticsRun();
    chroniclesBootstrapTacticsWorld({ signal: controller.signal, operationId })
      .then(() => {
        if (!active) return;
        staleRunRecoveryAttemptedRef.current = false;
        setBootstrapError(null);
        setReady(true);
      })
      .catch((error) => {
        if (!active || error?.code === CHRONICLES_BOOTSTRAP_ERROR_CODES.aborted) return;
        if (error?.status === 409 && !staleRunRecoveryAttemptedRef.current) {
          staleRunRecoveryAttemptedRef.current = true;
          renewChroniclesTacticsRun(operationId);
          setReady(false);
          setBootstrapError(null);
          setBootstrapRevision((revision) => revision + 1);
          return;
        }
        setReady(false);
        setBootstrapError(error);
      });

    return () => {
      active = false;
      controller.abort();
      chroniclesClearRuntimeMapDefinitions();
    };
  }, [bootstrapRevision, characterSetupDone]);

  if (!characterSetupDone) {
    return (
      <ChroniclesCharacterSetup
        currentBuild={progression.characterBuild}
        recoveryLabMode="chronicles-tactics"
        onConfirm={confirmCharacterBuild}
        onExit={onExit}
      />
    );
  }

  if (bootstrapError) {
    return <BootstrapFailure error={bootstrapError} onRetry={retryBootstrap} onExit={onExit} />;
  }
  if (!ready) return <BootstrapStatus />;

  return (
    <Suspense fallback={<BootstrapStatus />}>
      <ChroniclesOfMatthiasTacticsRuntime
        key={bootstrapRevision}
        onExit={onExit}
        onRestartRun={restartExpedition}
      />
    </Suspense>
  );
}
