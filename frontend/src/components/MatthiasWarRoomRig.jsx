import './MatthiasWarRoomRig.css';

const FACE_PARTS = ['head', 'eyes', 'mouth'];

export default function MatthiasWarRoomRig({
  avatar,
  speaking = false,
  reducedMotion = false,
}) {
  return (
    <span
      className={`matthias-war-room-rig${speaking ? ' is-speaking' : ''}${reducedMotion ? ' is-reduced' : ''}`}
      data-matthias-warroom-rig="canonical-mask-v1"
      data-matthias-warroom-speaking={speaking ? 'true' : 'false'}
      data-matthias-warroom-motion={reducedMotion ? 'reduced' : 'active'}
    >
      <img
        className="matthias-war-room-rig__base"
        src={avatar}
        alt=""
        draggable="false"
        aria-hidden="true"
        data-matthias-canonical-art="true"
      />
      {FACE_PARTS.map((part) => (
        <img
          key={part}
          className={`matthias-war-room-rig__part matthias-war-room-rig__part--${part}`}
          src={avatar}
          alt=""
          draggable="false"
          aria-hidden="true"
          data-matthias-warroom-face-part={part}
        />
      ))}
    </span>
  );
}
