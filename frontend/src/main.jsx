import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { FournisseurAuth } from './auth.jsx';
import { FournisseurNotifications } from './composants/ui.jsx';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/600.css';
import '@fontsource/open-sans/700.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('racine')).render(
  <React.StrictMode>
    <BrowserRouter>
      <FournisseurNotifications>
        <FournisseurAuth>
          <App />
        </FournisseurAuth>
      </FournisseurNotifications>
    </BrowserRouter>
  </React.StrictMode>,
);
