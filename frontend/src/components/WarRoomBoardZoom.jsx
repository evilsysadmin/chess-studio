import { useRef, useState } from 'react';
import './WarRoomBoardZoom.css';

export function clampWarRoomZoom(value) {
  return Math.max(1, Math.min(1.35, Number(value) || 1));
}

export function nextWarRoomPinchZoom(startZoom, startDistance, currentDistance) {
  const safeStart = Math.max(1, Number(startDistance) || 1);
  const safeCurrent = Math.max(1, Number(currentDistance) || 1);
  return clampWarRoomZoom((Number(startZoom) || 1) * (safeCurrent / safeStart));
}

export default function WarRoomBoardZoom({ children }) {
  const rootRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef({ active: false, startDistance: 0, startZoom: 1 });
  const [zoom, setZoom] = useState(1);

  const markPinching = (active) => {
    const canvas = rootRef.current?.querySelector?.('canvas.board3d-main-canvas');
    if (!canvas) return;
    if (active) canvas.dataset.warRoomPinching = 'true';
    else delete canvas.dataset.warRoomPinching;
  };

  const onPointerDownCapture = (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size !== 2) return;
    const [a, b] = [...pointersRef.current.values()];
    pinchRef.current = {
      active: true,
      startDistance: Math.hypot(a.x - b.x, a.y - b.y),
      startZoom: zoom,
    };
    markPinching(true);
  };

  const onPointerMoveCapture = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinchRef.current.active || pointersRef.current.size < 2) return;
    const [a, b] = [...pointersRef.current.values()];
    setZoom(nextWarRoomPinchZoom(
      pinchRef.current.startZoom,
      pinchRef.current.startDistance,
      Math.hypot(a.x - b.x, a.y - b.y),
    ));
  };

  const releasePointer = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size > 0) return;
    pinchRef.current.active = false;
    window.setTimeout(() => markPinching(false), 0);
  };

  const centered = zoom <= 1.01;

  return (
    <div
      ref={rootRef}
      className={`war-room-board-zoom${centered ? '' : ' is-zoomed'}`}
      style={{ '--war-room-user-zoom': zoom }}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={releasePointer}
      onPointerCancelCapture={releasePointer}
    >
      {children}
      {!centered && (
        <button type="button" className="war-room-board-center-btn" onClick={() => setZoom(1)}>
          Centrar
        </button>
      )}
    </div>
  );
}
