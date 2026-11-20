import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDonnees } from '../hooks.js';
import { AlerteErreur, Badge, BadgeStatut, Champ, Chargement, Modale, useNotifier } from '../composants/ui.jsx';
import {
  date, dateHeure, duree, heure, telephone, GRAVITES, MOTIFS_REJET, STATUTS_ABSENCE, STATUTS_ANOMALIE, STATUTS_ARRIVEE,
  STATUTS_GPS, STATUTS_JUSTIFICATION, STATUTS_SEANCE, TYPES_JUSTIFICATION, TYPES_OBSERVATION,
} from '../format.js';

export function Observations({ liste, onAjouter, peutAjouter }) {
  const [type, setType] = useState('observation');
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState(null);
  const ajouter = async () => {
    setErreur(null);
    try { await onAjouter({ type, texte }); setTexte(''); } catch (e) { setErreur(e); }
  };
  return (
    <>
      {liste.length ? (
        <ul className="chronologie">
          {liste.map((o) => (
            <li key={o.id}>
              <div><Badge ton={o.type === 'signalement' ? 'rouge' : o.type === 'demande_precision' ? 'orange' : 'bleu'}>{TYPES_OBSERVATION[o.type]}</Badge> <strong>{o.auteur}</strong> <span className="texte-secondaire texte-petit">({o.role === 'admin' ? 'administrateur' : 'superviseur'}) · {dateHeure(o.cree_le)}</span></div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{o.texte}</div>
            </li>
          ))}
        </ul>
      ) : <p className="texte-secondaire">Aucune observation.</p>}
      {peutAjouter && (
        <div className="mt">
          <AlerteErreur erreur={erreur} />
          <div className="ligne-champs">
            <Champ libelle="Type">
              <select className="saisie" value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(TYPES_OBSERVATION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Champ>
          </div>
          <Champ libelle="Texte"><textarea className="saisie" value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={2000} placeholder="Votre observation, question à l'administration ou signalement…" /></Champ>
          <button className="bouton bouton-principal bouton-petit" disabled={!texte.trim()} onClick={ajouter}>Ajouter</button>
        </div>
      )}
    </>
  );
}

export function Pointage({ p }) {
  return (
    <li className={p.resultat === 'rejete' ? 'rejete' : ''}>
      <div><strong>{p.type === 'arrivee' ? 'Arrivée' : p.type === 'depart' ? 'Départ' : 'Tentative'}</strong> — {dateHeure(p.heure_serveur)}{' '}
        {p.resultat === 'accepte' ? <Badge ton="vert">Accepté</Badge> : <Badge ton="rouge">Rejeté : {MOTIFS_REJET[p.motif_rejet] || p.motif_rejet}</Badge>}
      </div>
      <div className="texte-petit texte-secondaire">
        GPS : {STATUTS_GPS[p.statut_gps] || 'non contrôlé'}
        {p.distance_m != null && ` · ${Math.round(p.distance_m)} m du domicile`}
        {p.precision_m != null && ` · précision ± ${Math.round(p.precision_m)} m`}
        {p.latitude != null && <> · <a href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=18/${p.latitude}/${p.longitude}`} target="_blank" rel="noreferrer"><MapPin size={11} /> voir la position</a></>}
      </div>
      {p.nom_saisi && <div className="texte-petit texte-secondaire">Saisi : {p.telephone_saisi} · « {p.nom_saisi} »</div>}
      {p.ip && <div className="texte-petit texte-secondaire">Adresse IP : {p.ip}</div>}
    </li>
  );
}

export default function DetailSeance({ id, onFermer, onChange }) {
  const { peut } = useAuth();
  const notifier = useNotifier();
  const { donnees: s, erreur, recharger } = useDonnees(`/presences/${id}`);
  const [decision, setDecision] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [erreurDecision, setErreurDecision] = useState(null);

  const statuer = async () => {
    setErreurDecision(null);
    try {
      notifier((await api.patch(`/presences/${id}/absence`, { decision, commentaire })).message);
      setDecision(''); setCommentaire(''); recharger(); onChange?.();
    } catch (e) { setErreurDecision(e); }
  };

  return (
    <Modale titre="Détail de la séance" onFermer={onFermer} large>
      <AlerteErreur erreur={erreur} />
      {!s ? <Chargement /> : (
        <>
          <dl className="liste-def">
            <dt>Enseignant</dt><dd>{s.enseignant} · {telephone(s.telephone)}</dd>
            <dt>Parent / domicile</dt><dd>{s.parent} · {s.domicile_code} ({s.commune}{s.quartier && `, ${s.quartier}`})</dd>
            <dt>Marché / matière</dt><dd>{s.marche} · {s.matiere}</dd>
            <dt>Date</dt><dd>{date(s.date_seance)}</dd>
            <dt>Horaire prévu</dt><dd>{heure(s.debut_prevu)} – {heure(s.fin_prevue)}</dd>
            <dt>Arrivée réelle</dt><dd>{heure(s.arrivee_reelle)} {s.retard_minutes > 0 && <span className="texte-orange">(retard constaté : {s.retard_minutes} min)</span>} <BadgeStatut table={STATUTS_ARRIVEE} valeur={s.statut_arrivee} /></dd>
            <dt>Départ réel</dt><dd>{heure(s.depart_reel)} {s.depart_anticipe_minutes > 0 && <span className="texte-orange">(départ anticipé de {s.depart_anticipe_minutes} min)</span>}</dd>
            <dt>Durée effective</dt><dd>{duree(s.duree_effective_minutes)}</dd>
            <dt>Statut</dt><dd><BadgeStatut table={STATUTS_SEANCE} valeur={s.statut} /> {s.statut_absence && <BadgeStatut table={STATUTS_ABSENCE} valeur={s.statut_absence} />}</dd>
          </dl>

          {s.statut === 'absence_presumee' && s.statut_absence === 'a_verifier' && peut('anomalies.traiter') && (
            <div className="carte carte-corps mt" style={{ background: '#FFF7ED', borderColor: '#FED7AA' }}>
              <strong>Absence présumée à vérifier</strong>
              <p className="texte-petit texte-secondaire" style={{ margin: '4px 0 10px' }}>Contactez le parent et l'enseignant avant de statuer. La décision est tracée et n'efface pas l'historique.</p>
              <AlerteErreur erreur={erreurDecision} />
              <div className="ligne-champs">
                <Champ libelle="Décision">
                  <select className="saisie" value={decision} onChange={(e) => setDecision(e.target.value)}>
                    <option value="">— Choisir —</option>
                    <option value="confirmee">Absence confirmée (non justifiée)</option>
                    <option value="justifiee">Absence justifiée</option>
                  </select>
                </Champ>
              </div>
              <Champ libelle="Commentaire (obligatoire)"><textarea className="saisie" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Ex. : le parent confirme que l'enseignant n'est pas venu" /></Champ>
              <button className="bouton bouton-principal bouton-petit" disabled={!decision || !commentaire.trim()} onClick={statuer}>Enregistrer la décision</button>
            </div>
          )}

          <h3 className="mt" style={{ fontSize: 15, marginBottom: 10 }}>Journal des pointages</h3>
          {s.pointages.length ? <ul className="chronologie">{s.pointages.map((p) => <Pointage key={p.id} p={p} />)}</ul> : <p className="texte-secondaire">Aucun pointage enregistré pour cette séance.</p>}

          {s.justifications.length > 0 && <>
            <h3 className="mt" style={{ fontSize: 15, marginBottom: 10 }}>Justifications</h3>
            {s.justifications.map((j) => (
              <div key={j.id} className="mb">
                <Badge ton="orange">{TYPES_JUSTIFICATION[j.type]}</Badge> <BadgeStatut table={STATUTS_JUSTIFICATION} valeur={j.statut} /> <span className="texte-petit texte-secondaire">{dateHeure(j.cree_le)}</span>
                <div className="citation">{j.texte}</div>
                {j.decideur && <div className="texte-petit texte-secondaire">Décision de {j.decideur} le {dateHeure(j.decision_le)}{j.commentaire_decision && ` : ${j.commentaire_decision}`}</div>}
              </div>
            ))}
          </>}

          {s.anomalies.length > 0 && <>
            <h3 className="mt" style={{ fontSize: 15, marginBottom: 10 }}>Anomalies liées</h3>
            <ul className="liste-simple carte">
              {s.anomalies.map((a) => (
                <li key={a.id}><span>{a.description}</span><span className="actions"><BadgeStatut table={GRAVITES} valeur={a.gravite} /><BadgeStatut table={STATUTS_ANOMALIE} valeur={a.statut} /></span></li>
              ))}
            </ul>
          </>}

          <h3 className="mt" style={{ fontSize: 15, marginBottom: 10 }}>Observations</h3>
          <Observations liste={s.observations} peutAjouter={peut('anomalies.observer')}
            onAjouter={async (o) => { await api.post(`/presences/${id}/observations`, o); notifier('Observation enregistrée'); recharger(); }} />
        </>
      )}
    </Modale>
  );
}
