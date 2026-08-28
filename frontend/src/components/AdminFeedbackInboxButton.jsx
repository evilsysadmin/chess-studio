export default function AdminFeedbackInboxButton({ count = 0, onOpen }) {
  const safeCount = Math.max(0, Number(count) || 0);
  if (safeCount <= 0) return null;
  return (
    <button
      type="button"
      className="masthead-admin-feedback-inbox"
      onClick={onOpen}
      aria-label={`${safeCount} feedback ${safeCount === 1 ? 'nuevo' : 'nuevos'}`}
      title="Feedback nuevo de usuarios"
    >
      <span className="masthead-admin-feedback-envelope" aria-hidden="true">✉</span>
      <span className="masthead-admin-feedback-count" aria-hidden="true">{safeCount > 99 ? '99+' : safeCount}</span>
    </button>
  );
}
