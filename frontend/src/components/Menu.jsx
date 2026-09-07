import { lazy, useLayoutEffect, useState } from 'react';
import './HomeIllustratedNarrow.css';

const MenuInner = lazy(() => import('./MenuInner.jsx'));
const CANONICAL_HOME_QUERY = '(min-width: 1000px)';

function forcedCanonicalHomeQuery(media) {
  return {
    matches: true,
    media,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() { return false; },
  };
}

export default function Menu(props) {
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setReady(true);
      return undefined;
    }

    const nativeMatchMedia = window.matchMedia;
    const queryCanonicalHome = forcedCanonicalHomeQuery(CANONICAL_HOME_QUERY);
    const canonicalMatchMedia = (query) => (
      query === CANONICAL_HOME_QUERY
        ? queryCanonicalHome
        : nativeMatchMedia.call(window, query)
    );

    // MenuInner historically used this one media query to choose between two
    // different Home products. Keep every other media query native and force
    // only that legacy selector until the old Home branch can be deleted.
    window.matchMedia = canonicalMatchMedia;
    setReady(true);

    return () => {
      if (window.matchMedia === canonicalMatchMedia) window.matchMedia = nativeMatchMedia;
    };
  }, []);

  if (!ready) return null;
  return <MenuInner {...props} />;
}
