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

// Démonstration GitHub Pages : retour sur la page demandée après la redirection de 404.html.
if (import.meta.env.VITE_DEMO === '1') {
  try {
    const cible = sessionStorage.getItem('redirection_spa');
    if (cible) { sessionStorage.removeItem('redirection_spa'); window.history.replaceState(null, '', cible); }
  } catch { /* stockage indisponible */ }
}

ReactDOM.createRoot(document.getElementById('racine')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <FournisseurNotifications>
        <FournisseurAuth>
          <App />
        </FournisseurAuth>
      </FournisseurNotifications>
    </BrowserRouter>
  </React.StrictMode>,
);
