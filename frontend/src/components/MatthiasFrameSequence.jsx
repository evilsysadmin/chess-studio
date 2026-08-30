import { useEffect, useMemo, useRef, useState } from 'react';
import { abortableDelay, isAbortError } from '../asyncControl.js';
import coffee0 from '../assets/matthias-frames/coffee-0.webp';
import coffee1 from '../assets/matthias-frames/coffee-1.webp';
import coffee2 from '../assets/matthias-frames/coffee-2.webp';
import lunch0 from '../assets/matthias-frames/lunch-0.webp';
import lunch1 from '../assets/matthias-frames/lunch-1.webp';
import lunch2 from '../assets/matthias-frames/lunch-2.webp';
import lunch3 from '../assets/matthias-frames/lunch-3.webp';
import './MatthiasFrameSequence.css';

const FRAME_FADE_MS = 220;
const FRAME_PREPARE_MS = 34;

const SEQUENCES = Object.freeze({
  coffee: Object.freeze({
    poses: Object.freeze([coffee0, coffee1, coffee2]),
    action: 'drink',
    frames: Object.freeze([0, 1, 2, 2, 1, 0]),
    holds: Object.freeze([700, 950, 1450, 500, 850, 0]),
  }),
  lunch: Object.freeze({
    poses: Object.freeze([lunch0, lunch1, lunch2, lunch3]),
    action: 'eat',
    frames: Object.freeze([0, 1, 2, 3, 2, 1, 0]),
    holds: Object.freeze([700, 900, 1000, 1450, 600, 850, 0]),
  }),
});

export function matthiasFrameSequenceConfig(family = '') {
  return SEQUENCES[family] || null;
}

export function matthiasFrameSequenceDelay({ first = false } = {}) {
  return first
    ? 1400 + Math.round(Math.random() * 900)
    : 10_000 + Math.round(Math.random() * 6_000);
}

export default function MatthiasFrameSequence({ family, fallbackAvatar, reducedMotion = false }) {
  const config = useMemo(() => matthiasFrameSequenceConfig(family), [family]);
  const [layerFrames, setLayerFrames] = useState([0, 0]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [frameState, setFrameState] = useState(() => (reducedMotion ? 'unused' : 'loading'));
  const slotRef = useRef(0);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!config) {
      setFrameState('error');
      return undefined;
    }
    if (reducedMotion) {
      setFrameState('unused');
      return undefined;
    }
    if (typeof Image === 'undefined') {
      setFrameState('loading');
      return undefined;
    }

    let cancelled = false;
    const images = config.poses.map((src) => {
      const image = new Image();
      image.src = src;
      return image;
    });

    async function validateFrames() {
      try {
        await Promise.all(images.map((image) => (
          typeof image.decode === 'function' ? image.decode() : Promise.resolve()
        )));
        if (cancelled) return;
        setFrameState(images.every((image) => image.naturalWidth > 0 && image.naturalHeight > 0) ? 'ready' : 'error');
      } catch {
        if (!cancelled) setFrameState('error');
      }
    }

    setFrameState('loading');
    void validateFrames();

    return () => {
      cancelled = true;
    };
  }, [config, reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !config) return undefined;

    const controller = new AbortController();
    const { signal } = controller;

    slotRef.current = 0;
    setActiveSlot(0);
    setLayerFrames([0, 0]);
    root.dataset.frameState = frameState;
    root.dataset.frameIndex = '0';

    if (reducedMotion) {
      root.dataset.sequenceState = 'reduced';
      return () => controller.abort();
    }

    if (frameState !== 'ready') {
      root.dataset.sequenceState = frameState === 'error' ? 'fallback' : 'loading';
      return () => controller.abort();
    }

    root.dataset.sequenceState = 'waiting';

    async function crossfadeTo(frame) {
      const nextSlot = slotRef.current === 0 ? 1 : 0;
      setLayerFrames((current) => current.map((value, index) => (index === nextSlot ? frame : value)));
      await abortableDelay(FRAME_PREPARE_MS, signal);
      if (signal.aborted) return;
      slotRef.current = nextSlot;
      setActiveSlot(nextSlot);
      root.dataset.frameIndex = String(frame);
      await abortableDelay(FRAME_FADE_MS, signal);
    }

    async function runLoop() {
      try {
        await abortableDelay(matthiasFrameSequenceDelay({ first: true }), signal);

        while (!signal.aborted) {
          root.dataset.sequenceState = 'acting';
          root.dataset.sequenceCycleCount = String((Number(root.dataset.sequenceCycleCount) || 0) + 1);

          for (let index = 1; index < config.frames.length; index += 1) {
            const hold = config.holds[index - 1] || 0;
            if (hold > 0) await abortableDelay(hold, signal);
            await crossfadeTo(config.frames[index]);
          }

          if (signal.aborted) return;
          root.dataset.sequenceState = 'rest';
          await abortableDelay(matthiasFrameSequenceDelay({ first: false }), signal);
        }
      } catch (error) {
        if (!isAbortError(error)) throw error;
      }
    }

    void runLoop();

    return () => controller.abort();
  }, [config, frameState, reducedMotion]);

  if (!config) return null;

  if (reducedMotion) {
    return (
      <span
        ref={rootRef}
        className="matthias-frame-sequence is-reduced"
        data-matthias-frame-sequence="true"
        data-sequence-family={family}
        data-sequence-action={config.action}
        data-sequence-state="reduced"
        data-frame-state="unused"
        data-frame-index="0"
        data-sequence-cycle-count="0"
      >
        <img src={fallbackAvatar} alt="" draggable="false" data-matthias-canonical-art="true" />
      </span>
    );
  }

  return (
    <span
      ref={rootRef}
      className="matthias-frame-sequence"
      data-matthias-frame-sequence="true"
      data-sequence-family={family}
      data-sequence-action={config.action}
      data-sequence-state="loading"
      data-frame-state={frameState}
      data-frame-index="0"
      data-sequence-cycle-count="0"
    >
      <img
        className="matthias-frame-sequence__fallback"
        src={fallbackAvatar}
        alt=""
        draggable="false"
        data-matthias-canonical-art="true"
        data-sequence-fallback="true"
      />
      {[0, 1].map((slot) => (
        <img
          key={slot}
          className={`matthias-frame-sequence__layer${frameState === 'ready' && activeSlot === slot ? ' is-active' : ''}`}
          data-frame-layer={slot}
          data-frame-pose={layerFrames[slot]}
          src={config.poses[layerFrames[slot]]}
          alt=""
          draggable="false"
        />
      ))}
    </span>
  );
}
