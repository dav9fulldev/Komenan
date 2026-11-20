import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { FournisseurAuth } from './auth.jsx';
import { FournisseurNotifications } from './composants/ui.jsx';
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
