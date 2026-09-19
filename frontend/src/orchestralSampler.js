import { request } from './http.js';
import { orchestralPlaybackRateForSemitones } from './musicTuning.js';

const assetBase = (() => {
  const configured = import.meta.env?.BASE_URL || '/';
  return configured.endsWith('/') ? configured : `${configured}/`;
})();

export const ORCHESTRAL_SAMPLE_LIBRARY = Object.freeze({
  strings: Object.freeze([
    { root: 54, file: 'violin-fs3.mp3' },
    { root: 60, file: 'violin-c4.mp3' },
    { root: 64, file: 'violin-e4.mp3' },
    { root: 67, file: 'violin-g4.mp3' },
    { root: 71, file: 'violin-b4.mp3' },
    { root: 74, file: 'violin-d5.mp3' },
  ]),
  cello: Object.freeze([
    { root: 45, file: 'cello-a2.mp3' },
    { root: 48, file: 'cello-c3.mp3' },
    { root: 52, file: 'cello-e3.mp3' },
    { root: 55, file: 'cello-g3.mp3' },
    { root: 59, file: 'cello-b3.mp3' },
  ]),
  spiccatoStrings: Object.freeze([
    { root: 60, files: ['spiccato-violin-c4-rr1.mp3', 'spiccato-violin-c4-rr2.mp3'] },
    { root: 64, files: ['spiccato-violin-e4-rr1.mp3', 'spiccato-violin-e4-rr2.mp3'] },
    { root: 67, files: ['spiccato-violin-g4-rr1.mp3', 'spiccato-violin-g4-rr2.mp3'] },
    { root: 71, files: ['spiccato-violin-b4-rr1.mp3', 'spiccato-violin-b4-rr2.mp3'] },
    { root: 74, files: ['spiccato-violin-d5-rr1.mp3', 'spiccato-violin-d5-rr2.mp3'] },
  ]),
  spiccatoCello: Object.freeze([
    { root: 45, files: ['spiccato-cello-a2-rr1.mp3', 'spiccato-cello-a2-rr2.mp3'] },
    { root: 48, files: ['spiccato-cello-c3-rr1.mp3', 'spiccato-cello-c3-rr2.mp3'] },
    { root: 52, files: ['spiccato-cello-e3-rr1.mp3', 'spiccato-cello-e3-rr2.mp3'] },
  ]),
});

const contextCaches = new WeakMap();

function sampleUrl(file) {
  return `${assetBase}audio/orchestra/${file}`;
}

export function selectOrchestralSample(kind, midiNote, variation = 0) {
  const samples = ORCHESTRAL_SAMPLE_LIBRARY[kind];
  const note = Number(midiNote);
  if (!samples || !Number.isFinite(note)) return null;
  const selected = samples.reduce((nearest, candidate) => (
    Math.abs(note - candidate.root) < Math.abs(note - nearest.root) ? candidate : nearest
  ));
  const variants = selected.files || [selected.file];
  const variantIndex = Math.abs(Math.floor(Number(variation) || 0)) % variants.length;
  const file = variants[variantIndex];
  return {
    ...selected,
    file,
    url: sampleUrl(file),
    semitones: note - selected.root,
    playbackRate: orchestralPlaybackRateForSemitones(note - selected.root),
  };
}

function cacheFor(ctx) {
  let cache = contextCaches.get(ctx);
  if (!cache) {
    cache = new Map();
    contextCaches.set(ctx, cache);
  }
  return cache;
}

function decodeAudio(ctx, bytes) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (buffer) => {
      if (!settled) {
        settled = true;
        resolve(buffer);
      }
    };
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    try {
      const pending = ctx.decodeAudioData(bytes, done, fail);
      if (pending?.then) pending.then(done, fail);
    } catch (error) {
      fail(error);
    }
  });
}

export function requestOrchestralSample(ctx, kind, midiNote, variation = 0) {
  const sample = selectOrchestralSample(kind, midiNote, variation);
  if (!ctx || !sample || typeof fetch !== 'function' || typeof ctx.decodeAudioData !== 'function') {
    return Promise.resolve(null);
  }
  const cache = cacheFor(ctx);
  const existing = cache.get(sample.url);
  if (existing?.buffer) return Promise.resolve(existing.buffer);
  if (existing?.pending) return existing.pending;
  if (existing?.failed) return Promise.resolve(null);

  const record = {};
  record.pending = request(sample.url, { cache: 'force-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`Orchestral sample ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => decodeAudio(ctx, bytes))
    .then((buffer) => {
      record.buffer = buffer;
      record.pending = null;
      return buffer;
    })
    .catch(() => {
      record.failed = true;
      record.pending = null;
      return null;
    });
  cache.set(sample.url, record);
  return record.pending;
}

let articulationSequence = 0;

export function readyOrchestralSample(ctx, kind, midiNote) {
  const variation = kind.startsWith('spiccato') ? articulationSequence++ : 0;
  const sample = selectOrchestralSample(kind, midiNote, variation);
  if (!ctx || !sample) return null;
  const record = cacheFor(ctx).get(sample.url);
  if (!record?.buffer) {
    requestOrchestralSample(ctx, kind, midiNote, variation);
    return null;
  }
  return { ...sample, buffer: record.buffer };
}

export function orchestralKindsForTheme(theme) {
  if (!theme) return [];
  return [...new Set([
    theme.leadInstrument,
    theme.counterInstrument,
    theme.chordInstrument,
    theme.bassInstrument,
    theme.signatureInstrument,
    theme.signature?.instrument,
    ...(theme.sections || []).flatMap((section) => [
      section.leadInstrument,
      section.counterInstrument,
      section.chordInstrument,
      section.bassInstrument,
    ]),
  ])].filter((kind) => ORCHESTRAL_SAMPLE_LIBRARY[kind]);
}

export function primeOrchestralTheme(ctx, theme) {
  if (!ctx || !theme) return Promise.resolve([]);
  const requests = orchestralKindsForTheme(theme)
    .flatMap((kind) => ORCHESTRAL_SAMPLE_LIBRARY[kind].flatMap(({ root, files }) => (
      (files || [null]).map((_, variation) => requestOrchestralSample(ctx, kind, root, variation))
    )));
  return Promise.all(requests);
}
