import { useEffect, useMemo, useRef, useState } from 'react';
import { abortableDelay, isAbortError } from '../asyncControl.js';
import coffeeSprite from '../assets/matthias-frames/coffee-sprite.webp';
import lunchSprite from '../assets/matthias-frames/lunch-sprite.webp';
import './MatthiasFrameSequence.css';

const FRAME_FADE_MS = 180;
const FRAME_PREPARE_MS = 34;

const SEQUENCES = Object.freeze({
  coffee: Object.freeze({
    sprite: coffeeSprite,
    action: 'drink',
    frames: Object.freeze([0, 1, 2, 3, 4, 5, 0]),
    holds: Object.freeze([650, 800, 900, 1250, 850, 700, 0]),
  }),
  lunch: Object.freeze({
    sprite: lunchSprite,
    action: 'eat',
    frames: Object.freeze([0, 1, 2, 3, 4, 5, 0]),
    holds: Object.freeze([650, 800, 900, 1050, 1200, 900, 0]),
  }),
});

export function matthiasFrameSequenceConfig(family = '') {
  return SEQUENCES[family] || null;
}

export function matthiasFramePosition(index = 0) {
  const safe = Math.max(0, Math.min(5, Number(index) || 0));
  const col = safe % 3;
  const row = Math.floor(safe / 3);
  return `${col * 50}% ${row * 100}%`;
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
  const [spriteState, setSpriteState] = useState(() => (reducedMotion ? 'unused' : 'loading'));
  const slotRef = useRef(0);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!config) {
      setSpriteState('error');
      return undefined;
    }
    if (reducedMotion) {
      setSpriteState('unused');
      return undefined;
    }
    if (typeof Image === 'undefined') {
      setSpriteState('loading');
      return undefined;
    }

    let cancelled = false;
    let settled = false;
    const image = new Image();

    function commit(state) {
      if (cancelled || settled) return;
      settled = true;
      setSpriteState(state);
    }

    async function validateDecodedSprite() {
      try {
        if (typeof image.decode === 'function') await image.decode();
        commit(image.naturalWidth > 0 && image.naturalHeight > 0 ? 'ready' : 'error');
      } catch {
        commit('error');
      }
    }

    setSpriteState('loading');
    image.onload = () => {
      void validateDecodedSprite();
    };
    image.onerror = () => commit('error');
    image.src = config.sprite;
    if (image.complete) void validateDecodedSprite();

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
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
    root.dataset.spriteState = spriteState;
    root.dataset.frameIndex = '0';

    if (reducedMotion) {
      root.dataset.sequenceState = 'reduced';
      return () => controller.abort();
    }

    if (spriteState !== 'ready') {
      root.dataset.sequenceState = spriteState === 'error' ? 'fallback' : 'loading';
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

    runLoop();

    return () => controller.abort();
  }, [config, reducedMotion, spriteState]);

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
        data-sprite-state="unused"
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
      data-sprite-state={spriteState}
      data-frame-index="0"
      data-sequence-cycle-count="0"
    >
      <img
        src={fallbackAvatar}
        alt=""
        draggable="false"
        data-matthias-canonical-art="true"
        data-sequence-fallback="true"
      />
      {[0, 1].map((slot) => (
        <span
          key={slot}
          className={`matthias-frame-sequence__layer${activeSlot === slot ? ' is-active' : ''}`}
          data-frame-layer={slot}
          style={{
            backgroundImage: `url(${config.sprite})`,
            backgroundPosition: matthiasFramePosition(layerFrames[slot]),
          }}
        />
      ))}
    </span>
  );
}
