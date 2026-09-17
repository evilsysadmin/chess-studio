export default function WarRoomVariantPicker({ visible, variant, status, onChange }) {
  if (!visible) return null;
  return (
    <label className="board3d-variant-picker">
      <span>Escena</span>
      <select aria-label="Versión de War Room" value={variant} onChange={(event) => onChange?.(event.target.value)}>
        <option value="classic">War Room</option>
        <option value="v2">War Room v2</option>
      </select>
      {variant === 'v2' && status === 'loading' && <small aria-live="polite">cargando…</small>}
      {variant === 'v2' && status === 'fallback' && <small aria-live="polite">fallback clásico</small>}
    </label>
  );
}
