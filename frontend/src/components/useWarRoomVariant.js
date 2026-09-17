import { useState } from 'react';
import {
  isWarRoomVariantSelectable,
  loadWarRoomVariant,
  saveWarRoomVariant,
} from './WarRoomVariant.js';

export default function useWarRoomVariant() {
  const selectable = isWarRoomVariantSelectable();
  const [variant, setVariantState] = useState(() => loadWarRoomVariant());
  const [status, setStatus] = useState('idle');
  const setVariant = (value) => setVariantState(saveWarRoomVariant(value));
  return { selectable, variant, status, setVariant, setStatus };
}
