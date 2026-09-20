import { useCallback, useState } from 'react';
import HomeBlenderScene3D, { homeBlenderRuntimeEligible } from './HomeBlenderScene3D.jsx';
import HomeCastle3D from './HomeCastle3D.jsx';

export default function HomeScene3D(props) {
  const [useLegacyFallback, setUseLegacyFallback] = useState(
    () => !homeBlenderRuntimeEligible(),
  );
  const activateFallback = useCallback(() => setUseLegacyFallback(true), []);

  if (useLegacyFallback) return <HomeCastle3D {...props} />;

  return (
    <HomeBlenderScene3D
      ambient={props.ambient}
      activeRoom={props.activeRoom}
      onUnavailable={activateFallback}
    />
  );
}
