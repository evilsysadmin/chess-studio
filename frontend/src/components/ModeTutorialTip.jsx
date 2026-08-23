import { useId, useState } from 'react';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { mechanicTutorialById } from '../mechanicTutorials.js';

export default function ModeTutorialTip({ tutorialId }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const tutorial = mechanicTutorialById(tutorialId);
  if (!tutorial) return null;

  return (
    <>
      <span className="mode-tutorial-tip">
        <button
          type="button"
          className={`mode-tutorial-tip-button ${tutorialId === 'combat-campaign' ? 'is-featured' : ''}`}
          aria-label={`Ayuda de ${tutorial.title}`}
          aria-describedby={tooltipId}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
        >?</button>
        <span id={tooltipId} role="tooltip" className="mode-tutorial-tooltip">
          <strong>{tutorial.title}</strong>
          <span>{tutorial.summary}</span>
          <small>ABRIR GUÍA →</small>
        </span>
      </span>
      {open && <MechanicTutorialModal tutorialId={tutorialId} onClose={() => setOpen(false)} />}
    </>
  );
}
