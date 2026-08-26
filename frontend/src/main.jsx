import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AppRootErrorBoundary from './components/AppRootErrorBoundary.jsx';
import './styles.css';
import { installReleaseContinuity } from './releaseContinuity.js';
import { migratePersistentStorage } from './storageMigrations.js';
import { getReducedMotion } from './userPreferences.js';
import { installChessStudioPwa } from './pwaInstall.js';

migratePersistentStorage();
installReleaseContinuity();
installChessStudioPwa();
document.documentElement.dataset.reducedMotion = getReducedMotion() ? 'true' : 'false';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRootErrorBoundary>
      <App />
    </AppRootErrorBoundary>
  </React.StrictMode>
);
