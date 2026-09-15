import { useEffect, useState } from 'react';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { loadMechanicTutorialProgress, markMechanicTutorialSeen } from '../mechanicTutorials.js';
import { PROFILE_CHANGED_EVENT } from '../profileKeys.js';

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

  useEffect(() => {
    const refresh = () => setSeen(Boolean(loadMechanicTutorialProgress()?.[tutorialId]?.seen));
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, refresh);
  }, [tutorialId]);

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
