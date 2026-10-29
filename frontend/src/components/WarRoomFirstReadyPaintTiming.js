// Record only the first Blender ready draw, without changing scene rendering
// or taking GPU readbacks. These are elapsed JS-wall timings, not GPU/CPU counters.
export function beginWarRoomFirstReadyPaintTiming(
  canvas,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
) {
  const dataset = canvas?.dataset;
  if (
    !dataset || dataset.warRoomVariantStatus !== 'ready'
    || dataset.warRoomShellTimingReadyPaintMs !== undefined
    || dataset.warRoomShellTimingRenderMs !== undefined
  ) return null;
  const startedAt = now();
  let renderedAt = null;
  return {
    afterRender(renderInfo) {
      if (renderedAt !== null) return;
      renderedAt = now();
      dataset.warRoomShellTimingRenderMs = String(Math.round(Math.max(0, renderedAt - startedAt)));
      // WebGLRenderer.info.render reports the most recent render's submitted
      // primitives. Capture once without GPU readbacks, no scene traversal.
      for (const [field, name] of [
        ['calls', 'Calls'], ['triangles', 'Triangles'],
        ['lines', 'Lines'], ['points', 'Points'],
      ]) {
        const value = renderInfo?.[field];
        if (Number.isSafeInteger(value) && value >= 0) {
          dataset[`warRoomFirstReadyRender${name}`] = String(value);
        }
      }
    },
    afterDiagnostics() {
      if (renderedAt === null || dataset.warRoomShellTimingPostRenderMs !== undefined) return;
      dataset.warRoomShellTimingPostRenderMs = String(Math.round(Math.max(0, now() - renderedAt)));
    },
  };
}
