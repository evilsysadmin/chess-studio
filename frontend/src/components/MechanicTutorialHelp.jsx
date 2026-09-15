import { useState } from 'react';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { loadMechanicTutorialProgress, markMechanicTutorialSeen } from '../mechanicTutorials.js';

export default function MechanicTutorialHelp({
  tutorialId,
  autoOpen = false,
  label = 'Abrir tutorial',
  markSeenOnClose = false,
  firstRunLabel = '',
}) {
  const [seen, setSeen] = useState(() => Boolean(loadMechanicTutorialProgress()?.[tutorialId]?.seen));
  const [open, setOpen] = useState(() => autoOpen && !seen);
  const showFirstRunNudge = Boolean(firstRunLabel) && !seen;

  function closeTutorial() {
    if (markSeenOnClose) {
      markMechanicTutorialSeen(tutorialId);
      setSeen(true);
    }
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={`context-help-btn${showFirstRunNudge ? ' is-first-run-nudge' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        {showFirstRunNudge ? firstRunLabel : '?'}
      </button>
      {open && <MechanicTutorialModal tutorialId={tutorialId} onClose={closeTutorial} />}
    </>
  );
}
