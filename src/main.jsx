import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/800.css';
import './styles.css';
import { AppProvider } from './lib/app.jsx';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <AppProvider>
    <App />
  </AppProvider>
);
