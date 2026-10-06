import { useMemo } from 'react';
import {
  chroniclesMapContentPosition,
  chroniclesMapForState,
} from '../chronicles/chroniclesMapCatalog.js';
import {
  chroniclesAutomapCellKey,
  chroniclesAutomapFacingDegrees,
  chroniclesAutomapLocalVisibleCells,
  chroniclesAutomapRevealedCells,
} from '../chronicles/chroniclesAutomap.js';

export const CHRONICLES_MINIMAP_RADIUS = 3;

function inWindow(position, state, radius) {
  return Boolean(
    position
    && Math.abs(position.x - state.x) <= radius
    && Math.abs(position.y - state.y) <= radius
  );
}

function discoveredLocalMarkers(map, state, revealed, radius) {
  const groups = [
    ['exit', map?.exits || []],
    ['treasure', map?.treasures || []],
    ['interactable', map?.interactables || []],
  ];

  return groups.flatMap(([kind, entries]) => entries.flatMap((entry) => {
    const position = chroniclesMapContentPosition(map, entry);
    if (!inWindow(position, state, radius)) return [];
    if (!revealed.has(chroniclesAutomapCellKey(position.x, position.y))) return [];
    return [{ kind, entry, position }];
  }));
}

function Marker({ marker }) {
  const { x, y } = marker.position;
  if (marker.kind === 'exit') {
    return (
      <rect
        className="chronicles-minimap__marker is-exit"
        x={x + .27}
        y={y + .27}
        width=".46"
        height=".46"
        rx=".08"
      />
    );
  }
  if (marker.kind === 'treasure') {
    return (
      <path
        className="chronicles-minimap__marker is-treasure"
        d={`M ${x + .5} ${y + .27} L ${x + .73} ${y + .5} L ${x + .5} ${y + .73} L ${x + .27} ${y + .5} Z`}
      />
    );
  }
  return (
    <circle
      className="chronicles-minimap__marker is-interactable"
      cx={x + .5}
      cy={y + .5}
      r=".17"
    />
  );
}

export default function ChroniclesMinimap({
  state,
  visitedCells,
  hidden = false,
  radius = CHRONICLES_MINIMAP_RADIUS,
  onExpand,
}) {
  const map = chroniclesMapForState(state);
  const visited = useMemo(
    () => new Set(Array.isArray(visitedCells) ? visitedCells : []),
    [visitedCells],
  );
  const discovered = useMemo(
    () => chroniclesAutomapRevealedCells(map, Array.from(visited)),
    [map, visited],
  );
  const localVisible = useMemo(
    () => chroniclesAutomapLocalVisibleCells(map, state, radius),
    [map, radius, state?.x, state?.y],
  );
  const revealed = useMemo(
    () => new Set([...discovered, ...localVisible]),
    [discovered, localVisible],
  );

  if (hidden || !state || !map) return null;

  const size = radius * 2 + 1;
  const minX = state.x - radius;
  const minY = state.y - radius;
  const cx = state.x + .5;
  const cy = state.y + .5;
  const facing = chroniclesAutomapFacingDegrees(state.direction);
  const markers = discoveredLocalMarkers(map, state, discovered, radius);

  return (
    <button
      type="button"
      className="chronicles-minimap"
      data-chronicles-minimap="visible"
      aria-label="Minimapa local. Abrir automapa completo"
      onClick={onExpand}
    >
      <span className="chronicles-minimap__title" aria-hidden="true">LOCAL</span>
      <svg
        viewBox={`${minX} ${minY} ${size} ${size}`}
        role="img"
        aria-label={`Entorno explorado en un radio de ${radius} casillas`}
      >
        {map.grid.flatMap((row, y) => Array.from(row).map((tile, x) => {
          if (Math.abs(x - state.x) > radius || Math.abs(y - state.y) > radius) return null;
          const key = chroniclesAutomapCellKey(x, y);
          if (!revealed.has(key)) return null;
          return (
            <rect
              key={key}
              x={x + .04}
              y={y + .04}
              width=".92"
              height=".92"
              rx=".08"
              className={`chronicles-minimap__cell ${tile === '#' ? 'is-wall' : 'is-floor'} ${visited.has(key) ? 'is-visited' : ''}`}
            />
          );
        }))}
        {markers.map((marker) => (
          <Marker
            key={`${marker.kind}:${marker.entry?.id || `${marker.position.x}:${marker.position.y}`}`}
            marker={marker}
          />
        ))}
        <g
          className="chronicles-minimap__party"
          transform={`rotate(${facing} ${cx} ${cy})`}
          data-chronicles-minimap-facing={state.direction}
        >
          <path d={`M ${cx} ${cy - .38} L ${cx + .28} ${cy + .26} L ${cx} ${cy + .12} L ${cx - .28} ${cy + .26} Z`} />
        </g>
      </svg>
      <span className="chronicles-minimap__expand" aria-hidden="true">⌖</span>
    </button>
  );
}
