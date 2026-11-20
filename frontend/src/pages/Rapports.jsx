import { useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { chaineRequete } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDonnees, useReferentiels } from '../hooks.js';
import { AlerteErreur, Carte, EntetePage, Onglets, Tableau } from '../composants/ui.jsx';
import { aujourdhui, decalerJours } from '../format.js';

const TYPES = [
  ['presences-enseignants', 'Présences par enseignant'],
  ['retards', 'Retards'],
  ['absences', 'Absences'],
  ['durees', 'Durées effectives'],
  ['marches', 'Par marché'],
];

export default function Rapports() {
  const { peut } = useAuth();
  const refs = useReferentiels('enseignants', 'marches');
  const [type, setType] = useState(TYPES[0][0]);
  const [f, setF] = useState({ debut: decalerJours(aujourdhui(), -30), fin: aujourdhui(), marche_id: '', enseignant_id: '' });
  const requete = chaineRequete(f);
  const { donnees, erreur } = useDonnees(`/rapports/${type}${requete}`);
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <EntetePage titre="Rapports et statistiques" description="Calculés à partir des séances passées et des pointages validés par le serveur.">
        {peut('rapports.exporter') && <>
          <a className="bouton bouton-secondaire" href={`/api/rapports/${type}${requete}&format=pdf`}><FileDown size={15} /> Exporter en PDF</a>
          <a className="bouton bouton-secondaire" href={`/api/rapports/${type}${requete}&format=xlsx`}><FileSpreadsheet size={15} /> Exporter en Excel</a>
        </>}
      </EntetePage>
      <Onglets onglets={TYPES} actif={type} onChange={setType} />
      <AlerteErreur erreur={erreur} />
      <Carte corps={false} titre={donnees ? `${donnees.titre} — ${donnees.periode}` : 'Rapport'}>
        <div className="filtres">
          <div className="champ"><label>Du</label><input className="saisie" type="date" value={f.debut} onChange={maj('debut')} /></div>
          <div className="champ"><label>Au</label><input className="saisie" type="date" value={f.fin} onChange={maj('fin')} /></div>
          <div className="champ"><label>Marché</label>
            <select className="saisie" value={f.marche_id} onChange={maj('marche_id')}>
              <option value="">Tous</option>{(refs.marches || []).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select></div>
          <div className="champ"><label>Enseignant</label>
            <select className="saisie" value={f.enseignant_id} onChange={maj('enseignant_id')}>
              <option value="">Tous</option>{(refs.enseignants || []).map((e) => <option key={e.id} value={e.id}>{e.nom} {e.prenoms}</option>)}
            </select></div>
        </div>
        <Tableau lignes={donnees?.lignes} vide="Aucune donnée sur cette période" cle="_"
          colonnes={(donnees?.colonnes || []).map((c) => ({ cle: c.cle, titre: c.libelle, num: typeof donnees.lignes[0]?.[c.cle] === 'number' }))} />
      </Carte>
    </>
  );
}
