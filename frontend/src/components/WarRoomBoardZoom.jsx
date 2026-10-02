import { useEffect, useRef, useState } from 'react';
import './WarRoomBoardZoom.css';

export function clampWarRoomZoom(value) {
  return Math.max(1, Math.min(1.35, Number(value) || 1));
}

export function clampWarRoomPan(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

export function shouldShowWarRoomCenter(zoom, inspecting, pan = { x: 0, y: 0 }) {
  return clampWarRoomZoom(zoom) > 1.01
    || Math.hypot(Number(pan.x) || 0, Number(pan.y) || 0) > 0.01
    || Boolean(inspecting);
}

export function resetWarRoomView(root, setZoom, inspecting, setPan = null) {
  setZoom(1);
  setPan?.({ x: 0, y: 0 });
  root?.querySelector?.('canvas.board3d-main-canvas')
    ?.dispatchEvent?.(new CustomEvent('warroom-camera-center'));
  if (inspecting) root?.querySelector?.('.board3d-inspect')?.click?.();
}

export function nextWarRoomPinchZoom(startZoom, startDistance, currentDistance) {
  const safeStart = Math.max(1, Number(startDistance) || 1);
  const safeCurrent = Math.max(1, Number(currentDistance) || 1);
  return clampWarRoomZoom((Number(startZoom) || 1) * (safeCurrent / safeStart));
}

export function nextWarRoomTwoFingerPan(startPan, startCenter, currentCenter, viewport = {}) {
  const width = Math.max(1, Number(viewport.width) || 1);
  const height = Math.max(1, Number(viewport.height) || 1);
  return {
    x: clampWarRoomPan((Number(startPan?.x) || 0) + ((Number(currentCenter?.x) || 0) - (Number(startCenter?.x) || 0)) / (width * 0.34)),
    y: clampWarRoomPan((Number(startPan?.y) || 0) + ((Number(currentCenter?.y) || 0) - (Number(startCenter?.y) || 0)) / (height * 0.34)),
  };
}

export default function WarRoomBoardZoom({ children }) {
  const rootRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef({ active: false, startDistance: 0, startZoom: 1, startCenter: null, startPan: { x: 0, y: 0 } });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const syncInspecting = () => {
      setInspecting(root.querySelector?.('.board3d-main-shell')?.dataset?.board3dInspect === 'true');
    };
    syncInspecting();
    const observer = new MutationObserver(syncInspecting);
    observer.observe(root, { attributes: true, attributeFilter: ['data-board3d-inspect'], childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
      startCenter: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      startPan: pan,
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
    const currentCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const rect = rootRef.current?.getBoundingClientRect?.() || {};
    const nextPan = nextWarRoomTwoFingerPan(
      pinchRef.current.startPan,
      pinchRef.current.startCenter,
      currentCenter,
      { width: rect.width, height: rect.height },
    );
    setPan(nextPan);
    rootRef.current?.querySelector?.('canvas.board3d-main-canvas')
      ?.dispatchEvent?.(new CustomEvent('warroom-camera-pan', { detail: nextPan }));
  };

  const releasePointer = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size > 0) return;
    pinchRef.current.active = false;
    window.setTimeout(() => markPinching(false), 0);
  };

  const centered = !shouldShowWarRoomCenter(zoom, inspecting, pan);
  const centerView = () => resetWarRoomView(rootRef.current, setZoom, inspecting, setPan);

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
      {shouldShowWarRoomCenter(zoom, inspecting, pan) && (
        <button type="button" className="war-room-board-center-btn" onClick={centerView}>
          Centrar
        </button>
      )}
    </div>
  );
}
