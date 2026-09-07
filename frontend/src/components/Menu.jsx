import { lazy } from 'react';
import './HomeIllustratedNarrow.css';

const MenuInner = lazy(() => import('./MenuInner.jsx'));

export default function Menu(props) {
  return <MenuInner {...props} />;
}
