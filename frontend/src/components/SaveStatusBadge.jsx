import { useEffect, useState } from 'react';
import { resolveSaveStatus } from '../saveStatus.js';

function browserIsOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export default function SaveStatusBadge({ state = 'saved' }) {
  const [online, setOnline] = useState(browserIsOnline);

  useEffect(() => {
    const update = () => setOnline(browserIsOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const status = resolveSaveStatus(state, online);
  return (
    <aside
      className={`save-status-badge is-${status.tone}`}
      role="status"
      aria-live="polite"
      title={status.title}
    >
      <span className="save-status-dot" aria-hidden="true" />
      <span>{status.label}</span>
    </aside>
  );
}
