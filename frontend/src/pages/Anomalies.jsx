import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw, ExternalLink } from 'lucide-react';
import { api, chaineRequete } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDonnees, useReferentiels } from '../hooks.js';
import { AlerteErreur, Badge, BadgeStatut, Carte, Champ, Chargement, EntetePage, Modale, Pagination, Tableau, useNotifier } from '../composants/ui.jsx';
import { date, dateHeure, heure, GRAVITES, STATUTS_ANOMALIE } from '../format.js';
import DetailSeance, { Observations, Pointage } from './DetailSeance.jsx';

function DetailAnomalie({ id, types, onFermer, onChange }) {
  const { peut } = useAuth();
  const notifier = useNotifier();
  const { donnees: a, erreur, recharger } = useDonnees(`/anomalies/${id}`);
  const [statut, setStatut] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [erreurStatut, setErreurStatut] = useState(null);
  const [seance, setSeance] = useState(null);

  const enregistrer = async () => {
    setErreurStatut(null);
    try {
      notifier((await api.patch(`/anomalies/${id}/statut`, { statut, conclusion })).message);
      setStatut(''); setConclusion(''); recharger(); onChange();
    } catch (e) { setErreurStatut(e); }
  };

  return (
    <Modale titre="Examen de l'anomalie" onFermer={onFermer} large>
      <AlerteErreur erreur={erreur} />
      {!a ? <Chargement /> : (
        <>
          <div className="actions mb">
            <Badge ton="marine">{types?.[a.type] || a.type}</Badge>
            <BadgeStatut table={GRAVITES} valeur={a.gravite} />
            <BadgeStatut table={STATUTS_ANOMALIE} valeur={a.statut} />
          </div>
          <p style={{ fontSize: 15, marginTop: 0 }}>{a.description}</p>
          <dl className="liste-def">
            <dt>Détectée le</dt><dd>{dateHeure(a.cree_le)}</dd>
            <dt>Enseignant</dt><dd>{a.enseignant || '—'}</dd>
            <dt>Domicile / marché</dt><dd>{a.domicile_code ? `${a.domicile_code} · ${a.marche}` : '—'}</dd>
            {a.seance_id && <><dt>Séance</dt><dd>{date(a.date_seance)} à {heure(a.debut_prevu)} <button className="lien-bouton" onClick={() => setSeance(a.seance_id)}><ExternalLink size={12} /> Ouvrir la séance</button></dd></>}
            {a.traitee_par_nom && <><dt>Traitée par</dt><dd>{a.traitee_par_nom} le {dateHeure(a.traitee_le)}</dd></>}
            {a.conclusion && <><dt>Conclusion</dt><dd>{a.conclusion}</dd></>}
          </dl>

          {a.pointage && <>
            <h3 className="mt" style={{ fontSize: 15, marginBottom: 10 }}>Pointage concerné</h3>
            <ul className="chronologie"><Pointage p={a.pointage} /></ul>
          </>}

          <h3 className="mt" style={{ fontSize: 15, marginBottom: 10 }}>Observations et échanges</h3>
          <Observations liste={a.observations} peutAjouter={peut('anomalies.observer')}
            onAjouter={async (o) => { await api.post(`/anomalies/${id}/observations`, o); notifier('Observation enregistrée'); recharger(); onChange(); }} />

          {peut('anomalies.traiter') && (
            <div className="carte carte-corps mt">
              <strong>Traitement</strong>
              <AlerteErreur erreur={erreurStatut} />
              <div className="ligne-champs mt">
                <Champ libelle="Nouveau statut">
                  <select className="saisie" value={statut} onChange={(e) => setStatut(e.target.value)}>
                    <option value="">— Choisir —</option>
                    {Object.entries(STATUTS_ANOMALIE).filter(([k]) => k !== a.statut).map(([k, s]) => <option key={k} value={k}>{s.libelle}</option>)}
                  </select>
                </Champ>
              </div>
              <Champ libelle="Conclusion" aide="Obligatoire pour clôturer (traitée ou classée sans suite)">
                <textarea className="saisie" value={conclusion} onChange={(e) => setConclusion(e.target.value)} maxLength={1000} />
              </Champ>
              <button className="bouton bouton-principal bouton-petit" disabled={!statut} onClick={enregistrer}>Enregistrer</button>
            </div>
          )}
          {seance && <DetailSeance id={seance} onFermer={() => setSeance(null)} />}
        </>
      )}
    </Modale>
  );
}

export default function Anomalies() {
  const [params, setParams] = useSearchParams();
  const refs = useReferentiels('enseignants', 'marches');
  const { donnees: types } = useDonnees('/anomalies/types');
  const f = {
    type: params.get('type') || '', statut: params.get('statut') || '', ouvertes: params.get('ouvertes') ?? '1', gravite: params.get('gravite') || '',
    enseignant_id: params.get('enseignant_id') || '', marche_id: params.get('marche_id') || '', debut: params.get('debut') || '', fin: params.get('fin') || '',
    page: params.get('page') || '1',
  };
  const { donnees, erreur, recharger } = useDonnees(`/anomalies${chaineRequete({ ...f, ouvertes: f.statut ? '' : f.ouvertes, taille: 25 })}`);
  const [detail, setDetail] = useState(null);
  const changer = (k) => (e) => { const p = new URLSearchParams(params); p.set(k, e.target.value); p.set('page', '1'); setParams(p); };

  return (
    <>
      <EntetePage titre="Anomalies" description="Situations détectées automatiquement à examiner : retards, absences, QR Codes invalides, positions non conformes…" />
      <AlerteErreur erreur={erreur} />
      <Carte corps={false}>
        <div className="filtres">
          <div className="champ"><label>Type</label>
            <select className="saisie" value={f.type} onChange={changer('type')}>
              <option value="">Tous</option>{Object.entries(types || {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div className="champ"><label>Traitement</label>
            <select className="saisie" value={f.statut || (f.ouvertes === '1' ? 'ouvertes' : '')} onChange={(e) => {
              const p = new URLSearchParams(params); p.set('page', '1');
              if (e.target.value === 'ouvertes') { p.set('ouvertes', '1'); p.delete('statut'); } else { p.set('ouvertes', '0'); p.set('statut', e.target.value); }
              setParams(p);
            }}>
              <option value="ouvertes">À traiter (à examiner + en cours)</option>
              <option value="">Toutes</option>
              {Object.entries(STATUTS_ANOMALIE).map(([k, s]) => <option key={k} value={k}>{s.libelle}</option>)}
            </select></div>
          <div className="champ"><label>Gravité</label>
            <select className="saisie" value={f.gravite} onChange={changer('gravite')}>
              <option value="">Toutes</option>{Object.entries(GRAVITES).map(([k, s]) => <option key={k} value={k}>{s.libelle}</option>)}
            </select></div>
          <div className="champ"><label>Enseignant</label>
            <select className="saisie" value={f.enseignant_id} onChange={changer('enseignant_id')}>
              <option value="">Tous</option>{(refs.enseignants || []).map((e) => <option key={e.id} value={e.id}>{e.nom} {e.prenoms}</option>)}
            </select></div>
          <div className="champ"><label>Marché</label>
            <select className="saisie" value={f.marche_id} onChange={changer('marche_id')}>
              <option value="">Tous</option>{(refs.marches || []).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select></div>
          <div className="champ"><label>Du</label><input className="saisie" type="date" value={f.debut} onChange={changer('debut')} /></div>
          <div className="champ"><label>Au</label><input className="saisie" type="date" value={f.fin} onChange={changer('fin')} /></div>
          <button className="bouton bouton-fantome" onClick={() => setParams(new URLSearchParams())}><RotateCcw size={14} /> Réinitialiser</button>
        </div>
        <Tableau lignes={donnees?.donnees} onLigne={(a) => setDetail(a.id)} vide="Aucune anomalie" colonnes={[
          { cle: 'cree_le', titre: 'Détectée', rendu: (a) => dateHeure(a.cree_le) },
          { cle: 'type', titre: 'Type', rendu: (a) => <strong>{types?.[a.type] || a.type}</strong> },
          { cle: 'description', titre: 'Description', rendu: (a) => <span className="texte-petit libre">{a.description}</span> },
          { cle: 'enseignant', titre: 'Enseignant', rendu: (a) => a.enseignant || '—' },
          { cle: 'domicile', titre: 'Domicile', rendu: (a) => (a.domicile_code ? <>{a.domicile_code}<div className="secondaire">{a.marche}</div></> : '—') },
          { cle: 'gravite', titre: 'Gravité', rendu: (a) => <BadgeStatut table={GRAVITES} valeur={a.gravite} /> },
          { cle: 'statut', titre: 'Traitement', rendu: (a) => <>{<BadgeStatut table={STATUTS_ANOMALIE} valeur={a.statut} />}{a.nb_observations > 0 && <div className="secondaire">{a.nb_observations} observation(s)</div>}</> },
        ]} />
        {donnees && <Pagination page={donnees.page} taille={donnees.taille} total={donnees.total} onPage={(n) => { const p = new URLSearchParams(params); p.set('page', n); setParams(p); }} />}
      </Carte>
      {detail && <DetailAnomalie id={detail} types={types} onFermer={() => setDetail(null)} onChange={recharger} />}
    </>
  );
}
