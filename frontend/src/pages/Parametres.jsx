import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useDonnees } from '../hooks.js';
import { Alerte, AlerteErreur, Carte, Champ, Chargement, EntetePage, useNotifier } from '../composants/ui.jsx';

const GROUPES = [
  ['Horaires de pointage', ['ouverture_pointage_minutes', 'fermeture_pointage_minutes', 'tolerance_retard_minutes']],
  ['Départ et durée', ['depart_anticipe_seuil_minutes', 'justification_depart_anticipe_obligatoire', 'delai_min_avant_depart_minutes', 'fermeture_depart_minutes', 'duree_max_seance_minutes']],
  ['Géolocalisation', ['rayon_gps_metres', 'precision_gps_max_metres', 'gps_bloquant']],
  ['Planification', ['delai_trajet_minutes']],
];
const BOOLEENS = new Set(['justification_depart_anticipe_obligatoire', 'gps_bloquant']);

export default function Parametres() {
  const notifier = useNotifier();
  const { donnees, erreur } = useDonnees('/parametres');
  const [valeurs, setValeurs] = useState({});
  const [erreurEnr, setErreurEnr] = useState(null);
  useEffect(() => { if (donnees) setValeurs(Object.fromEntries(donnees.map((p) => [p.cle, p.valeur]))); }, [donnees]);
  if (erreur) return <AlerteErreur erreur={erreur} />;
  if (!donnees) return <Chargement />;
  const defs = Object.fromEntries(donnees.map((p) => [p.cle, p]));

  const enregistrer = async () => {
    setErreurEnr(null);
    try { notifier((await api.put('/parametres', valeurs)).message); } catch (e) { setErreurEnr(e); }
  };

  return (
    <>
      <EntetePage titre="Paramètres" description="Règles métier appliquées au pointage. Chaque modification est tracée dans le journal d'audit.">
        <button className="bouton bouton-principal" onClick={enregistrer}>Enregistrer</button>
      </EntetePage>
      <AlerteErreur erreur={erreurEnr} />
      <Alerte type="info">
        Exemple avec les valeurs actuelles : pour un cours à 16 h 00, le pointage d'arrivée est possible de {fmt(-valeurs.ouverture_pointage_minutes)} à {fmt(valeurs.fermeture_pointage_minutes)} ;
        au-delà de {fmt(valeurs.tolerance_retard_minutes)} l'arrivée est un retard et une justification est demandée. Sans arrivée après {fmt(valeurs.fermeture_pointage_minutes)}, la séance devient une « absence présumée à vérifier ».
      </Alerte>
      <div className="grille grille-2">
        {GROUPES.map(([titre, cles]) => (
          <Carte key={titre} titre={titre}>
            {cles.filter((c) => defs[c]).map((c) => (
              <Champ key={c} libelle={defs[c].libelle} aide={BOOLEENS.has(c) ? undefined : `Entre ${defs[c].min} et ${defs[c].max}`}>
                {BOOLEENS.has(c) ? (
                  <select className="saisie" value={valeurs[c] ?? 0} onChange={(e) => setValeurs({ ...valeurs, [c]: Number(e.target.value) })}>
                    <option value={1}>Oui</option><option value={0}>Non</option>
                  </select>
                ) : (
                  <input className="saisie" type="number" min={defs[c].min} max={defs[c].max} value={valeurs[c] ?? ''} onChange={(e) => setValeurs({ ...valeurs, [c]: e.target.value })} />
                )}
              </Champ>
            ))}
          </Carte>
        ))}
      </div>
    </>
  );
}

function fmt(min) {
  const t = 16 * 60 + Number(min || 0);
  return `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, '0')}`;
}
