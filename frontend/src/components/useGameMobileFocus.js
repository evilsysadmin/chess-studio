import { useEffect, useRef, useState } from 'react';

const MOBILE_FOCUS_QUERY = '(max-width: 820px)';
const FOCUS_BUBBLE_MS = 4200;

export function useGameMobileFocus(gameId) {
  const [focusMode, setFocusMode] = useState(false);
  const [compactViewport, setCompactViewport] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_FOCUS_QUERY).matches
  ));
  const focusActive = focusMode && compactViewport;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(MOBILE_FOCUS_QUERY);
    const refresh = () => {
      setCompactViewport(media.matches);
      if (!media.matches) setFocusMode(false);
    };
    refresh();
    media.addEventListener?.('change', refresh);
    return () => media.removeEventListener?.('change', refresh);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('game-mobile-focus-active', focusActive);
    return () => document.body.classList.remove('game-mobile-focus-active');
  }, [focusActive]);

  useEffect(() => {
    setFocusMode(false);
  }, [gameId]);

  useEffect(() => () => {
    if (typeof document !== 'undefined') document.body.classList.remove('game-mobile-focus-active');
  }, []);

  return {
    compactViewport,
    focusActive,
    enterFocus: () => setFocusMode(true),
    exitFocus: () => setFocusMode(false),
  };
}

export function useGameFocusBubble({ gameId, focusActive, activeMessage, activeMessageKey }) {
  const [focusBubble, setFocusBubble] = useState(null);
  const focusBubbleTimeoutRef = useRef(null);
  const focusSeenMessageRef = useRef('');

  function clearBubbleTimeout() {
    if (focusBubbleTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(focusBubbleTimeoutRef.current);
      focusBubbleTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    setFocusBubble(null);
    focusSeenMessageRef.current = '';
    clearBubbleTimeout();
  }, [gameId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!focusActive) {
      clearBubbleTimeout();
      setFocusBubble(null);
      return;
    }
    if (!activeMessageKey || focusSeenMessageRef.current === activeMessageKey) return;

    focusSeenMessageRef.current = activeMessageKey;
    setFocusBubble(activeMessage);
    clearBubbleTimeout();
    focusBubbleTimeoutRef.current = window.setTimeout(() => {
      focusBubbleTimeoutRef.current = null;
      setFocusBubble(null);
    }, FOCUS_BUBBLE_MS);
  }, [focusActive, activeMessageKey, activeMessage]);

  useEffect(() => () => {
    clearBubbleTimeout();
  }, []);

  return {
    focusBubble,
    markCurrentMessageSeen(key) {
      focusSeenMessageRef.current = key || '';
      clearBubbleTimeout();
      setFocusBubble(null);
    },
    clearFocusBubble() {
      clearBubbleTimeout();
      setFocusBubble(null);
    },
  };
}
