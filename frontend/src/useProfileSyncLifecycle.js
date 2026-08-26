import { useEffect } from 'react';
import { PROFILE_CHANGED_EVENT } from './profileKeys.js';
import { cancelScheduledProfileSync, pushProfileToServer, scheduleProfileSync } from './profileBackup.js';
import { getToken, getUsername } from './auth.js';

export function useProfileSyncLifecycle(view) {
  useEffect(() => {
    const expectedUsername = getUsername();
    const expectedToken = getToken();
    const handleProfileChanged = () => scheduleProfileSync(300, { expectedUsername, expectedToken });
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') pushProfileToServer({ keepalive: true, expectedUsername, expectedToken });
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
    pushProfileToServer({ expectedUsername: getUsername(), expectedToken: getToken() });
  }, [view]);
}
