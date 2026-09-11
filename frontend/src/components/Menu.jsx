import { lazy } from 'react';
import './HomeIllustratedNarrow.css';
import './HomeIllustratedMobilePolish.css';

const MenuInner = lazy(() => import('./MenuInner.jsx'));

export default function Menu(props) {
  return <MenuInner {...props} />;
}