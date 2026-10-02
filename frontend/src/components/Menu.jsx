import { lazy } from 'react';
import './HomeIllustratedNarrow.css';
import './HomeIllustratedMobilePolish.css';
import './HomeIllustratedMobileTouchTargets.css';

const MenuInner = lazy(() => import('./MenuInner.jsx'));

export default function Menu(props) {
  return <MenuInner {...props} />;
}
