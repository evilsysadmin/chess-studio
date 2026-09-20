import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  chroniclesClearRuntimeMapDefinitions,
} from '../chronicles/chroniclesMapCatalog.js';
import { chroniclesBootstrapTacticsWorld } from '../chronicles/chroniclesGameBootstrap.js';
import {
  ensureChroniclesTacticsRun,
  loadChroniclesProgression,
  saveChroniclesProgression,
  setChroniclesCharacterBuild,
} from '../chroniclesOfMatthiasProgression.js';
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

export default function ChroniclesOfMatthiasTactics({ onExit }) {
  const [ready, setReady] = useState(false);
  const [bootstrapRevision, setBootstrapRevision] = useState(0);
  const [progression, setProgression] = useState(() => loadChroniclesProgression());
  const [characterSetupDone, setCharacterSetupDone] = useState(false);

  const restartExpedition = useCallback(() => {
    setReady(false);
    setBootstrapRevision((revision) => revision + 1);
  }, []);

  const confirmCharacterBuild = useCallback((build) => {
    const selected = setChroniclesCharacterBuild(progression, build);
    if (!selected.updated) return;
    const saved = saveChroniclesProgression(selected.progression);
    setProgression(saved);
    setReady(false);
    setCharacterSetupDone(true);
    setBootstrapRevision((revision) => revision + 1);
  }, [progression]);

  useEffect(() => {
    if (!characterSetupDone) return undefined;
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
  }, [bootstrapRevision, characterSetupDone]);

  if (!characterSetupDone) {
    return (
      <ChroniclesCharacterSetup
        currentBuild={progression.characterBuild}
        onConfirm={confirmCharacterBuild}
        onExit={onExit}
      />
    );
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
