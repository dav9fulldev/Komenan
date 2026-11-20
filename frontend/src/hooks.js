import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/** Charge une ressource de l'API et permet de la recharger. */
export function useDonnees(url) {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!url) return undefined;
    let actif = true;
    setErreur(null);
    api.get(url).then((d) => actif && setDonnees(d)).catch((e) => actif && setErreur(e));
    return () => { actif = false; };
  }, [url, version]);
  const recharger = useCallback(() => setVersion((v) => v + 1), []);
  return { donnees, erreur, recharger, setDonnees };
}

/** Listes de référence pour les filtres et formulaires. */
export function useReferentiels(...noms) {
  const urls = { enseignants: '/enseignants', marches: '/marches', domiciles: '/domiciles', matieres: '/matieres', parents: '/parents', affectations: '/affectations' };
  const [refs, setRefs] = useState({});
  useEffect(() => {
    noms.forEach((n) => api.get(urls[n]).then((d) => setRefs((r) => ({ ...r, [n]: d }))).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return refs;
}
