import { useEffect, useRef, useState } from 'react';
import { fetchAdminMatthiasStatus, fetchAdminUsers } from '../admin.js';
import { fetchAdminFeedback } from '../feedback.js';
import { ADMIN_REFRESH_MS, shouldRefreshAdminPresence } from '../presenceCadence.js';

export default function useAdminDashboardData(section = 'overview') {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [feedbackError, setFeedbackError] = useState(null);
  const [lastAdminRefreshAt, setLastAdminRefreshAt] = useState(null);
  const [adminNow, setAdminNow] = useState(() => Date.now());
  const [matthiasStatus, setMatthiasStatus] = useState(null);
  const [matthiasStatusError, setMatthiasStatusError] = useState(null);
  const adminDataEpochRef = useRef(0);
  const adminRefreshInFlightRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function refreshAdminData(silent = false) {
      if (adminRefreshInFlightRef.current) return adminRefreshInFlightRef.current.pending;
      const epoch = adminDataEpochRef.current;
      const requestToken = Symbol('admin-refresh');
      const pending = Promise.allSettled([
        ['overview', 'users'].includes(section) ? fetchAdminUsers() : Promise.resolve(null),
        section === 'feedback' ? fetchAdminFeedback() : Promise.resolve(null),
        section === 'matthias' ? fetchAdminMatthiasStatus() : Promise.resolve(null),
      ]);
      adminRefreshInFlightRef.current = { requestToken, pending };
      try {
        const [usersResult, feedbackResult, matthiasResult] = await pending;
        if (!mounted || adminDataEpochRef.current !== epoch || adminRefreshInFlightRef.current?.requestToken !== requestToken) return;
        if (['overview', 'users'].includes(section) && usersResult.status === 'fulfilled') {
          setUsers(usersResult.value);
          setLastAdminRefreshAt(Date.now());
          setAdminNow(Date.now());
          setError(null);
        } else if (['overview', 'users'].includes(section) && !silent) {
          setError(usersResult.reason?.message || 'No se pudieron cargar los usuarios.');
        }
        if (section === 'feedback' && feedbackResult.status === 'fulfilled') {
          setFeedback(feedbackResult.value.feedback || []);
          setFeedbackError(null);
        } else if (section === 'feedback' && !silent) {
          setFeedbackError(feedbackResult.reason?.message || 'No se pudo cargar el feedback.');
        }
        if (section === 'matthias' && matthiasResult.status === 'fulfilled') {
          setMatthiasStatus(matthiasResult.value || null);
          setMatthiasStatusError(null);
        } else if (section === 'matthias' && !silent) {
          setMatthiasStatusError(matthiasResult.reason?.message || 'No se pudo cargar el estado de Matthias.');
        }
      } finally {
        if (adminRefreshInFlightRef.current?.requestToken === requestToken) adminRefreshInFlightRef.current = null;
      }
    }

    refreshAdminData();
    const refreshIfVisible = () => {
      if (shouldRefreshAdminPresence(document.visibilityState)) refreshAdminData(true);
    };
    const handleVisibility = () => {
      if (shouldRefreshAdminPresence(document.visibilityState)) refreshAdminData(true);
    };
    const timer = window.setInterval(refreshIfVisible, ADMIN_REFRESH_MS);
    const ageTimer = window.setInterval(() => {
      if (shouldRefreshAdminPresence(document.visibilityState)) setAdminNow(Date.now());
    }, 5000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      mounted = false;
      adminRefreshInFlightRef.current = null;
      window.clearInterval(timer);
      window.clearInterval(ageTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [section]);

  const invalidateAdminData = () => {
    adminDataEpochRef.current += 1;
  };

  return {
    users,
    setUsers,
    error,
    feedback,
    setFeedback,
    feedbackError,
    setFeedbackError,
    lastAdminRefreshAt,
    adminNow,
    matthiasStatus,
    setMatthiasStatus,
    matthiasStatusError,
    setMatthiasStatusError,
    invalidateAdminData,
  };
}
