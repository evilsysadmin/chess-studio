import PreferredBoard from './PreferredBoard.jsx';
import { schoolTeachingHintMove, schoolTeachingSquareClass } from './SchoolTeachingLayers.js';

export function getSchoolBoardRenderer() {
  return '3d';
}

export default function SchoolBoard({ teachingLayers = null, squareClassName, hintMove, ...props }) {
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
      rendererOverride="3d"
      warRoomVariantOverride="classic"
    />
  );
}
