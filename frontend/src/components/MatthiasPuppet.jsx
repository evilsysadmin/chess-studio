import { useEffect, useMemo, useRef } from 'react';
import './MatthiasPuppet.css';

const FIRST_MIN_DELAY_MS = 2_200;
const FIRST_DELAY_SPREAD_MS = 1_800;
const QUIET_MIN_DELAY_MS = 8_500;
const QUIET_DELAY_SPREAD_MS = 7_000;

export function matthiasPuppetGestureKind({ speaking = false, scene = '' } = {}) {
  if (speaking) return 'attend';
  if (/coffee|breakfast|night|beer-break/.test(scene)) return 'sip';
  if (/lunch|bocata/.test(scene)) return 'bite';
  if (/reading|strategy|dossier|weekly/.test(scene)) return 'read';
  if (/sleep/.test(scene)) return 'doze';
  if (/ops|inception/.test(scene)) return 'inspect';
  return 'acknowledge';
}

export function matthiasPuppetGestureDelay({ speaking = false, initial = false, random = Math.random } = {}) {
  if (speaking) return 120;
  const sample = Math.min(1, Math.max(0, Number(random?.()) || 0));
  const min = initial ? FIRST_MIN_DELAY_MS : QUIET_MIN_DELAY_MS;
  const spread = initial ? FIRST_DELAY_SPREAD_MS : QUIET_DELAY_SPREAD_MS;
  return Math.round(min + (sample * spread));
}

function rotateFrames(degrees) {
  return [
    { offset: 0, transform: 'rotate(0deg)' },
    { offset: .42, transform: `rotate(${degrees}deg)` },
    { offset: .72, transform: `rotate(${degrees * .92}deg)` },
    { offset: 1, transform: 'rotate(0deg)' },
  ];
}

export function matthiasPuppetGesturePlan(kind = 'acknowledge') {
  if (kind === 'sip') {
    const lift = rotateFrames(-31);
    return {
      duration: 1500,
      head: rotateFrames(-4),
      actionArm: lift,
      prop: lift,
      eyes: [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-1.5px)' },
        { transform: 'translateX(0)' },
      ],
    };
  }

  if (kind === 'bite') {
    const lift = rotateFrames(-25);
    return {
      duration: 1450,
      head: rotateFrames(3),
      actionArm: lift,
      prop: lift,
    };
  }

  if (kind === 'read') {
    return {
      duration: 1350,
      head: rotateFrames(4.5),
      eyes: [
        { offset: 0, transform: 'translate(0, 0)' },
        { offset: .32, transform: 'translate(-1.6px, 1.1px)' },
        { offset: .62, transform: 'translate(1.5px, 1.1px)' },
        { offset: 1, transform: 'translate(0, 0)' },
      ],
      prop: rotateFrames(-1.5),
    };
  }

  if (kind === 'doze') {
    return {
      duration: 1800,
      head: [
        { offset: 0, transform: 'rotate(0deg)' },
        { offset: .48, transform: 'rotate(13deg)' },
        { offset: .72, transform: 'rotate(15deg)' },
        { offset: .82, transform: 'rotate(-3deg)' },
        { offset: 1, transform: 'rotate(0deg)' },
      ],
      brows: [{ opacity: 1 }, { opacity: .55 }, { opacity: 1 }],
    };
  }

  if (kind === 'inspect') {
    return {
      duration: 1300,
      head: rotateFrames(-5),
      actionArm: rotateFrames(5),
      eyes: [
        { transform: 'translateX(0)' },
        { transform: 'translateX(2px)' },
        { transform: 'translateX(0)' },
      ],
    };
  }

  if (kind === 'attend') {
    return {
      duration: 900,
      head: [
        { offset: 0, transform: 'rotate(0deg)' },
        { offset: .34, transform: 'rotate(-3deg)' },
        { offset: .58, transform: 'rotate(1.5deg)' },
        { offset: 1, transform: 'rotate(0deg)' },
      ],
      brows: [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-1.5px)' },
        { transform: 'translateY(0)' },
      ],
    };
  }

  return { duration: 1050, head: rotateFrames(-2.4) };
}

function sceneProp(scene = '') {
  if (/coffee|breakfast|night|beer-break/.test(scene)) return 'mug';
  if (/lunch|bocata/.test(scene)) return 'sandwich';
  if (/reading|strategy|weekly/.test(scene)) return 'book';
  if (/dossier/.test(scene)) return 'dossier';
  if (/ops|inception/.test(scene)) return 'notebook';
  return 'none';
}

function Prop({ kind }) {
  if (kind === 'mug') return (
    <g className="matthias-puppet__prop-art matthias-puppet__prop-art--mug">
      <rect x="118" y="98" width="18" height="15" rx="4" />
      <path d="M136 102c8-1 8 9 0 9" fill="none" />
      <path d="M122 95c0-4 4-4 4-8M129 95c0-4 4-4 4-8" className="matthias-puppet__steam" />
    </g>
  );

  if (kind === 'sandwich') return (
    <g className="matthias-puppet__prop-art matthias-puppet__prop-art--sandwich">
      <path d="M115 101l24 2-11 12-18-5z" />
      <path d="M116 104l20 2" className="matthias-puppet__prop-detail" />
    </g>
  );

  if (kind === 'book') return (
    <g className="matthias-puppet__prop-art matthias-puppet__prop-art--book">
      <path d="M45 112c13-5 25-3 35 4v24c-10-7-22-9-35-4z" />
      <path d="M115 112c-13-5-25-3-35 4v24c10-7 22-9 35-4z" />
      <path d="M80 116v24" className="matthias-puppet__prop-detail" />
    </g>
  );

  if (kind === 'dossier') return (
    <g className="matthias-puppet__prop-art matthias-puppet__prop-art--dossier">
      <path d="M47 112h68v29H47z" />
      <path d="M54 119h39M54 125h49M54 131h31" className="matthias-puppet__prop-detail" />
    </g>
  );

  if (kind === 'notebook') return (
    <g className="matthias-puppet__prop-art matthias-puppet__prop-art--notebook">
      <rect x="108" y="102" width="30" height="36" rx="3" />
      <path d="M114 110h17M114 116h14M114 122h18" className="matthias-puppet__prop-detail" />
      <path d="M102 129l23-32" className="matthias-puppet__pencil" />
    </g>
  );

  return null;
}

function animatePart(node, frames, duration) {
  if (!node || !frames?.length || typeof node.animate !== 'function') return null;
  return node.animate(frames, {
    duration,
    iterations: 1,
    easing: 'cubic-bezier(.22,.61,.36,1)',
    fill: 'none',
  });
}

export default function MatthiasPuppet({ scene = 'base', speaking = false, reducedMotion = false }) {
  const rootRef = useRef(null);
  const headRef = useRef(null);
  const eyesRef = useRef(null);
  const browsRef = useRef(null);
  const actionArmRef = useRef(null);
  const propRef = useRef(null);
  const propKind = useMemo(() => sceneProp(scene), [scene]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    if (reducedMotion) {
      root.dataset.gestureState = 'rest';
      root.dataset.gestureKind = 'none';
      return undefined;
    }

    let cancelled = false;
    let gestureTimer = null;
    let finishTimer = null;
    let running = [];

    function stopAnimations() {
      running.forEach((animation) => animation?.cancel?.());
      running = [];
    }

    function schedule(delay) {
      gestureTimer = window.setTimeout(runGesture, delay);
    }

    function runGesture() {
      if (cancelled) return;
      const kind = matthiasPuppetGestureKind({ speaking, scene });
      const plan = matthiasPuppetGesturePlan(kind);
      root.dataset.gestureState = 'acting';
      root.dataset.gestureKind = kind;

      running = [
        animatePart(headRef.current, plan.head, plan.duration),
        animatePart(eyesRef.current, plan.eyes, plan.duration),
        animatePart(browsRef.current, plan.brows, plan.duration),
        animatePart(actionArmRef.current, plan.actionArm, plan.duration),
        animatePart(propRef.current, plan.prop, plan.duration),
      ].filter(Boolean);

      finishTimer = window.setTimeout(() => {
        if (cancelled) return;
        stopAnimations();
        root.dataset.gestureState = 'rest';
        if (!speaking) schedule(matthiasPuppetGestureDelay());
      }, plan.duration + 80);
    }

    root.dataset.gestureState = 'waiting';
    root.dataset.gestureKind = matthiasPuppetGestureKind({ speaking, scene });
    schedule(matthiasPuppetGestureDelay({ speaking, initial: !speaking }));

    return () => {
      cancelled = true;
      if (gestureTimer) window.clearTimeout(gestureTimer);
      if (finishTimer) window.clearTimeout(finishTimer);
      stopAnimations();
      root.dataset.gestureState = 'rest';
    };
  }, [reducedMotion, scene, speaking]);

  return (
    <svg
      ref={rootRef}
      className="matthias-puppet"
      viewBox="0 0 160 180"
      role="img"
      aria-label="Matthias"
      data-matthias-puppet="true"
      data-scene={scene}
      data-prop={propKind}
    >
      <ellipse className="matthias-puppet__shadow" cx="80" cy="160" rx="48" ry="8" />

      <g className="matthias-puppet__body" data-puppet-part="body">
        <path d="M55 88c-3 21-13 34-24 50h98c-11-16-21-29-24-50-6-9-15-14-25-14s-19 5-25 14z" />
        <path d="M38 138h84l12 14H26z" className="matthias-puppet__base" />
        <path d="M53 92l17 24 10-13 10 13 17-24" className="matthias-puppet__lapels" />
        <path d="M76 104h8v10h-8z" className="matthias-puppet__tie" />
      </g>

      <g className="matthias-puppet__arm matthias-puppet__arm--left" data-puppet-part="left-arm">
        <path d="M57 101c-15 6-21 18-22 30" />
        <circle cx="35" cy="132" r="5" />
      </g>

      <g ref={actionArmRef} className="matthias-puppet__arm matthias-puppet__arm--action" data-puppet-part="action-arm">
        <path d="M103 101c15 6 20 17 23 30" />
        <circle cx="127" cy="132" r="5" />
      </g>

      <g ref={propRef} className="matthias-puppet__prop" data-puppet-part="prop">
        <Prop kind={propKind} />
      </g>

      <g ref={headRef} className="matthias-puppet__head" data-puppet-part="head">
        <circle cx="80" cy="51" r="30" />
        <path d="M57 31c13-15 36-15 47 0-12-7-34-7-47 0z" className="matthias-puppet__brow-ridge" />
        <g ref={browsRef} className="matthias-puppet__brows" data-puppet-part="brows">
          <path d="M63 45c5-3 10-3 14 0M84 44c5-3 10-2 14 1" />
        </g>
        <g ref={eyesRef} className="matthias-puppet__eyes" data-puppet-part="eyes">
          <circle cx="70" cy="52" r="2.2" />
          <circle cx="91" cy="52" r="2.2" />
        </g>
        <path d="M72 65c5 4 12 4 17 0" className="matthias-puppet__mouth" />
        <path d="M78 57h5" className="matthias-puppet__nose" />
        <path d="M57 51h-8M111 51h-8" className="matthias-puppet__temple-lines" />
        <circle cx="70" cy="52" r="8" className="matthias-puppet__monocle" />
        <path d="M63 70c5 5 10 5 17 1 7 4 12 4 18-1-4 9-30 9-35 0z" className="matthias-puppet__moustache" />
      </g>
    </svg>
  );
}
