import { useRef, useState } from 'react';
import './WarRoomBoardZoom.css';

// Two-finger zoom on the War/Duel Room scene (mobile). The scene keeps its
// fixed tactical camera; the user only magnifies a part of it, anchored where
// the fingers are, and can pan with the same two fingers. One finger always
// plays (taps go to the board), so the gesture never steals a move.
export const WAR_ROOM_MAX_ZOOM = 2.5;
export const CANONICAL_VIEW = Object.freeze({ zoom: 1, x: 0, y: 0 });

export function clampWarRoomZoom(value) {
  return Math.max(1, Math.min(WAR_ROOM_MAX_ZOOM, Number(value) || 1));
}

// Keep the magnified scene covering the viewport: no empty bands at the edges.
export function clampWarRoomView(view, width, height) {
  const zoom = clampWarRoomZoom(view?.zoom);
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const clampAxis = (value, size) => Math.min(0, Math.max(size - size * zoom, Number(value) || 0));
  return { zoom, x: clampAxis(view?.x, w), y: clampAxis(view?.y, h) };
}

export function isCanonicalWarRoomView(view) {
  return clampWarRoomZoom(view?.zoom) <= 1.01;
}

// The scene point that was under the starting centroid stays under the
// current centroid, scaled by how far the fingers moved apart.
export function nextWarRoomPinchView(start, current, size) {
  const startDistance = Math.max(1, Number(start?.distance) || 1);
  const currentDistance = Math.max(1, Number(current?.distance) || 1);
  const startZoom = clampWarRoomZoom(start?.view?.zoom);
  const zoom = clampWarRoomZoom(startZoom * (currentDistance / startDistance));
  const anchorX = (start.centroid.x - (start.view?.x || 0)) / startZoom;
  const anchorY = (start.centroid.y - (start.view?.y || 0)) / startZoom;
  return clampWarRoomView({
    zoom,
    x: current.centroid.x - anchorX * zoom,
    y: current.centroid.y - anchorY * zoom,
  }, size?.width, size?.height);
}

function pinchGeometry(points, rect) {
  const [a, b] = points;
  return {
    distance: Math.hypot(a.x - b.x, a.y - b.y),
    centroid: { x: (a.x + b.x) / 2 - (rect?.left || 0), y: (a.y + b.y) / 2 - (rect?.top || 0) },
  };
}

export default function WarRoomBoardZoom({ children }) {
  const rootRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const [view, setView] = useState(CANONICAL_VIEW);
  const viewRef = useRef(view);
  viewRef.current = view;

  const markPinching = (active) => {
    const canvas = rootRef.current?.querySelector?.('canvas.board3d-main-canvas');
    if (!canvas) return;
    if (active) canvas.dataset.warRoomPinching = 'true';
    else delete canvas.dataset.warRoomPinching;
  };

  const startPinch = () => {
    const rect = rootRef.current?.getBoundingClientRect?.();
    pinchRef.current = { ...pinchGeometry([...pointersRef.current.values()], rect), view: viewRef.current };
    markPinching(true);
  };

  const onPointerDownCapture = (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) startPinch();
  };

  const onPointerMoveCapture = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinchRef.current || pointersRef.current.size < 2) return;
    const rect = rootRef.current?.getBoundingClientRect?.();
    const points = [...pointersRef.current.values()].slice(0, 2);
    setView(nextWarRoomPinchView(pinchRef.current, pinchGeometry(points, rect), rect));
  };

  const releasePointer = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size >= 2) {
      startPinch();
      return;
    }
    if (!pinchRef.current) return;
    pinchRef.current = null;
    // A near-canonical result snaps back so the board is never 1% zoomed.
    if (isCanonicalWarRoomView(viewRef.current)) setView(CANONICAL_VIEW);
    // Let the lifting finger's pointerup see the pinch flag before clearing it.
    window.setTimeout(() => {
      if (pointersRef.current.size === 0) markPinching(false);
    }, 0);
  };

  const canonical = isCanonicalWarRoomView(view);

  return (
    <div
      ref={rootRef}
      className={`war-room-board-zoom${canonical ? '' : ' is-zoomed'}`}
      data-war-room-zoom={view.zoom.toFixed(2)}
      style={{
        '--war-room-user-zoom': view.zoom,
        '--war-room-user-x': `${view.x}px`,
        '--war-room-user-y': `${view.y}px`,
      }}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={releasePointer}
      onPointerCancelCapture={releasePointer}
    >
      {children}
      {!canonical && (
        <button
          type="button"
          className="war-room-board-center-btn"
          aria-label="Restaurar vista"
          title="Restaurar vista"
          onClick={() => setView(CANONICAL_VIEW)}
        >
          <span aria-hidden="true">⤢</span> Vista
        </button>
      )}
    </div>
  );
}
