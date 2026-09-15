import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AppRootErrorBoundary from './components/AppRootErrorBoundary.jsx';
import './components/Board3DRegistration.js';
import './styles.css';
import './styles/29-motion-coherence.css';
import './styles/30-modal-layering.css';
import './styles/31-route-loading.css';
import './components/MatthiasSchoolBoardScale.css';
import './components/Game2DMobile.css';
import { installReleaseContinuity } from './releaseContinuity.js';
import { migratePersistentStorage } from './storageMigrations.js';
import { getReducedMotionPreference, reducedMotionStatus } from './userPreferences.js';
import { installChessStudioPwa } from './pwaInstall.js';

migratePersistentStorage();
installReleaseContinuity();
installChessStudioPwa();
const initialMotion = reducedMotionStatus();
document.documentElement.dataset.reducedMotion = initialMotion.effective ? 'true' : 'false';
document.documentElement.dataset.motionPreference = getReducedMotionPreference();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRootErrorBoundary>
      <App />
    </AppRootErrorBoundary>
  </React.StrictMode>,
);
