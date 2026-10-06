import { useEffect, useState } from 'react';
import { api } from './api.js';
import { DEFAULT_FEATURE_FLAGS, normalizeFeatureFlags } from './featureFlags.js';

export function usePublicFeatureFlags() {
  const [featureFlags, setFeatureFlags] = useState(() => ({ ...DEFAULT_FEATURE_FLAGS }));

  useEffect(() => {
    let active = true;
    api.getFeatures()
      .then((payload) => {
        if (active) setFeatureFlags(normalizeFeatureFlags(payload));
      })
      .catch(() => {
        // Los defaults mantienen el producto operativo con backend antiguo/offline.
      });
    return () => { active = false; };
  }, []);

  return featureFlags;
}
