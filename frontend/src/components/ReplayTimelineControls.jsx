import { useArrowKeyNav } from '../useArrowKeyNav.js';

export function clampReplayStep(step, frameCount) {
  const lastStep = Math.max(0, Math.trunc(Number(frameCount) || 0) - 1);
  const requested = Math.trunc(Number(step) || 0);
  return Math.max(0, Math.min(lastStep, requested));
}

export default function ReplayTimelineControls({ step, frameCount, onStepChange }) {
  const lastStep = Math.max(0, Math.trunc(Number(frameCount) || 0) - 1);
  const goTo = (target) => onStepChange?.(clampReplayStep(target, frameCount));

  useArrowKeyNav(() => goTo(step - 1), () => goTo(step + 1));

  return (
    <>
      <div className="game-controls">
        <button className="secondary-btn" onClick={() => goTo(0)} disabled={step === 0}>⏮ Inicio</button>
        <button className="secondary-btn" onClick={() => goTo(step - 1)} disabled={step === 0}>← Anterior</button>
        <button className="secondary-btn" onClick={() => goTo(step + 1)} disabled={step === lastStep}>Siguiente →</button>
        <button className="secondary-btn" onClick={() => goTo(lastStep)} disabled={step === lastStep}>Final ⏭</button>
      </div>
      <p className="hint-text replay-key-hint">← → del teclado también navegan</p>
    </>
  );
}
