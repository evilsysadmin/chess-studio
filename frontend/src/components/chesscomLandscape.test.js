import { describe, expect, it, vi } from 'vitest';
import {
  isChesscomPhone,
  needsChesscomRotation,
  requestChesscomLandscapeOnEntry,
  releaseChesscomLandscape,
} from './chesscomLandscape.js';

const mobile = (width=390,height=844,coarse=true) => ({
  innerWidth:width, innerHeight:height,
  matchMedia:vi.fn(query=>({matches: query==='(pointer: coarse)' && coarse})),
});

describe('Chesscom immersive phone landscape', () => {
  it('only requests on actual phones, and portrait needs explicit rotation', () => {
    expect(isChesscomPhone({win:mobile()})).toBe(true);
    expect(needsChesscomRotation({win:mobile()})).toBe(true);
    expect(needsChesscomRotation({win:mobile(844,390)})).toBe(false);
    expect(isChesscomPhone({win:mobile(1440,900)})).toBe(false);
    expect(isChesscomPhone({win:mobile(390,844,false)})).toBe(false);
    expect(isChesscomPhone({win:mobile(1200,640)})).toBe(false);
  });

  it('ignores desktop without requesting or unlocking fullscreen', async () => {
    const root={requestFullscreen:vi.fn()};
    const doc={documentElement:root,fullscreenElement:null,exitFullscreen:vi.fn()};
    const orientation={lock:vi.fn(),unlock:vi.fn()};
    expect(await requestChesscomLandscapeOnEntry({
      win:mobile(1440,900,false),doc,screenApi:{orientation},
    })).toEqual({requested:false,fullscreen:false,landscape:false});
    expect(root.requestFullscreen).not.toHaveBeenCalled();
    expect(orientation.lock).not.toHaveBeenCalled();
    expect(await releaseChesscomLandscape({doc,screenApi:{orientation}}))
      .toEqual({unlocked:false,fullscreen:false});
  });

  it('requests on the entry gesture, preserves ownership across a retry and releases once', async () => {
    const root={};
    const doc={documentElement:root,fullscreenElement:null,exitFullscreen:vi.fn(async()=>{doc.fullscreenElement=null;})};
    root.requestFullscreen=vi.fn(async()=>{doc.fullscreenElement=root;});
    const orientation={lock:vi.fn(async()=>{}),unlock:vi.fn()};
    const args={win:mobile(),doc,screenApi:{orientation}};
    expect(await requestChesscomLandscapeOnEntry(args))
      .toEqual({requested:true,fullscreen:true,landscape:true});
    expect(await requestChesscomLandscapeOnEntry(args))
      .toEqual({requested:true,fullscreen:false,landscape:true});
    expect(root.requestFullscreen).toHaveBeenCalledOnce();
    expect(orientation.lock).toHaveBeenCalledWith('landscape');
    expect(root.requestFullscreen.mock.invocationCallOrder[0])
      .toBeLessThan(orientation.lock.mock.invocationCallOrder[0]);
    expect(await releaseChesscomLandscape(args)).toEqual({unlocked:true,fullscreen:true});
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    expect(orientation.unlock).toHaveBeenCalledOnce();
    expect(await releaseChesscomLandscape(args)).toEqual({unlocked:false,fullscreen:false});
  });

  it('never dismisses fullscreen owned by the user', async () => {
    const root={requestFullscreen:vi.fn()};
    const doc={documentElement:root,fullscreenElement:root,exitFullscreen:vi.fn()};
    const orientation={lock:vi.fn(async()=>{}),unlock:vi.fn()};
    const args={win:mobile(),doc,screenApi:{orientation}};
    expect(await requestChesscomLandscapeOnEntry(args))
      .toEqual({requested:true,fullscreen:false,landscape:true});
    expect(await releaseChesscomLandscape(args))
      .toEqual({unlocked:true,fullscreen:false});
    expect(root.requestFullscreen).not.toHaveBeenCalled();
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
  });

  it('shows a manual-rotation fallback if orientation lock is denied', async () => {
    const root={};
    const doc={documentElement:root,fullscreenElement:null,exitFullscreen:vi.fn(async()=>{doc.fullscreenElement=null;})};
    root.requestFullscreen=vi.fn(async()=>{doc.fullscreenElement=root;});
    const orientation={lock:vi.fn(async()=>{throw new Error('not allowed');}),unlock:vi.fn()};
    const args={win:mobile(),doc,screenApi:{orientation}};
    expect(await requestChesscomLandscapeOnEntry(args))
      .toEqual({requested:true,fullscreen:true,landscape:false});
    expect(await releaseChesscomLandscape(args))
      .toEqual({unlocked:false,fullscreen:true});
    expect(orientation.unlock).not.toHaveBeenCalled();
  });

  it('undoes a fullscreen acquired late after exit', async () => {
    let resolveFullscreen;
    const root={};
    const doc={documentElement:root,fullscreenElement:null,exitFullscreen:vi.fn(async()=>{doc.fullscreenElement=null;})};
    root.requestFullscreen=vi.fn(()=>new Promise(resolve=>{resolveFullscreen=()=>{
      doc.fullscreenElement=root; resolve();
    };}));
    const orientation={lock:vi.fn(async()=>{}),unlock:vi.fn()};
    const args={win:mobile(),doc,screenApi:{orientation}};
    const request=requestChesscomLandscapeOnEntry(args);
    expect(await releaseChesscomLandscape(args))
      .toEqual({unlocked:false,fullscreen:false});
    resolveFullscreen();
    expect(await request).toEqual({requested:true,fullscreen:false,landscape:false});
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    expect(orientation.unlock).toHaveBeenCalledOnce();
  });
});
