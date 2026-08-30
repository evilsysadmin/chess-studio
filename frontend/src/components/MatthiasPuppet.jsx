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

const BLINK_FRAMES = [
  { offset: 0, transform: 'scaleY(.05)' },
  { offset: .16, transform: 'scaleY(1)' },
  { offset: .78, transform: 'scaleY(1)' },
  { offset: 1, transform: 'scaleY(.05)' },
];

const TALK_FRAMES = [
  { offset: 0, transform: 'scaleY(.35) scaleX(1)' },
  { offset: .2, transform: 'scaleY(1) scaleX(.82)' },
  { offset: .42, transform: 'scaleY(.48) scaleX(1.05)' },
  { offset: .66, transform: 'scaleY(.92) scaleX(.88)' },
  { offset: .82, transform: 'scaleY(.38) scaleX(1.04)' },
  { offset: 1, transform: 'scaleY(.35) scaleX(1)' },
];

export function matthiasPuppetGesturePlan(kind = 'acknowledge') {
  if (kind === 'sip') {
    const lift = rotateFrames(-29);
    return {
      duration: 1500,
      head: rotateFrames(-3.5),
      actionArm: lift,
      prop: lift,
      eyes: [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-1.5px)' },
        { transform: 'translateX(0)' },
      ],
      lids: BLINK_FRAMES,
    };
  }

  if (kind === 'bite') {
    const lift = rotateFrames(-24);
    return {
      duration: 1450,
      head: rotateFrames(3),
      actionArm: lift,
      prop: lift,
      mouth: [
        { transform: 'scaleY(.35)' },
        { transform: 'scaleY(.95)' },
        { transform: 'scaleY(.48)' },
        { transform: 'scaleY(.35)' },
      ],
    };
  }

  if (kind === 'read') {
    return {
      duration: 1350,
      head: rotateFrames(3.8),
      eyes: [
        { offset: 0, transform: 'translate(0, 0)' },
        { offset: .32, transform: 'translate(-1.8px, 1px)' },
        { offset: .62, transform: 'translate(1.7px, 1px)' },
        { offset: 1, transform: 'translate(0, 0)' },
      ],
      lids: BLINK_FRAMES,
      prop: rotateFrames(-1.2),
    };
  }

  if (kind === 'doze') {
    return {
      duration: 1800,
      head: [
        { offset: 0, transform: 'rotate(0deg)' },
        { offset: .48, transform: 'rotate(11deg)' },
        { offset: .72, transform: 'rotate(13deg)' },
        { offset: .82, transform: 'rotate(-2.5deg)' },
        { offset: 1, transform: 'rotate(0deg)' },
      ],
      lids: [
        { offset: 0, transform: 'scaleY(.05)' },
        { offset: .28, transform: 'scaleY(1)' },
        { offset: .76, transform: 'scaleY(1)' },
        { offset: 1, transform: 'scaleY(.05)' },
      ],
      brows: [{ opacity: 1 }, { opacity: .6 }, { opacity: 1 }],
    };
  }

  if (kind === 'inspect') {
    return {
      duration: 1300,
      head: rotateFrames(-4.5),
      actionArm: rotateFrames(5),
      eyes: [
        { transform: 'translateX(0)' },
        { transform: 'translateX(2.1px)' },
        { transform: 'translateX(0)' },
      ],
      brows: [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-1px)' },
        { transform: 'translateY(0)' },
      ],
    };
  }

  if (kind === 'attend') {
    return {
      duration: 1050,
      head: [
        { offset: 0, transform: 'rotate(0deg)' },
        { offset: .26, transform: 'rotate(-2.4deg)' },
        { offset: .52, transform: 'rotate(1.2deg)' },
        { offset: .76, transform: 'rotate(-.8deg)' },
        { offset: 1, transform: 'rotate(0deg)' },
      ],
      brows: [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-1.4px)' },
        { transform: 'translateY(0)' },
      ],
      eyes: [
        { transform: 'translateX(0)' },
        { transform: 'translateX(1.2px)' },
        { transform: 'translateX(0)' },
      ],
      mouth: TALK_FRAMES,
      moustache: [
        { transform: 'translateY(0)' },
        { transform: 'translateY(.8px)' },
        { transform: 'translateY(0)' },
      ],
    };
  }

  return {
    duration: 1050,
    head: rotateFrames(-2.2),
    lids: BLINK_FRAMES,
  };
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
      <rect x="121" y="91" width="17" height="14" rx="3.5" />
      <path d="M138 95c7-1 7 8 0 8" fill="none" />
      <path d="M124 88c0-4 4-4 4-8M131 88c0-4 4-4 4-8" className="matthias-puppet__steam" />
    </g>
  );

  if (kind === 'sandwich') return (
    <g className="matthias-puppet__prop-art matthias-puppet__prop-art--sandwich">
      <path d="M117 96l24 2-11 12-18-5z" />
      <path d="M118 100l20 2" className="matthias-puppet__prop-detail" />
    </g>
  );

  if (kind === 'book') return (
    <g className="matthias-puppet__prop-art matthias-puppet__prop-art--book">
      <path d="M43 111c14-5 26-3 37 4v23c-10-7-23-9-37-4z" />
      <path d="M117 111c-14-5-26-3-37 4v23c10-7 23-9 37-4z" />
      <path d="M80 115v23" className="matthias-puppet__prop-detail" />
    </g>
  );

  if (kind === 'dossier') return (
    <g className="matthias-puppet__prop-art matthias-puppet__prop-art--dossier">
      <path d="M47 110h68v28H47z" />
      <path d="M54 117h39M54 123h49M54 129h31" className="matthias-puppet__prop-detail" />
    </g>
  );

  if (kind === 'notebook') return (
    <g className="matthias-puppet__prop-art matthias-puppet__prop-art--notebook">
      <rect x="108" y="96" width="30" height="35" rx="3" />
      <path d="M114 104h17M114 110h14M114 116h18" className="matthias-puppet__prop-detail" />
      <path d="M102 123l23-32" className="matthias-puppet__pencil" />
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
  const lidsRef = useRef(null);
  const browsRef = useRef(null);
  const mouthRef = useRef(null);
  const moustacheRef = useRef(null);
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
        animatePart(lidsRef.current, plan.lids, plan.duration),
        animatePart(browsRef.current, plan.brows, plan.duration),
        animatePart(mouthRef.current, plan.mouth, plan.duration),
        animatePart(moustacheRef.current, plan.moustache, plan.duration),
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
      data-puppet-form="military-pawn"
      data-scene={scene}
      data-prop={propKind}
    >
      <ellipse className="matthias-puppet__shadow" cx="80" cy="163" rx="49" ry="7" />

      <g className="matthias-puppet__body" data-puppet-part="body">
        <path
          className="matthias-puppet__pawn-silhouette"
          d="M53 83c3 8 10 14 17 17l-7 7c-10 10-17 23-20 37h74c-3-14-10-27-20-37l-7-7c7-3 14-9 17-17z"
        />
        <path className="matthias-puppet__pawn-collar" d="M55 91h50l-9 18H64z" />
        <path className="matthias-puppet__uniform-panel" d="M64 109h32l8 34H56z" />
        <path className="matthias-puppet__sash" d="M62 111l33 29" />
        <path className="matthias-puppet__belt" d="M54 135h52" />
        <path className="matthias-puppet__pawn-base matthias-puppet__pawn-base--upper" d="M42 143h76l10 9H32z" />
        <path className="matthias-puppet__pawn-base matthias-puppet__pawn-base--lower" d="M29 152h102l10 11H19z" />
        <g className="matthias-puppet__military-insignia" data-puppet-part="uniform">
          <path d="M70 94l-8 3-5-5 9-3zM90 94l8 3 5-5-9-3z" className="matthias-puppet__epaulette" />
          <path d="M80 116l4 5-4 5-4-5z" className="matthias-puppet__medal" />
          <circle cx="80" cy="121" r="2.2" className="matthias-puppet__medal-core" />
        </g>
      </g>

      <g className="matthias-puppet__arm matthias-puppet__arm--left" data-puppet-part="left-arm">
        <path d="M59 108c-15 7-21 16-24 29" />
        <circle cx="34" cy="139" r="4.7" />
      </g>

      <g ref={actionArmRef} className="matthias-puppet__arm matthias-puppet__arm--action" data-puppet-part="action-arm">
        <path d="M101 108c15 7 21 16 24 29" />
        <circle cx="126" cy="139" r="4.7" />
      </g>

      <g ref={propRef} className="matthias-puppet__prop" data-puppet-part="prop">
        <Prop kind={propKind} />
      </g>

      <g ref={headRef} className="matthias-puppet__head" data-puppet-part="head">
        <circle cx="80" cy="57" r="30" className="matthias-puppet__pawn-head" />

        <g className="matthias-puppet__cap" data-puppet-part="cap">
          <path d="M53 42c4-17 17-25 27-25s23 8 27 25c-17-7-37-7-54 0z" className="matthias-puppet__cap-crown" />
          <path d="M52 42c16-5 40-5 56 0l-7 7H59z" className="matthias-puppet__cap-band" />
          <path d="M76 31h8l3 5-7 5-7-5z" className="matthias-puppet__cap-badge" />
          <path d="M59 48c14 3 28 3 42 0" className="matthias-puppet__cap-visor" />
        </g>

        <g ref={browsRef} className="matthias-puppet__brows" data-puppet-part="brows">
          <path d="M62 52c5-4 10-4 15-.5M84 51.5c5-3.5 10-3.5 15 .5" />
        </g>

        <g ref={eyesRef} className="matthias-puppet__eyes" data-puppet-part="eyes">
          <circle cx="69.5" cy="59" r="2.2" />
          <circle cx="91" cy="59" r="2.2" />
        </g>

        <g ref={lidsRef} className="matthias-puppet__lids" data-puppet-part="lids">
          <path d="M64 58.5c3.5-2.2 7.5-2.2 11 0M86 58.5c3.5-2.2 7.5-2.2 11 0" />
        </g>

        <circle cx="69.5" cy="59" r="8.3" className="matthias-puppet__monocle" />
        <path d="M61.2 59h-8.5M101 59h6.5" className="matthias-puppet__temple-lines" />
        <path d="M78 63.5h5" className="matthias-puppet__nose" />

        <g ref={mouthRef} className="matthias-puppet__mouth" data-puppet-part="mouth">
          <path d="M73 72c4.5 3 10 3 14.5 0" />
        </g>

        <g ref={moustacheRef} className="matthias-puppet__moustache" data-puppet-part="moustache">
          <path d="M62 74c5 5 11 5 18 1 7 4 13 4 19-1-4 9-31 9-37 0z" />
        </g>
      </g>
    </svg>
  );
}
