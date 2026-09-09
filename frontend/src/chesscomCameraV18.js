export const CHESSCOM_CAMERA_V18 = Object.freeze({
  identity:'camera-v18-conservative',
  alphaOffset:8 * Math.PI / 180,
  beta:.96,
  orthoScale:1.04,
  targetOffset:Object.freeze({ x:.12, y:0, z:.08 }),
});

export function installChesscomCameraV18(scene) {
  const camera = scene?.getCameraByName?.('chesscom-camera') || scene?.activeCamera;
  if (!camera || typeof camera.alpha !== 'number' || typeof camera.beta !== 'number') {
    return { destroy(){} };
  }

  const old = {
    alpha:camera.alpha,
    beta:camera.beta,
    target:camera.target?.clone?.() || null,
    orthoLeft:camera.orthoLeft,
    orthoRight:camera.orthoRight,
    orthoTop:camera.orthoTop,
    orthoBottom:camera.orthoBottom,
  };

  camera.alpha = old.alpha + CHESSCOM_CAMERA_V18.alphaOffset;
  camera.beta = CHESSCOM_CAMERA_V18.beta;

  if (camera.target) {
    camera.target.x += CHESSCOM_CAMERA_V18.targetOffset.x;
    camera.target.y += CHESSCOM_CAMERA_V18.targetOffset.y;
    camera.target.z += CHESSCOM_CAMERA_V18.targetOffset.z;
  }

  for (const key of ['orthoLeft','orthoRight','orthoTop','orthoBottom']) {
    if (typeof old[key] === 'number') camera[key] = old[key] * CHESSCOM_CAMERA_V18.orthoScale;
  }

  return {
    destroy() {
      camera.alpha = old.alpha;
      camera.beta = old.beta;
      if (old.target && camera.target?.copyFrom) camera.target.copyFrom(old.target);
      for (const key of ['orthoLeft','orthoRight','orthoTop','orthoBottom']) {
        if (typeof old[key] === 'number') camera[key] = old[key];
      }
    },
  };
}
