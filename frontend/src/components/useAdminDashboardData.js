import { useEffect, useRef, useState } from 'react';
import { fetchAdminMatthiasStatus, fetchAdminUsers } from '../admin.js';
import { fetchAdminFeedback } from '../feedback.js';
import { ADMIN_REFRESH_MS, shouldRefreshAdminPresence } from '../presenceCadence.js';

export default function useAdminDashboardData() {
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
      const pending = Promise.allSettled([fetchAdminUsers(), fetchAdminFeedback(), fetchAdminMatthiasStatus()]);
      adminRefreshInFlightRef.current = { requestToken, pending };
      try {
        const [usersResult, feedbackResult, matthiasResult] = await pending;
        if (!mounted || adminDataEpochRef.current !== epoch || adminRefreshInFlightRef.current?.requestToken !== requestToken) return;
        if (usersResult.status === 'fulfilled') {
          setUsers(usersResult.value);
          setLastAdminRefreshAt(Date.now());
          setAdminNow(Date.now());
          setError(null);
        } else if (!silent) {
          setError(usersResult.reason?.message || 'No se pudieron cargar los usuarios.');
        }
        if (feedbackResult.status === 'fulfilled') {
          setFeedback(feedbackResult.value.feedback || []);
          setFeedbackError(null);
        } else if (!silent) {
          setFeedbackError(feedbackResult.reason?.message || 'No se pudo cargar el feedback.');
        }
        if (matthiasResult.status === 'fulfilled') {
          setMatthiasStatus(matthiasResult.value || null);
          setMatthiasStatusError(null);
        } else if (!silent) {
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
      window.clearInterval(timer);
      window.clearInterval(ageTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

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
