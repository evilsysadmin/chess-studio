import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AppRootErrorBoundary from './components/AppRootErrorBoundary.jsx';
import './components/Board3DRegistration.js';
import './styles.css';
import './components/HomeGreatHallCascade.css';
import './components/HomeGreatHallAccessibility.css';
import './components/HomeGreatHallLayoutFix.css';
import './components/HomeGreatHallModalFix.css';
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