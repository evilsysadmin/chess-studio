import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadSessionView,
  loadSessionViewHistory,
  rememberSessionView,
  rememberSessionViewHistory,
} from './viewState.js';

export const MAX_VIEW_HISTORY = 40;

export function appendViewHistory(history, currentView) {
  return [...(Array.isArray(history) ? history : []), currentView].slice(-MAX_VIEW_HISTORY);
}

export function popPreviousView(history, currentView) {
  const nextHistory = [...(Array.isArray(history) ? history : [])];
  let previous = nextHistory.pop();
  while (previous === currentView && nextHistory.length) previous = nextHistory.pop();
  return {
    previous: previous && previous !== currentView ? previous : 'menu',
    history: nextHistory,
  };
}

export function useViewNavigation({ isAdminUser = false, initialView = null } = {}) {
  const [view, setView] = useState(() => {
    const resolvedInitialView = typeof initialView === 'function' ? initialView() : initialView;
    return resolvedInitialView || loadSessionView({ isAdminUser });
  });
  const currentViewRef = useRef(view);
  const viewHistoryRef = useRef(loadSessionViewHistory({ isAdminUser }));
  currentViewRef.current = view;

  useEffect(() => {
    rememberSessionView(view);
  }, [view]);

  const replaceView = useCallback((nextView) => {
    if (!nextView) return;
    currentViewRef.current = nextView;
    setView(nextView);
  }, []);

  const navigateTo = useCallback((nextView) => {
    const current = currentViewRef.current;
    if (!nextView || nextView === current) return;
    const nextHistory = appendViewHistory(viewHistoryRef.current, current);
    viewHistoryRef.current = nextHistory;
    rememberSessionViewHistory(nextHistory);
    currentViewRef.current = nextView;
    setView(nextView);
  }, []);

  const goBack = useCallback(() => {
    const { previous, history } = popPreviousView(viewHistoryRef.current, currentViewRef.current);
    viewHistoryRef.current = history;
    rememberSessionViewHistory(history);
    currentViewRef.current = previous;
    setView(previous);
  }, []);

  const resetNavigation = useCallback(() => {
    viewHistoryRef.current = [];
    rememberSessionViewHistory([]);
    currentViewRef.current = 'menu';
    setView('menu');
  }, []);

  return {
    view,
    currentViewRef,
    navigateTo,
    goBack,
    replaceView,
    resetNavigation,
  };
}
