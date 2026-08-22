import React, { useState } from 'react';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';

export default function MechanicTutorialHelp({ tutorialId, autoOpen = false, label = 'Abrir tutorial' }) {
  const [open, setOpen] = useState(() => autoOpen && !loadMechanicTutorialProgress()?.[tutorialId]?.seen);
  return (
    <>
      <button type="button" className="context-help-btn" onClick={() => setOpen(true)} aria-label={label}>?</button>
      {open && <MechanicTutorialModal tutorialId={tutorialId} onClose={() => setOpen(false)} />}
    </>
  );
}
