import { useEffect, useMemo, useRef, useState } from 'react';
import { speakCpuComment } from '../voiceCommentary.js';
import {
  matthiasAngerState,
  matthiasCaptureReaction,
  shouldMatthiasReactToCapture,
} from '../matthiasAnger.js';

const BOARD_BUBBLE_EVENTS = new Set([
  'MATE_FOUND', 'MISSED_MATE', 'STALEMATE_BLUNDER', 'STALEMATE', 'ALLOWED_MATE',
  'PAWN_TAKES_QUEEN', 'QUEEN_CAPTURE', 'QUEEN_SACRIFICE_OFFER', 'PROMOTION',
  'SKEWER', 'DISCOVERED_CHECK', 'KNIGHT_FORK', 'PAWN_FORK', 'ROOK_SACRIFICE_OFFER',
  'QUEEN_EN_PRISE_TO_PAWN', 'PAWN_TAKES_ROOK', 'CHECK',
]);

const CAPTURE_REACTION_SUPPRESSED_EVENTS = new Set([
  'PAWN_TAKES_QUEEN',
  'QUEEN_CAPTURE',
  'PAWN_TAKES_ROOK',
]);

export default function useMatthiasBoardReactions({
  game,
  humanColor,
  zenMode,
  isThreeD,
  focusActive,
  gameChat,
  gameContextMessages,
}) {
  const [captureReaction, setCaptureReaction] = useState(null);
  const [portraitReaction, setPortraitReaction] = useState({ key: '', type: 'none' });
  const captureReactionTimeoutRef = useRef(null);
  const captureTrackingRef = useRef({ gameId: null, seenId: null, lastReaction: null });
  const portraitTrackingRef = useRef({ gameId: null, humanId: null, cpuId: null });
  const matthiasAnger = useMemo(
    () => matthiasAngerState(game.history || [], humanColor),
    [game.history, humanColor],
  );
  const latestMatthiasMessage = [...(gameContextMessages || []), ...(gameChat || [])]
    .filter((message) => message?.by === 'cpu' && message?.text)
    .at(-1);
  const latestBoardBubble = [...(gameChat || [])]
    .reverse()
    .find((message) => message?.by === 'cpu' && message?.text && BOARD_BUBBLE_EVENTS.has(message?.event));

  if (captureTrackingRef.current.gameId !== game.id) {
    captureTrackingRef.current = {
      gameId: game.id,
      seenId: matthiasAnger.latestHumanCapture?.id || null,
      lastReaction: null,
    };
  }

  if (portraitTrackingRef.current.gameId !== game.id) {
    portraitTrackingRef.current = {
      gameId: game.id,
      humanId: matthiasAnger.latestHumanCapture?.id || null,
      cpuId: matthiasAnger.latestCpuCapture?.id || null,
    };
  }

  const activeMatthiasMessage = captureReaction || latestMatthiasMessage;
  const activeBoardBubble = captureReaction || latestBoardBubble;
  const activeMatthiasKey = activeMatthiasMessage?.id || activeMatthiasMessage?.text || '';

  useEffect(() => {
    if (captureReactionTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(captureReactionTimeoutRef.current);
    }
    setCaptureReaction(null);
    setPortraitReaction({ key: '', type: 'none' });
  }, [game.id]);

  useEffect(() => {
    const tracking = portraitTrackingRef.current;
    const humanCapture = matthiasAnger.latestHumanCapture;
    const cpuCapture = matthiasAnger.latestCpuCapture;
    const humanChanged = Boolean(humanCapture?.id && tracking.humanId !== humanCapture.id);
    const cpuChanged = Boolean(cpuCapture?.id && tracking.cpuId !== cpuCapture.id);

    tracking.humanId = humanCapture?.id || null;
    tracking.cpuId = cpuCapture?.id || null;

    if (!isThreeD || zenMode || (!humanChanged && !cpuChanged)) return;

    const candidates = [
      humanChanged ? { capture: humanCapture, type: 'disapprove' } : null,
      cpuChanged ? { capture: cpuCapture, type: 'smirk' } : null,
    ].filter(Boolean).sort((a, b) => Number(b.capture?.ply || 0) - Number(a.capture?.ply || 0));
    const latest = candidates[0];
    if (!latest?.capture?.id) return;

    setPortraitReaction({
      key: `${latest.type}:${game.id}:${latest.capture.id}`,
      type: latest.type,
    });
  }, [
    game.id,
    isThreeD,
    zenMode,
    matthiasAnger.latestHumanCapture?.id,
    matthiasAnger.latestCpuCapture?.id,
  ]);

  useEffect(() => {
    const capture = matthiasAnger.latestHumanCapture;
    const tracking = captureTrackingRef.current;
    if (!capture || tracking.seenId === capture.id) return;

    tracking.seenId = capture.id;
    if (zenMode || (!isThreeD && !focusActive)) return;

    const bubblePly = Number(latestBoardBubble?.ply);
    const overlapsExistingNoteworthy = latestBoardBubble?.actor === 'human'
      && CAPTURE_REACTION_SUPPRESSED_EVENTS.has(latestBoardBubble?.event)
      && Number.isFinite(bubblePly)
      && Math.abs(bubblePly - capture.ply) <= 1;
    if (overlapsExistingNoteworthy) return;

    const now = Date.now();
    if (!shouldMatthiasReactToCapture(capture, tracking.lastReaction, now)) return;

    const text = matthiasCaptureReaction(capture.piece, matthiasAnger.level);
    const message = {
      id: `capture-reaction:${game.id}:${capture.id}`,
      by: 'cpu',
      actor: 'human',
      event: 'CAPTURE_REACTION',
      ply: capture.ply,
      text,
    };
    tracking.lastReaction = { at: now, ply: capture.ply, piece: capture.piece };
    setCaptureReaction(message);
    speakCpuComment(text);

    if (captureReactionTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(captureReactionTimeoutRef.current);
    }
    if (typeof window !== 'undefined') {
      captureReactionTimeoutRef.current = window.setTimeout(() => setCaptureReaction(null), 4200);
    }
  }, [
    game.id,
    isThreeD,
    focusActive,
    zenMode,
    matthiasAnger.latestHumanCapture?.id,
    matthiasAnger.level,
    latestBoardBubble?.id,
  ]);

  useEffect(() => () => {
    if (captureReactionTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(captureReactionTimeoutRef.current);
    }
  }, []);

  return {
    activeBoardBubble,
    activeMatthiasKey,
    activeMatthiasMessage,
    matthiasAnger,
    portraitReaction,
  };
}
