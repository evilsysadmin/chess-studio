import MatthiasLayeredArt from './MatthiasLayeredArt.jsx';
import './HomeMatthias3D.css';

/**
 * Home keeps Matthias' canonical 3D/CG render as the visual source of truth.
 *
 * The previous procedural Three.js reconstruction was technically live but it
 * changed his face and silhouette enough to stop reading as Matthias. The
 * layered rig reuses the approved raster itself and articulates only small,
 * feathered regions (head, eyes, arms and props), so the character can keep his
 * routines without being redrawn into a different mascot.
 */
export default function HomeMatthias3D({
  fallbackAvatar,
  scene = 'base',
  speaking = false,
  reducedMotion = false,
}) {
  if (!fallbackAvatar) return null;

  return (
    <span
      className="home-matthias-3d is-ready"
      data-home-matthias-3d="ready"
      data-matthias-identity="canonical-render-rig"
      data-motion={reducedMotion ? 'still-canonical-rig' : 'layered-canonical-rig'}
      aria-hidden="true"
    >
      <MatthiasLayeredArt
        avatar={fallbackAvatar}
        scene={scene}
        speaking={speaking}
        reducedMotion={reducedMotion}
      />
    </span>
  );
}
