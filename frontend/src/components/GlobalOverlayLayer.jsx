import AccountModal from './AccountModal.jsx';
import CombatArmySummaryModal from './CombatArmySummaryModal.jsx';
import FeedbackModal from './FeedbackModal.jsx';
import RatingDetailModal from './RatingDetailModal.jsx';
import UserReleaseNotesModal from './UserReleaseNotesModal.jsx';
import UserSettingsPanel from './UserSettingsPanel.jsx';
import { loadRoster as loadCombatRoster } from '../combatRoster.js';
import { openReleaseNoteTarget } from '../userReleaseNotes.js';

export default function GlobalOverlayLayer({
  shellUi,
  rating,
  tournament,
  combatOverview,
  isAdminUser,
  navigateTo,
  openInsights,
  onLogout,
  loggingOut,
  view,
}) {
  const {
    showRatingDetail,
    closeRatingDetail,
    showCombatSummary,
    closeCombatSummary,
    showSettings,
    closeSettings,
    showGlobalAccount,
    closeGlobalAccount,
    showGlobalReleaseNotes,
    closeReleaseNotes,
    showGlobalFeedback,
    closeGlobalFeedback,
  } = shellUi;

  return (
    <>
      {showRatingDetail && <RatingDetailModal rating={rating} onClose={closeRatingDetail} />}
      {showCombatSummary && (
        <CombatArmySummaryModal
          roster={loadCombatRoster()}
          onClose={closeCombatSummary}
          onOpenCombat={() => { closeCombatSummary(); navigateTo('roguelike'); }}
        />
      )}
      {showSettings && (
        <UserSettingsPanel
          isAdminUser={isAdminUser}
          onClose={closeSettings}
          onBoard3D={() => { closeSettings(); navigateTo('board3d'); }}
        />
      )}
      {showGlobalAccount && (
        <AccountModal
          rating={rating}
          tournament={tournament}
          combatOverview={combatOverview}
          onClose={closeGlobalAccount}
          onLogout={() => void onLogout()}
          loggingOut={loggingOut}
        />
      )}
      {showGlobalReleaseNotes && (
        <UserReleaseNotesModal
          onClose={closeReleaseNotes}
          onAction={(to) => {
            closeReleaseNotes();
            openReleaseNoteTarget(to, { navigateTo, openInsights });
          }}
        />
      )}
      {showGlobalFeedback && (
        <FeedbackModal
          context={view === 'menu' ? 'Home' : `Global · ${view}`}
          onClose={closeGlobalFeedback}
        />
      )}
    </>
  );
}
