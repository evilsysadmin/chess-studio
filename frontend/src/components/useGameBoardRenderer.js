import { useEffect, useState } from 'react';
import {
  getBoardRenderer,
  setBoardRenderer,
  USER_PREFERENCES_CHANGED_EVENT,
} from '../userPreferences.js';

export default function useGameBoardRenderer() {
  const [boardRenderer, setBoardRendererState] = useState(() => getBoardRenderer());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const refreshRenderer = () => setBoardRendererState(getBoardRenderer());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshRenderer);
    return () => window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshRenderer);
  }, []);

  const isThreeD = boardRenderer === '3d';

  function toggleBoardRenderer() {
    const next = setBoardRenderer(isThreeD ? '2d' : '3d');
    setBoardRendererState(next);
  }

  return {
    boardRenderer,
    isThreeD,
    toggleBoardRenderer,
  };
}
