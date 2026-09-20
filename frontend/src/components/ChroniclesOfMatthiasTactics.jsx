import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  chroniclesClearRuntimeMapDefinitions,
} from '../chronicles/chroniclesMapCatalog.js';
import { chroniclesBootstrapTacticsWorld } from '../chronicles/chroniclesGameBootstrap.js';
import { ensureChroniclesTacticsRun } from '../chroniclesOfMatthiasProgression.js';
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

export default function ChroniclesOfMatthiasTactics({ onExit }) {
  const [ready, setReady] = useState(false);
  const [bootstrapRevision, setBootstrapRevision] = useState(0);

  const restartExpedition = useCallback(() => {
    setReady(false);
    setBootstrapRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const operationId = ensureChroniclesTacticsRun();
    chroniclesBootstrapTacticsWorld({ signal: controller.signal, operationId })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
      controller.abort();
      chroniclesClearRuntimeMapDefinitions();
    };
  }, [bootstrapRevision]);

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
