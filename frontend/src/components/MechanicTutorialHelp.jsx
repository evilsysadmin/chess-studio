import { useState } from 'react';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { loadMechanicTutorialProgress, markMechanicTutorialSeen } from '../mechanicTutorials.js';

export default function MechanicTutorialHelp({
  tutorialId,
  autoOpen = false,
  label = 'Abrir tutorial',
  markSeenOnClose = false,
}) {
  const [open, setOpen] = useState(() => autoOpen && !loadMechanicTutorialProgress()?.[tutorialId]?.seen);

  function closeTutorial() {
    if (markSeenOnClose) markMechanicTutorialSeen(tutorialId);
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="context-help-btn" onClick={() => setOpen(true)} aria-label={label}>?</button>
      {open && <MechanicTutorialModal tutorialId={tutorialId} onClose={closeTutorial} />}
    </>
  );
}
