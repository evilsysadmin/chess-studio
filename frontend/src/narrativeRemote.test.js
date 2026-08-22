import { describe, expect, it, vi } from 'vitest';
import {
  createNarrativeCooldownGate,
  requestRemoteNarrative,
  requestRemoteNarrativeDetached,
} from './narrativeRemote.js';

describe('remote narrative transport', () => {
  it('no llama sin JWT', async () => {
    const fetchImpl = vi.fn();
    expect(await requestRemoteNarrative({ eventType:'blunder', facts:{} }, { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('manda sólo dossier factual al backend y usa el texto remoto', async () => {
    const fetchImpl = vi.fn(async (_url, init) => ({ ok:true, json:async()=>({ provider:'cloudflare', text:'  Qué desastre tan pulcro.  ' }), init }));
    const text = await requestRemoteNarrative({ eventType:'blunder', facts:{ san:'Qd4', lostPiece:'queen' }, ignored:'no' }, { token:'jwt', fetchImpl });
    expect(text).toBe('Qué desastre tan pulcro.');
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({ eventType:'blunder', facts:{ san:'Qd4', lostPiece:'queen' }, tone:'sarcastic', locale:'es-ES' });
    expect(init.headers.Authorization).toBe('Bearer jwt');
  });

  it('5xx cae limpio a null para que NarrativeProvider use fallback local', async () => {
    const fetchImpl = vi.fn(async () => ({ ok:false, status:502 }));
    expect(await requestRemoteNarrative({ eventType:'mate', facts:{} }, { token:'jwt', fetchImpl })).toBeNull();
  });

  it('provider local del backend conserva el comentario procedural del frontend', async () => {
    const fetchImpl = vi.fn(async () => ({ ok:true, json:async()=>({ provider:'local', text:'fallback genérico backend' }) }));
    expect(await requestRemoteNarrative({ eventType:'mate', facts:{} }, { token:'jwt', fetchImpl })).toBeNull();
  });

  it('el navegador sólo apunta al endpoint FastAPI', async () => {
    const fetchImpl = vi.fn(async () => ({ ok:true, json:async()=>({ provider:'cloudflare', text:'ok' }) }));
    await requestRemoteNarrative({ eventType:'generic', facts:{} }, { token:'jwt', fetchImpl });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/\/api\/narrative$/);
    expect(url).not.toContain('workers');
  });

  it('el cooldown corta ráfagas y exige separación de ply cuando está disponible', async () => {
    let now = 10000;
    const gate = createNarrativeCooldownGate({ minPlyGap: 2, minIntervalMs: 1000, now: () => now });
    const fetchImpl = vi.fn(async () => ({ ok:true, json:async()=>({ provider:'cloudflare', text:'ok' }) }));

    expect(await requestRemoteNarrative({ eventType:'blunder', ply:10, facts:{} }, { token:'jwt', fetchImpl, cooldownGate:gate })).toBe('ok');
    now += 1500;
    expect(await requestRemoteNarrative({ eventType:'tactic', ply:11, facts:{} }, { token:'jwt', fetchImpl, cooldownGate:gate })).toBeNull();
    now += 1500;
    expect(await requestRemoteNarrative({ eventType:'tactic', ply:12, facts:{} }, { token:'jwt', fetchImpl, cooldownGate:gate })).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('el adapter detached entrega después sin obligar al pipeline de jugada a await', async () => {
    const onText = vi.fn();
    const fetchImpl = vi.fn(async () => ({ ok:true, json:async()=>({ provider:'cloudflare', text:'Comentario tardío' }) }));
    const cancel = requestRemoteNarrativeDetached(
      { eventType:'blunder', facts:{ san:'Qd4' } },
      { token:'jwt', fetchImpl, onText },
    );

    expect(onText).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onText).toHaveBeenCalledWith('Comentario tardío'));
    cancel();
  });

  it('detached silencia por cooldown sin disparar fallback local', async () => {
    let now = 10000;
    const gate = createNarrativeCooldownGate({ minPlyGap: 2, minIntervalMs: 1000, now: () => now });
    const fetchImpl = vi.fn(async () => ({ ok:true, json:async()=>({ provider:'cloudflare', text:'ok' }) }));
    const onText = vi.fn();
    const onUnavailable = vi.fn();

    requestRemoteNarrativeDetached(
      { eventType:'blunder', ply:10, facts:{} },
      { token:'jwt', fetchImpl, cooldownGate:gate, onText, onUnavailable },
    );
    await vi.waitFor(() => expect(onText).toHaveBeenCalledTimes(1));

    now += 1500;
    requestRemoteNarrativeDetached(
      { eventType:'tactic', ply:11, facts:{} },
      { token:'jwt', fetchImpl, cooldownGate:gate, onText, onUnavailable },
    );

    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it('detached puede activar el fallback local si FastAPI no está disponible', async () => {
    const onText = vi.fn();
    const onUnavailable = vi.fn();
    const fetchImpl = vi.fn(async () => ({ ok:false, status:503 }));

    requestRemoteNarrativeDetached(
      { eventType:'blunder', facts:{ san:'Qd4' } },
      { token:'jwt', fetchImpl, onText, onUnavailable },
    );

    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(onText).not.toHaveBeenCalled();
  });
});
