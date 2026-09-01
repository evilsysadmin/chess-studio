import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { getCameraFramingProfile } from './Board3DSurfaces.js';
import { pieceTooltipText } from './WarRoom3DPieceInfo.js';
import './WarRoom3DPieceTooltip.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function parseWarRoomPieces(fen) {
  const rows = String(fen || '').trim().split(/\s+/)[0]?.split('/') || [];
  if (rows.length !== 8) return [];
  const pieces = [];
  rows.forEach((row, rankIndex) => {
    let fileIndex = 0;
    for (const char of row) {
      if (/^[1-8]$/.test(char)) {
        fileIndex += Number(char);
      } else if (/^[prnbqkPRNBQK]$/.test(char) && fileIndex < 8) {
        pieces.push({
          square: `${FILES[fileIndex]}${8 - rankIndex}`,
          type: char.toLowerCase(),
          color: char === char.toUpperCase() ? 'w' : 'b',
        });
        fileIndex += 1;
      }
    }
  });
  return pieces;
}

function squarePosition(square) {
  return {
    x: FILES.indexOf(square?.[0]) - 3.5,
    z: 4.5 - Number(square?.[1]),
  };
}

export function buildTooltipCamera(width, height, orientation = 'white') {
  const safeWidth = Math.max(280, Number(width) || 280);
  const safeHeight = Math.max(300, Number(height) || 300);
  const aspect = Math.max(0.35, safeWidth / safeHeight);
  const profile = getCameraFramingProfile(aspect);
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = THREE.MathUtils.clamp(
    (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding,
    profile.minDistance,
    profile.maxDistance,
  );
  const whiteSide = orientation !== 'black';
  const target = new THREE.Vector3(0, profile.targetY, whiteSide ? -profile.targetZ : profile.targetZ);
  const direction = new THREE.Vector3(0, profile.cameraY, whiteSide ? profile.cameraZ : -profile.cameraZ).normalize();
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function closestProjectedPiece(pieces, rect, clientX, clientY, orientation, matthiasKingColor, radius) {
  if (!rect?.width || !rect?.height) return null;
  const camera = buildTooltipCamera(rect.width, rect.height, orientation);
  let best = null;
  let bestDistance = radius;
  for (const piece of pieces) {
    const { x, z } = squarePosition(piece.square);
    // Aim roughly at the visual centre of a chessman rather than at the tile.
    // It makes hover match the visible 3D body instead of the projected floor.
    const point = new THREE.Vector3(x, piece.type === 'p' ? 0.62 : 0.72, z).project(camera);
    const px = rect.left + ((point.x + 1) / 2) * rect.width;
    const py = rect.top + ((1 - point.y) / 2) * rect.height;
    const distance = Math.hypot(clientX - px, clientY - py);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = {
        ...piece,
        matthiasKing: piece.type === 'k' && piece.color === matthiasKingColor,
      };
    }
  }
  return best;
}

export default function WarRoom3DPieceTooltip({ fen, orientation = 'white', selectedSquare = null, matthiasKingColor = null }) {
  const pieces = useMemo(() => parseWarRoomPieces(fen), [fen]);
  const [portalTarget, setPortalTarget] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    const findShell = () => {
      const shell = document.querySelector('.board3d-main-shell');
      if (shell) {
        setPortalTarget(shell);
        return;
      }
      attempts += 1;
      if (attempts < 30) frame = window.requestAnimationFrame(findShell);
    };
    findShell();
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!selectedSquare) return;
    const piece = pieces.find((candidate) => candidate.square === selectedSquare);
    if (!piece) return;
    const text = pieceTooltipText({
      ...piece,
      matthiasKing: piece.type === 'k' && piece.color === matthiasKingColor,
    });
    if (!text) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setTooltip({ text, pinned: true });
    hideTimerRef.current = setTimeout(() => setTooltip((current) => current?.pinned ? null : current), 1700);
  }, [selectedSquare, pieces, matthiasKingColor]);

  useEffect(() => {
    const canvas = portalTarget?.querySelector?.('.board3d-main-canvas');
    if (!canvas) return undefined;

    const showPiece = (piece, pinned = false) => {
      const text = pieceTooltipText(piece);
      if (!text) return;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setTooltip({ text, pinned });
      if (pinned) {
        hideTimerRef.current = setTimeout(() => setTooltip((current) => current?.pinned ? null : current), 1700);
      }
    };

    const onMouseMove = (event) => {
      if (portalTarget.dataset.board3dInspect === 'true') return;
      const rect = canvas.getBoundingClientRect();
      const piece = closestProjectedPiece(pieces, rect, event.clientX, event.clientY, orientation, matthiasKingColor, 34);
      if (piece) showPiece(piece, false);
      else setTooltip((current) => current?.pinned ? current : null);
    };

    const onPointerUp = (event) => {
      if (portalTarget.dataset.board3dInspect === 'true') return;
      const rect = canvas.getBoundingClientRect();
      const radius = event.pointerType === 'touch' ? 48 : 38;
      const piece = closestProjectedPiece(pieces, rect, event.clientX, event.clientY, orientation, matthiasKingColor, radius);
      if (piece) showPiece(piece, true);
    };

    const onMouseLeave = () => setTooltip((current) => current?.pinned ? current : null);
    canvas.addEventListener('mousemove', onMouseMove, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp, { passive: true });
    canvas.addEventListener('mouseleave', onMouseLeave, { passive: true });
    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [portalTarget, pieces, orientation, matthiasKingColor]);

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  if (!portalTarget || !tooltip?.text) return null;
  return createPortal(
    <div className="board3d-piece-tooltip" role="status" aria-live="polite">{tooltip.text}</div>,
    portalTarget,
  );
}
