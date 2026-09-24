import './HomeDungeonPanel.css';

function GroupIcon({ id }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (id === 'train') return <svg {...common}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5v-15Zm16 0A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5v-15Z" /></svg>;
  if (id === 'free') return <svg {...common}><path d="m3 3 5 2 12 14-1 1L5 8 3 3Zm18 0-5 2L4 19l1 1L19 8l2-5Z" /></svg>;
  if (id === 'lab') return <svg {...common}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" /><path d="M7.5 15h9" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>;
}

// Mazmorras body: one suggestion on top, three intent groups, two quiet links. `menu` comes
// from buildDungeonMenu (homeDungeonMenu.js); `onRun` closes the panel and runs the action.
export default function HomeDungeonPanel({ menu, onRun, disabled = false }) {
  const { featured, groups, links } = menu;
  return (
    <>
      {featured && (
        <div className="dungeon-featured">
          <button type="button" onClick={() => onRun(featured.action)} disabled={disabled} aria-label={`${featured.title}. ${featured.detail}`}>
            <span className="dungeon-featured__star" aria-hidden="true">★</span>
            <span className="dungeon-featured__copy">
              <small>{featured.eyebrow}</small>
              <strong>{featured.title}</strong>
              <em>{featured.detail}</em>
            </span>
            <b aria-hidden="true">›</b>
          </button>
        </div>
      )}
      <div className="dungeon-groups">
        {groups.map((group) => (
          <section key={group.id} className={`dungeon-group dungeon-group--${group.id}`} aria-label={group.title}>
            <h4><GroupIcon id={group.id} /><span>{group.title}</span></h4>
            {group.items.map((item) => (
              <button key={item.key} type="button" aria-label={item.ariaLabel} onClick={() => onRun(item.action)} disabled={disabled}>
                <strong>{item.label}</strong>
                {item.detail && <small>{item.detail}</small>}
              </button>
            ))}
          </section>
        ))}
      </div>
      {links.length > 0 && (
        <div className="dungeon-links">
          {links.map((item) => (
            <button key={item.key} type="button" aria-label={item.ariaLabel} onClick={() => onRun(item.action)} disabled={disabled}>{item.label}</button>
          ))}
        </div>
      )}
    </>
  );
}
