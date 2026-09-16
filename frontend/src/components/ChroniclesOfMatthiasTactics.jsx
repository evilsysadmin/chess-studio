import { lazy, Suspense, useEffect, useState } from 'react';
import {
  chroniclesClearRuntimeMapDefinitions,
} from '../chronicles/chroniclesMapCatalog.js';
import { chroniclesBootstrapTacticsWorld } from '../chronicles/chroniclesGameBootstrap.js';
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

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    chroniclesBootstrapTacticsWorld({ signal: controller.signal })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
      controller.abort();
      chroniclesClearRuntimeMapDefinitions();
    };
  }, []);

  if (!ready) return <BootstrapStatus />;

  return (
    <Suspense fallback={<BootstrapStatus />}>
      <ChroniclesOfMatthiasTacticsRuntime onExit={onExit} />
    </Suspense>
  );
}
