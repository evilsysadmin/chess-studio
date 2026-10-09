import { useState } from 'react';
import {
  MECHANIC_TUTORIALS,
  loadMechanicTutorialProgress,
  markMechanicTutorialSeen,
} from '../mechanicTutorials.js';

export default function SchoolMechanicsResource() {
  const [mechanicId, setMechanicId] = useState(MECHANIC_TUTORIALS[0]?.id || null);
  const [mechanicStep, setMechanicStep] = useState(0);
  const [mechanicProgress, setMechanicProgress] = useState(() => loadMechanicTutorialProgress());
  const mechanic = MECHANIC_TUTORIALS.find((item) => item.id === mechanicId) || MECHANIC_TUTORIALS[0];
  const mechanicCurrentStep = mechanic?.steps?.[Math.max(0, Math.min((mechanic?.steps?.length || 1) - 1, mechanicStep))];

  return (
    <div className="mechanic-library">
      <aside className="mechanic-library-list">
        {MECHANIC_TUTORIALS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={item.id === mechanic?.id ? 'active' : ''}
            onClick={() => {
              setMechanicId(item.id);
              setMechanicStep(0);
            }}
          >
            <span>{item.group}</span>
            <strong>{item.title}</strong>
            <small>{mechanicProgress[item.id]?.seen ? '✓ visto' : 'nuevo'}</small>
          </button>
        ))}
      </aside>

      {mechanic && mechanicCurrentStep && (
        <article className="mechanic-library-detail">
          <span className="section-label">{mechanic.group} · TUTORIAL NO ESTÁNDAR</span>
          <h2>{mechanic.title}</h2>
          <p className="hero-scope-note">{mechanic.summary}</p>
          <div className="mechanic-tutorial-step">
            <span className="mechanic-tutorial-counter">{mechanicStep + 1}/{mechanic.steps.length}</span>
            <h3>{mechanicCurrentStep.title}</h3>
            <p>{mechanicCurrentStep.text}</p>
          </div>
          <div className="mechanic-tutorial-actions">
            <button
              type="button"
              className="secondary-btn"
              disabled={mechanicStep === 0}
              onClick={() => setMechanicStep((index) => Math.max(0, index - 1))}
            >
              Anterior
            </button>
            {mechanicStep < mechanic.steps.length - 1 ? (
              <button
                type="button"
                className="primary-btn"
                onClick={() => setMechanicStep((index) => Math.min(mechanic.steps.length - 1, index + 1))}
              >
                Siguiente
              </button>
            ) : (
              <button
                type="button"
                className="primary-btn"
                onClick={() => setMechanicProgress(markMechanicTutorialSeen(mechanic.id))}
              >
                Marcar entendido
              </button>
            )}
          </div>
        </article>
      )}
    </div>
  );
}
