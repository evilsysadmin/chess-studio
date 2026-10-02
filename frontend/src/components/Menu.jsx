import { lazy, useEffect } from 'react';
import './HomeIllustratedNarrow.css';
import './HomeIllustratedMobilePolish.css';
import './HomeIllustratedMobileTouchTargets.css';
import { schedulePreferredWarRoomHomePreload } from './warRoomHomePreload.js';

const MenuInner = lazy(() => import('./MenuInner.jsx'));

export default function Menu(props) {
  useEffect(() => schedulePreferredWarRoomHomePreload(), []);
  return <MenuInner {...props} />;
}
