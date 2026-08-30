import { useEffect, useMemo, useRef, useState } from 'react';
import coffeeSprite from '../assets/matthias-frames/coffee-sprite.webp';
import lunchSprite from '../assets/matthias-frames/lunch-sprite.webp';
import './MatthiasFrameSequence.css';

const FRAME_FADE_MS = 180;

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

function wait(ms, setTimer) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    setTimer(timer);
  });
}

export default function MatthiasFrameSequence({ family, fallbackAvatar, reducedMotion = false }) {
  const config = useMemo(() => matthiasFrameSequenceConfig(family), [family]);
  const [layerFrames, setLayerFrames] = useState([0, 0]);
  const [activeSlot, setActiveSlot] = useState(0);
  const slotRef = useRef(0);
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !config) return undefined;

    let disposed = false;
    let timer = null;
    const setTimer = (value) => { timer = value; };

    const reset = () => {
      if (timer) window.clearTimeout(timer);
      slotRef.current = 0;
      setActiveSlot(0);
      setLayerFrames([0, 0]);
      root.dataset.sequenceState = reducedMotion ? 'reduced' : 'waiting';
      root.dataset.frameIndex = '0';
    };

    reset();
    if (reducedMotion) return reset;

    async function crossfadeTo(frame) {
      if (disposed) return;
      const nextSlot = slotRef.current === 0 ? 1 : 0;
      setLayerFrames((current) => current.map((value, index) => (index === nextSlot ? frame : value)));
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      if (disposed) return;
      slotRef.current = nextSlot;
      setActiveSlot(nextSlot);
      root.dataset.frameIndex = String(frame);
      await wait(FRAME_FADE_MS, setTimer);
    }

    async function runSequence() {
      if (disposed) return;
      root.dataset.sequenceState = 'acting';
      root.dataset.sequenceCycleCount = String((Number(root.dataset.sequenceCycleCount) || 0) + 1);

      for (let index = 1; index < config.frames.length; index += 1) {
        const hold = config.holds[index - 1] || 0;
        if (hold > 0) await wait(hold, setTimer);
        if (disposed) return;
        await crossfadeTo(config.frames[index]);
      }

      if (disposed) return;
      root.dataset.sequenceState = 'rest';
      timer = window.setTimeout(runSequence, matthiasFrameSequenceDelay({ first: false }));
    }

    timer = window.setTimeout(runSequence, matthiasFrameSequenceDelay({ first: true }));

    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [config, reducedMotion]);

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
      data-sequence-state="waiting"
      data-frame-index="0"
      data-sequence-cycle-count="0"
    >
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
