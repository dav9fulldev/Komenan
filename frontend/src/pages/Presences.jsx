import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { chaineRequete } from '../api.js';
import { useDonnees, useReferentiels } from '../hooks.js';
import { AlerteErreur, Badge, BadgeStatut, Carte, EntetePage, Pagination, Tableau } from '../composants/ui.jsx';
import { aujourdhui, date, decalerJours, duree, heure, telephone, STATUTS_ARRIVEE, STATUTS_SEANCE, STATUTS_ABSENCE } from '../format.js';
import DetailSeance from './DetailSeance.jsx';

export default function Presences() {
  const [params, setParams] = useSearchParams();
  const refs = useReferentiels('enseignants', 'marches', 'domiciles');
  const f = {
    debut: params.get('debut') ?? decalerJours(aujourdhui(), -7), fin: params.get('fin') ?? aujourdhui(),
    enseignant_id: params.get('enseignant_id') || '', marche_id: params.get('marche_id') || '', domicile_id: params.get('domicile_id') || '',
    statut: params.get('statut') || '', inclure_futures: params.get('inclure_futures') || '', page: params.get('page') || '1',
  };
  const { donnees, erreur, recharger } = useDonnees(`/presences${chaineRequete({ ...f, taille: 25 })}`);
  const [detail, setDetail] = useState(null);
  const changer = (k) => (e) => { const p = new URLSearchParams(params); p.set(k, e.target.value); p.set('page', '1'); setParams(p); };

  return (
    <>
      <EntetePage titre="Suivi des présences" description="Séances programmées, arrivées et départs vérifiés par le serveur." />
      <AlerteErreur erreur={erreur} />
      <Carte corps={false}>
        <div className="filtres">
          <div className="champ"><label>Du</label><input className="saisie" type="date" value={f.debut} onChange={changer('debut')} /></div>
          <div className="champ"><label>Au</label><input className="saisie" type="date" value={f.fin} onChange={changer('fin')} /></div>
          <div className="champ"><label>Enseignant</label>
            <select className="saisie" value={f.enseignant_id} onChange={changer('enseignant_id')}>
              <option value="">Tous</option>{(refs.enseignants || []).map((e) => <option key={e.id} value={e.id}>{e.nom} {e.prenoms}</option>)}
            </select></div>
          <div className="champ"><label>Marché</label>
            <select className="saisie" value={f.marche_id} onChange={changer('marche_id')}>
              <option value="">Tous</option>{(refs.marches || []).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select></div>
          <div className="champ"><label>Domicile</label>
            <select className="saisie" value={f.domicile_id} onChange={changer('domicile_id')}>
              <option value="">Tous</option>{(refs.domiciles || []).map((d) => <option key={d.id} value={d.id}>{d.code} · {d.parent_nom}</option>)}
            </select></div>
          <div className="champ"><label>Statut</label>
            <select className="saisie" value={f.statut} onChange={changer('statut')}>
              <option value="">Tous</option>
              {Object.entries(STATUTS_SEANCE).filter(([k]) => k !== 'annulee').map(([k, s]) => <option key={k} value={k}>{s.libelle}</option>)}
              <option value="en_retard">Avec retard</option>
              <option value="depart_anticipe">Avec départ anticipé</option>
            </select></div>
          <button className="bouton bouton-fantome" onClick={() => setParams(new URLSearchParams())}><RotateCcw size={14} /> Réinitialiser</button>
        </div>
        <Tableau lignes={donnees?.donnees} onLigne={(s) => setDetail(s.id)} vide="Aucune séance sur cette période" colonnes={[
          { cle: 'enseignant', titre: 'Enseignant', rendu: (s) => <><strong>{s.enseignant}</strong><div className="secondaire">{telephone(s.telephone)}</div></> },
          { cle: 'parent', titre: 'Parent', rendu: (s) => <>{s.parent}<div className="secondaire">{s.domicile_code}</div></> },
          { cle: 'marche', titre: 'Marché' },
          { cle: 'date', titre: 'Date', rendu: (s) => date(s.date_seance) },
          { cle: 'prevue', titre: 'Arrivée prévue', rendu: (s) => heure(s.debut_prevu) },
          { cle: 'reelle', titre: 'Arrivée réelle', rendu: (s) => heure(s.arrivee_reelle) },
          { cle: 'retard', titre: 'Retard', rendu: (s) => (s.statut_arrivee && s.statut_arrivee !== 'a_l_heure' ? <span className="texte-orange">{s.retard_minutes} min</span> : s.arrivee_reelle ? '—' : '') },
          { cle: 'justification', titre: 'Justification', rendu: (s) => (s.justification_retard ? <span title={s.justification_retard} className="texte-petit libre">« {s.justification_retard.slice(0, 40)}{s.justification_retard.length > 40 ? '…' : ''} »</span> : '') },
          { cle: 'depart', titre: 'Départ réel', rendu: (s) => <>{heure(s.depart_reel)}{s.depart_anticipe_minutes > 0 && <div><Badge ton="orange">−{s.depart_anticipe_minutes} min</Badge></div>}</> },
          { cle: 'duree', titre: 'Durée effective', rendu: (s) => (s.duree_effective_minutes != null ? duree(s.duree_effective_minutes) : '') },
          { cle: 'statut', titre: 'Statut', rendu: (s) => <div className="actions" style={{ gap: 4 }}>
            <BadgeStatut table={STATUTS_SEANCE} valeur={s.statut} />
            {s.statut_arrivee && s.statut_arrivee !== 'a_l_heure' && <BadgeStatut table={STATUTS_ARRIVEE} valeur={s.statut_arrivee} />}
            {s.statut_absence && <BadgeStatut table={STATUTS_ABSENCE} valeur={s.statut_absence} />}
          </div> },
        ]} />
        {donnees && <Pagination page={donnees.page} taille={donnees.taille} total={donnees.total} onPage={(n) => { const p = new URLSearchParams(params); p.set('page', n); setParams(p); }} />}
      </Carte>
      {detail && <DetailSeance id={detail} onFermer={() => setDetail(null)} onChange={recharger} />}
    </>
  );
}
