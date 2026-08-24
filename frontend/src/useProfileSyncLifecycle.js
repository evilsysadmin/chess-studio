import { useEffect } from 'react';
import { PROFILE_CHANGED_EVENT } from './profileKeys.js';
import { cancelScheduledProfileSync, pushProfileToServer, scheduleProfileSync } from './profileBackup.js';

export function useProfileSyncLifecycle(view) {
  useEffect(() => {
    const handleProfileChanged = () => scheduleProfileSync();
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') pushProfileToServer({ keepalive: true });
    };
    window.addEventListener(PROFILE_CHANGED_EVENT, handleProfileChanged);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener(PROFILE_CHANGED_EVENT, handleProfileChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
      cancelScheduledProfileSync();
    };
  }, []);

  useEffect(() => {
    pushProfileToServer();
  }, [view]);
}
