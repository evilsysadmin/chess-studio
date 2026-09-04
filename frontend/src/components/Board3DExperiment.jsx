import { useEffect } from 'react';

// Compatibility tombstone for stale session/back-stack entries from builds
// where the standalone 3D experiment was still reachable. The real 3D board
// is now the default renderer in normal games; this module deliberately owns
// no WebGL context, animation loop, chess state or network work.
export default function Board3DExperiment({ onExit }) {
  useEffect(() => {
    onExit?.();
  }, [onExit]);

  return null;
}
