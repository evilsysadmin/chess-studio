import PreferredBoard from './PreferredBoard.jsx';
import { getBoardRenderer } from '../userPreferences.js';

export function getSchoolBoardRenderer() {
  return getBoardRenderer();
}

export default function SchoolBoard(props) {
  return <PreferredBoard {...props} />;
}
