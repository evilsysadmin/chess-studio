import PreferredBoard from './PreferredBoard.jsx';
import { getBoardRenderer } from '../userPreferences.js';
import { schoolTeachingHintMove, schoolTeachingSquareClass } from './SchoolTeachingLayers.js';

export function getSchoolBoardRenderer() {
  return getBoardRenderer();
}

export default function SchoolBoard({ teachingLayers = null, squareClassName, hintMove, warRoomVariantOverride, ...props }) {
  const teachingHintMove = schoolTeachingHintMove(teachingLayers) || hintMove || null;
  const mergedSquareClassName = (square) => [
    squareClassName?.(square),
    schoolTeachingSquareClass(teachingLayers, square),
  ].filter(Boolean).join(' ');

  return (
    <PreferredBoard
      {...props}
      squareClassName={mergedSquareClassName}
      hintMove={teachingHintMove}
      cameraProfile="classroom"
      warRoomVariantOverride={warRoomVariantOverride || 'classic'}
    />
  );
}
