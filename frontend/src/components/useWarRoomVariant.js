import { useEffect, useState } from 'react';
import {
  WAR_ROOM_VARIANT_CHANGED_EVENT,
  isWarRoomVariantSelectable,
  loadWarRoomVariant,
  normalizeWarRoomVariant,
  saveWarRoomVariant,
} from './WarRoomVariant.js';

export default function useWarRoomVariant() {
  const selectable = isWarRoomVariantSelectable();
  const [variant, setVariantState] = useState(() => loadWarRoomVariant());
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!selectable || typeof window === 'undefined') return undefined;
    const syncVariant = (event) => setVariantState(normalizeWarRoomVariant(event?.detail));
    window.addEventListener(WAR_ROOM_VARIANT_CHANGED_EVENT, syncVariant);
    return () => window.removeEventListener(WAR_ROOM_VARIANT_CHANGED_EVENT, syncVariant);
  }, [selectable]);

  const setVariant = (value) => {
    const normalized = saveWarRoomVariant(value);
    setVariantState(normalized);
    if (selectable && typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(WAR_ROOM_VARIANT_CHANGED_EVENT, { detail: normalized }));
    }
    return normalized;
  };

  return { selectable, variant, status, setVariant, setStatus };
}
