import { lazy, useEffect } from 'react';
import './HomeIllustratedNarrow.css';
import './HomeIllustratedMobilePolish.css';
import './HomeIllustratedMobileTouchTargets.css';

const MenuInner = lazy(() => import('./MenuInner.jsx'));

export default function Menu(props) {
  useEffect(() => {
    let active = true;
    let cancelPreload = () => {};

    void import('./warRoomHomePreload.js')
      .then(({ schedulePreferredWarRoomHomePreload }) => {
        if (!active) return;
        cancelPreload = schedulePreferredWarRoomHomePreload();
      })
      .catch(() => {
        // Speculative warming must never affect Home or the real War Room path.
      });

    return () => {
      active = false;
      cancelPreload();
    };
  }, []);

  return <MenuInner {...props} />;
}
