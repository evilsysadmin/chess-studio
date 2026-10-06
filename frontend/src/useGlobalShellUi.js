import { useEffect, useRef, useState } from 'react';
import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { LATEST_USER_NOTE_ID, USER_RELEASE_NOTES_KEY } from './userReleaseNotes.js';

export function useGlobalShellUi() {
  const [showRatingDetail, setShowRatingDetail] = useState(false);
  const [showCombatSummary, setShowCombatSummary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGlobalAccount, setShowGlobalAccount] = useState(false);
  const [showGlobalReleaseNotes, setShowGlobalReleaseNotes] = useState(false);
  const [releaseNotesSeen, setReleaseNotesSeen] = useState(
    () => getStorageItem(STORAGE_LOCAL, USER_RELEASE_NOTES_KEY) === LATEST_USER_NOTE_ID,
  );
  const [showGlobalFeedback, setShowGlobalFeedback] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuRef = useRef(null);
  const accountMenuButtonRef = useRef(null);

  useEffect(() => {
    if (!showAccountMenu) return undefined;

    function closeOnOutsidePointer(event) {
      if (!accountMenuRef.current?.contains(event.target)) setShowAccountMenu(false);
    }

    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      setShowAccountMenu(false);
      accountMenuButtonRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showAccountMenu]);

  function openSettings() {
    setShowAccountMenu(false);
    setShowSettings(true);
  }

  function openGlobalAccount() {
    setShowAccountMenu(false);
    setShowGlobalAccount(true);
  }

  function openReleaseNotes() {
    setProfileStorageItem(USER_RELEASE_NOTES_KEY, LATEST_USER_NOTE_ID);
    setReleaseNotesSeen(true);
    setShowGlobalReleaseNotes(true);
  }

  return {
    showRatingDetail,
    openRatingDetail: () => setShowRatingDetail(true),
    closeRatingDetail: () => setShowRatingDetail(false),
    showCombatSummary,
    openCombatSummary: () => setShowCombatSummary(true),
    closeCombatSummary: () => setShowCombatSummary(false),
    showSettings,
    openSettings,
    closeSettings: () => setShowSettings(false),
    showGlobalAccount,
    openGlobalAccount,
    closeGlobalAccount: () => setShowGlobalAccount(false),
    showGlobalReleaseNotes,
    releaseNotesSeen,
    openReleaseNotes,
    closeReleaseNotes: () => setShowGlobalReleaseNotes(false),
    showGlobalFeedback,
    openGlobalFeedback: () => setShowGlobalFeedback(true),
    closeGlobalFeedback: () => setShowGlobalFeedback(false),
    showAccountMenu,
    toggleAccountMenu: () => setShowAccountMenu((open) => !open),
    closeAccountMenu: () => setShowAccountMenu(false),
    accountMenuRef,
    accountMenuButtonRef,
    suppressHomeNudge: showSettings || showGlobalAccount || showGlobalReleaseNotes || showGlobalFeedback,
  };
}
