import Board3D from './Board3D.jsx';

export default function TrainingRoomBoard(props) {
  return (
    <Board3D
      {...props}
      cameraProfile="classroom"
      trainingRoom
      warRoomVariantOverride="classic"
      warRoomMobilePerformance
    />
  );
}
