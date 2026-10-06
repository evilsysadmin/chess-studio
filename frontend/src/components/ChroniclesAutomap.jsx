import { useEffect, useMemo, useRef } from 'react';
import {
  chroniclesMapContentPosition,
  chroniclesMapForState,
} from '../chronicles/chroniclesMapCatalog.js';
import {
  chroniclesAutomapCellKey,
  chroniclesAutomapFacingDegrees,
  chroniclesAutomapRevealedCells,
} from '../chronicles/chroniclesAutomap.js';

function discoveredMarkers(map, revealed) {
  const groups = [
    ['exit', map?.exits || []],
    ['treasure', map?.treasures || []],
    ['interactable', map?.interactables || []],
  ];

  return groups.flatMap(([kind, entries]) => entries.flatMap((entry) => {
    const position = chroniclesMapContentPosition(map, entry);
    if (!position || !revealed.has(chroniclesAutomapCellKey(position.x, position.y))) return [];
    return [{ kind, entry, position }];
  }));
}

function automapViewport(revealed, state) {
  const points = [...revealed].map((key) => {
    const [x, y] = String(key).split(':').map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }).filter(Boolean);

  if (!points.length && state) points.push({ x: state.x, y: state.y });

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  const contentWidth = Math.max(1, maxX - minX + 1);
  const contentHeight = Math.max(1, maxY - minY + 1);
  const width = Math.max(5.2, contentWidth + 1.2);
  const height = Math.max(5.2, contentHeight + 1.2);
  const centerX = (minX + maxX + 1) / 2;
  const centerY = (minY + maxY + 1) / 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

function MapMarker({ marker }) {
  const { x, y } = marker.position;
  const cx = x + 0.5;
  const cy = y + 0.5;
  if (marker.kind === 'exit') {
    return (
      <g className="chronicles-automap__marker is-exit" aria-label={marker.entry?.label || 'Salida'}>
        <rect x={x + 0.22} y={y + 0.18} width="0.56" height="0.64" rx="0.08" />
        <path d={`M ${x + 0.5} ${y + 0.29} V ${y + 0.71} M ${x + 0.41} ${y + 0.62} L ${x + 0.5} ${y + 0.71} L ${x + 0.59} ${y + 0.62}`} />
      </g>
    );
  }
  if (marker.kind === 'treasure') {
    return <path className="chronicles-automap__marker is-treasure" d={`M ${cx} ${y + 0.2} L ${x + 0.8} ${cy} L ${cx} ${y + 0.8} L ${x + 0.2} ${cy} Z`} />;
  }
  return <circle className="chronicles-automap__marker is-interactable" cx={cx} cy={cy} r="0.18" />;
}

export default function ChroniclesAutomap({ open, state, visitedCells, onClose }) {
  const closeRef = useRef(null);
  const map = chroniclesMapForState(state);
  const visited = useMemo(() => {
    const next = new Set(Array.isArray(visitedCells) ? visitedCells : []);
    if (state?.mapId && Number.isInteger(state.x) && Number.isInteger(state.y)) {
      next.add(chroniclesAutomapCellKey(state.x, state.y));
    }
    return next;
  }, [state?.mapId, state?.x, state?.y, visitedCells]);
  const revealed = useMemo(
    () => chroniclesAutomapRevealedCells(map, Array.from(visited)),
    [map, visited],
  );
  const viewport = useMemo(() => automapViewport(revealed, state), [revealed, state]);
  const markers = useMemo(() => discoveredMarkers(map, revealed), [map, revealed]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open || !state || !map) return null;

  const facing = chroniclesAutomapFacingDegrees(state.direction);
  const cx = state.x + 0.5;
  const cy = state.y + 0.5;

  return (
    <div
      id="chronicles-automap"
      className="chronicles-automap"
      data-chronicles-automap="open"
      role="dialog"
      aria-modal="true"
      aria-label="Automapa de Chronicles"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section className="chronicles-automap__panel">
        <header>
          <div>
            <span>AUTOMAPA · EXPLORACIÓN</span>
            <strong>{map.title || 'Chronicles of Matthias'}</strong>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar automapa">×</button>
        </header>

        <div className="chronicles-automap__canvas">
          <svg
            viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
            role="img"
            aria-label={`Mapa explorado de ${map.title || 'la zona'}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {map.grid.flatMap((row, y) => Array.from(row).map((tile, x) => {
              const key = chroniclesAutomapCellKey(x, y);
              if (!revealed.has(key)) return null;
              const wall = tile === '#';
              return (
                <rect
                  key={key}
                  x={x + 0.03}
                  y={y + 0.03}
                  width="0.94"
                  height="0.94"
                  rx="0.07"
                  className={`chronicles-automap__cell ${wall ? 'is-wall' : 'is-floor'} ${visited.has(key) ? 'is-visited' : ''}`}
                />
              );
            }))}
            {markers.map((marker) => (
              <MapMarker
                key={`${marker.kind}:${marker.entry?.id || chroniclesAutomapCellKey(marker.position.x, marker.position.y)}`}
                marker={marker}
              />
            ))}
            <g
              className="chronicles-automap__party-marker"
              data-chronicles-map-facing={state.direction}
              transform={`rotate(${facing} ${cx} ${cy})`}
              aria-label="Posición y orientación del grupo"
            >
              <path d={`M ${cx} ${cy - 0.42} L ${cx + 0.3} ${cy + 0.31} L ${cx} ${cy + 0.16} L ${cx - 0.3} ${cy + 0.31} Z`} />
              <circle cx={cx} cy={cy + 0.12} r="0.08" />
            </g>
          </svg>
        </div>

        <footer>
          <span><i className="is-party" aria-hidden="true">▲</i> grupo</span>
          <span><i className="is-exit" aria-hidden="true">□</i> salida descubierta</span>
          <span>Se dibuja al explorar · <kbd>M</kbd> cerrar</span>
        </footer>
      </section>
    </div>
  );
}
