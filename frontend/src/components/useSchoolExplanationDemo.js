import { useMemo, useState } from 'react';
import { buildSchoolTeachingLayers } from './SchoolTeachingLayers.js';
import { buildSchoolExplanationDemo, schoolExplanationFrameLabel } from './SchoolExplanationDemo.js';

export default function useSchoolExplanationDemo({
  lesson,
  line,
  lessonComplete,
  practiceFen,
  practiceAnimation,
  practiceTeachingLayers,
  animationSeqRef,
  cancelPlayback,
} = {}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [animation, setAnimation] = useState(null);

  const demo = useMemo(
    () => buildSchoolExplanationDemo({ fen: lesson?.fen, line }),
    [lesson, line],
  );
  const available = Boolean(lesson && (!lesson.exam || lessonComplete));
  const frame = demo.ok ? demo.frames[step] || demo.frames[0] : null;
  const guideMove = open
    ? (frame?.animate || (step === 0 ? demo.frames?.[1]?.animate : null))
    : null;

  const close = () => {
    setOpen(false);
    setStep(0);
    setAnimation(null);
  };

  const show = (nextStep, { animateForward = true } = {}) => {
    if (!demo.ok) return;
    const clamped = Math.max(0, Math.min(demo.finalIndex, Number(nextStep) || 0));
    const nextFrame = demo.frames[clamped];
    setStep(clamped);
    if (animateForward && nextFrame?.animate) {
      animationSeqRef.current += 1;
      setAnimation({ ...nextFrame.animate, seq: animationSeqRef.current });
    } else {
      setAnimation(null);
    }
  };

  const openDemo = () => {
    if (!available || !demo.ok) return false;
    cancelPlayback?.();
    setStep(0);
    setAnimation(null);
    setOpen(true);
    return true;
  };

  return Object.freeze({
    open,
    step,
    available,
    demo,
    frame,
    label: schoolExplanationFrameLabel(frame),
    openDemo,
    close,
    show,
    displayFen: open && frame ? frame.fen : practiceFen,
    displayAnimation: open ? animation : practiceAnimation,
    displayTeachingLayers: open
      ? buildSchoolTeachingLayers({ guideMove, dangerSquares: [] })
      : practiceTeachingLayers,
  });
}
