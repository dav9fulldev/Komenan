import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, definirSurDeconnexion } from './api.js';

const Contexte = createContext(null);
export const useAuth = () => useContext(Contexte);

export function FournisseurAuth({ children }) {
  const [utilisateur, setUtilisateur] = useState(undefined); // undefined = vérification en cours

  useEffect(() => {
    definirSurDeconnexion(() => setUtilisateur(null));
    api.get('/auth/moi').then(setUtilisateur).catch(() => setUtilisateur(null));
  }, []);

  const connecter = useCallback(async (email, mot_de_passe) => {
    const u = await api.post('/auth/connexion', { email, mot_de_passe });
    setUtilisateur(u);
    return u;
  }, []);

  const deconnecter = useCallback(async () => {
    await api.post('/auth/deconnexion').catch(() => {});
    setUtilisateur(null);
  }, []);

  const peut = useCallback((p) => !!utilisateur?.permissions?.includes(p), [utilisateur]);

  return <Contexte.Provider value={{ utilisateur, connecter, deconnecter, peut }}>{children}</Contexte.Provider>;
}
