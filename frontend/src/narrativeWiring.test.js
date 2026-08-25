// STATIC CONTRACT: protege que la narrativa remota siga fuera del camino crítico de la jugada.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const game = readFileSync(new URL('./components/GameScreen.jsx', import.meta.url), 'utf8');

describe('remote narrative wiring', () => {
  it('usa el adapter detached con cooldown para eventos notables', () => {
    expect(game).toContain('createNarrativeCooldownGate');
    expect(game).toContain('requestRemoteNarrativeDetached(');
    expect(game).toContain('cooldownGate: remoteNarrativeGateRef.current');
    expect(game).toContain('eventType: comment.event?.type');
    expect(game).toContain('memory,');
  });

  it('conserva el comentario procedural como fallback de red', () => {
    expect(game).toContain('const showLocal = () => showCpuComment');
    expect(game).toContain('onUnavailable: showLocal');
    expect(game).toContain('onText: (text) => showCpuComment({ ...comment, text }, meta)');
  });

  it('no envía hechos remotos antes de que FastAPI confirme la jugada', () => {
    const apiCommit = game.indexOf('await Promise.all([api.playMove');
    const humanNarrative = game.indexOf("showNoteworthy(humanComment, 'human', { history: updated.history });", apiCommit);
    expect(apiCommit).toBeGreaterThan(-1);
    expect(humanNarrative).toBeGreaterThan(apiCommit);
    expect(game).toContain("showNoteworthy(humanComment, 'human', { allowRemote: false });");
  });
});
