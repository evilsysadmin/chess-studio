import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AppRootErrorBoundary from './components/AppRootErrorBoundary.jsx';
import './styles.css';
// Deliberately outside the checksumed production cascade while this Home
// direction is being evaluated. Remove this import to revert the prototype.
import './styles/29-home-castle-mock.css';
import { installReleaseContinuity } from './releaseContinuity.js';
import { migratePersistentStorage } from './storageMigrations.js';
import { getReducedMotionPreference, reducedMotionStatus } from './userPreferences.js';
import { installChessStudioPwa } from './pwaInstall.js';
import { installWarRoomPointerCapture } from './warRoomPointerCapture.js';

migratePersistentStorage();
installReleaseContinuity();
installChessStudioPwa();
installWarRoomPointerCapture();
const initialMotion = reducedMotionStatus();
document.documentElement.dataset.reducedMotion = initialMotion.effective ? 'true' : 'false';
document.documentElement.dataset.motionPreference = getReducedMotionPreference();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRootErrorBoundary>
      <App />
    </AppRootErrorBoundary>
  </React.StrictMode>
);
