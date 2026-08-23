import React, { useEffect, useMemo, useState } from 'react';
import { mechanicTutorialById, markMechanicTutorialSeen } from '../mechanicTutorials.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function MechanicTutorialModal({ tutorialId, onClose, startAt = 0 }) {
  const tutorial = useMemo(() => mechanicTutorialById(tutorialId), [tutorialId]);
  const [index, setIndex] = useState(startAt);
  useEscapeToClose(onClose);

  useEffect(() => setIndex(startAt), [tutorialId, startAt]);
  if (!tutorial) return null;
  const step = tutorial.steps[Math.max(0, Math.min(tutorial.steps.length - 1, index))];
  const last = index >= tutorial.steps.length - 1;

  function finish() {
    markMechanicTutorialSeen(tutorial.id);
    onClose?.();
  }

  function skip() {
    markMechanicTutorialSeen(tutorial.id);
    onClose?.();
  }

  return (
    <div className="modal-backdrop mechanic-tutorial-backdrop" onClick={onClose}>
      <section className="mechanic-tutorial-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} aria-label={`Tutorial: ${tutorial.title}`}>
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar tutorial">×</button>
        <span className="section-label">TUTORIAL IN-GAME · {tutorial.group}</span>
        <h2>{tutorial.title}</h2>
        <div className="mechanic-tutorial-step">
          <span className="mechanic-tutorial-counter">{index + 1}/{tutorial.steps.length}</span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </div>
        <div className="mechanic-tutorial-dots" aria-hidden="true">
          {tutorial.steps.map((_, i) => <span key={i} className={i === index ? 'active' : ''} />)}
        </div>
        <div className="mechanic-tutorial-actions">
          <button type="button" className="secondary-btn" onClick={skip}>Saltar</button>
          <div>
            <button type="button" className="secondary-btn" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>Anterior</button>
            {last
              ? <button type="button" className="primary-btn" onClick={finish}>Entendido</button>
              : <button type="button" className="primary-btn" onClick={() => setIndex((i) => Math.min(tutorial.steps.length - 1, i + 1))}>Siguiente</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
