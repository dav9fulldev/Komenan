import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { api, chaineRequete } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDonnees } from '../hooks.js';
import { AlerteErreur, Badge, BadgeStatut, Carte, Champ, EntetePage, Modale, Tableau, useNotifier } from '../composants/ui.jsx';
import { date, dateHeure, heure, STATUTS_JUSTIFICATION, TYPES_JUSTIFICATION } from '../format.js';
import DetailSeance from './DetailSeance.jsx';

function Decision({ justification, decision, onFermer, onFait }) {
  const notifier = useNotifier();
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState(null);
  const accepter = decision === 'acceptee';
  const valider = async () => {
    try {
      notifier((await api.post(`/justifications/${justification.id}/decision`, { decision, commentaire })).message);
      onFait();
    } catch (e) { setErreur(e); }
  };
  return (
    <Modale titre={accepter ? 'Accepter la justification' : 'Refuser la justification'} onFermer={onFermer} pied={<>
      <button className="bouton bouton-secondaire" onClick={onFermer}>Annuler</button>
      <button className={`bouton ${accepter ? 'bouton-succes' : 'bouton-danger'}`} disabled={!accepter && !commentaire.trim()} onClick={valider}>{accepter ? 'Accepter' : 'Refuser'}</button>
    </>}>
      <AlerteErreur erreur={erreur} />
      <p style={{ marginTop: 0 }}><strong>{justification.enseignant}</strong> — {TYPES_JUSTIFICATION[justification.type]} du {date(justification.date_seance)}</p>
      <div className="citation">{justification.texte}</div>
      <p className="texte-petit texte-secondaire">La décision qualifie {justification.type === 'retard' ? 'le retard (justifié ou non)' : 'le départ anticipé'} ; les heures constatées ne sont jamais modifiées.</p>
      <Champ libelle={accepter ? 'Commentaire (facultatif)' : 'Motif du refus (obligatoire)'}>
        <textarea className="saisie" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} maxLength={1000} />
      </Champ>
    </Modale>
  );
}

export default function Justifications() {
  const { peut } = useAuth();
  const [statut, setStatut] = useState('en_attente');
  const [type, setType] = useState('');
  const { donnees, erreur, recharger } = useDonnees(`/justifications${chaineRequete({ statut, type })}`);
  const [decision, setDecision] = useState(null);
  const [seance, setSeance] = useState(null);

  return (
    <>
      <EntetePage titre="Justifications" description="Explications saisies par les enseignants lors d'un retard ou d'un départ anticipé." />
      <AlerteErreur erreur={erreur} />
      <Carte corps={false}>
        <div className="filtres">
          <div className="champ"><label>Statut</label>
            <select className="saisie" value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="">Tous</option>{Object.entries(STATUTS_JUSTIFICATION).map(([k, s]) => <option key={k} value={k}>{s.libelle}</option>)}
            </select></div>
          <div className="champ"><label>Type</label>
            <select className="saisie" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Tous</option>{Object.entries(TYPES_JUSTIFICATION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
        </div>
        <Tableau lignes={donnees} vide="Aucune justification" colonnes={[
          { cle: 'cree_le', titre: 'Saisie le', rendu: (j) => dateHeure(j.cree_le) },
          { cle: 'enseignant', titre: 'Enseignant', rendu: (j) => <><strong>{j.enseignant}</strong><div className="secondaire">{j.domicile_code} · {j.marche}</div></> },
          { cle: 'type', titre: 'Motif', rendu: (j) => <><Badge ton="orange">{TYPES_JUSTIFICATION[j.type]}</Badge><div className="secondaire">
            {j.type === 'retard' ? `Prévu ${heure(j.debut_prevu)}, arrivé ${heure(j.arrivee_reelle)} (+${j.retard_minutes} min)` : `Fin ${heure(j.fin_prevue)}, parti ${heure(j.depart_reel)} (−${j.depart_anticipe_minutes} min)`}
          </div></> },
          { cle: 'texte', titre: 'Justification', rendu: (j) => <div className="libre" style={{ whiteSpace: 'pre-wrap' }}>{j.texte}</div> },
          { cle: 'statut', titre: 'Décision', rendu: (j) => <><BadgeStatut table={STATUTS_JUSTIFICATION} valeur={j.statut} />{j.decideur && <div className="secondaire">{j.decideur}{j.commentaire_decision && ` : ${j.commentaire_decision}`}</div>}</> },
          { cle: 'actions', titre: '', rendu: (j) => <div className="actions">
            <button className="bouton bouton-fantome bouton-petit" onClick={() => setSeance(j.seance_id)}>Séance</button>
            {j.statut === 'en_attente' && peut('justifications.decider') && <>
              <button className="bouton bouton-succes bouton-petit" onClick={() => setDecision({ j, d: 'acceptee' })}><Check size={14} /> Accepter</button>
              <button className="bouton bouton-danger bouton-petit" onClick={() => setDecision({ j, d: 'refusee' })}><X size={14} /> Refuser</button>
            </>}
          </div> },
        ]} />
      </Carte>
      {decision && <Decision justification={decision.j} decision={decision.d} onFermer={() => setDecision(null)} onFait={() => { setDecision(null); recharger(); }} />}
      {seance && <DetailSeance id={seance} onFermer={() => setSeance(null)} />}
    </>
  );
}
