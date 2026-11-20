import { Link, useNavigate } from 'react-router-dom';
import { Users, CalendarDays, CheckCircle2, PlayCircle, Clock, UserX, AlertTriangle, RefreshCw } from 'lucide-react';
import { useDonnees } from '../hooks.js';
import { Carte, Chargement, EntetePage, Indicateur, Vide, AlerteErreur, BadgeStatut, Badge } from '../composants/ui.jsx';
import { heure, date, jourLong, STATUTS_SEANCE, STATUTS_ARRIVEE, TYPES_JUSTIFICATION } from '../format.js';

function ListeSeances({ lignes, rendu, vide }) {
  if (!lignes.length) return <Vide texte={vide} />;
  return (
    <ul className="liste-simple">
      {lignes.map((s) => (
        <li key={s.id}>
          <div>
            <div className="principal">{s.enseignant}</div>
            <div className="secondaire">{s.domicile_code} · {s.marche} · {s.matiere}</div>
          </div>
          <div style={{ textAlign: 'right' }}>{rendu(s)}</div>
        </li>
      ))}
    </ul>
  );
}

export default function TableauDeBord() {
  const { donnees: d, erreur, recharger } = useDonnees('/tableau-de-bord');
  const navigate = useNavigate();
  if (erreur) return <AlerteErreur erreur={erreur} />;
  if (!d) return <Chargement />;
  const i = d.indicateurs;
  const aujourdhui = `debut=${d.date}&fin=${d.date}`;

  return (
    <>
      <EntetePage titre="Tableau de bord" description={`Situation du ${jourLong(`${d.date}T12:00:00Z`)}`}>
        <button className="bouton bouton-secondaire" onClick={recharger}><RefreshCw size={15} /> Actualiser</button>
      </EntetePage>

      <div className="indicateurs">
        <Indicateur icone={Users} valeur={i.enseignants_actifs} libelle="Enseignants actifs" ton="marine" onClick={() => navigate('/enseignants')} />
        <Indicateur icone={CalendarDays} valeur={i.cours_programmes} libelle="Cours programmés aujourd'hui" ton="bleu" onClick={() => navigate(`/presences?${aujourdhui}&inclure_futures=1`)} />
        <Indicateur icone={CheckCircle2} valeur={i.presences} libelle="Présences enregistrées" ton="vert" onClick={() => navigate(`/presences?${aujourdhui}`)} />
        <Indicateur icone={PlayCircle} valeur={i.seances_en_cours} libelle="Séances en cours" ton="turquoise" onClick={() => navigate('/presences?statut=en_cours')} />
        <Indicateur icone={Clock} valeur={i.retards} libelle="Retards du jour" ton="orange" onClick={() => navigate(`/presences?${aujourdhui}&statut=en_retard`)} />
        <Indicateur icone={UserX} valeur={i.absences_presumees} libelle={`Absences présumées (${i.absences_a_verifier} à vérifier au total)`} ton="rouge" onClick={() => navigate('/presences?statut=absence_presumee')} />
        <Indicateur icone={AlertTriangle} valeur={i.anomalies_a_examiner} libelle="Anomalies à examiner" ton="rouge" onClick={() => navigate('/anomalies')} />
      </div>

      <div className="grille grille-3">
        <Carte titre="Dernières arrivées" corps={false} actions={<Link to="/presences">Tout voir</Link>}>
          <ListeSeances lignes={d.dernieresPresences} vide="Aucune arrivée enregistrée" rendu={(s) => <>
            <div><strong>{heure(s.arrivee_reelle)}</strong></div>
            <div className="secondaire">{date(s.date_seance)}</div>
            <BadgeStatut table={STATUTS_ARRIVEE} valeur={s.statut_arrivee} />
          </>} />
        </Carte>
        <Carte titre="Derniers départs" corps={false}>
          <ListeSeances lignes={d.derniersDeparts} vide="Aucun départ enregistré" rendu={(s) => <>
            <div><strong>{heure(s.depart_reel)}</strong></div>
            <div className="secondaire">{date(s.date_seance)} · {s.duree_effective_minutes} min</div>
            {s.depart_anticipe_minutes > 0 && <Badge ton="orange">Départ anticipé</Badge>}
          </>} />
        </Carte>
        <Carte titre="Retards récents" corps={false} actions={<Link to="/presences?statut=en_retard">Tout voir</Link>}>
          <ListeSeances lignes={d.retardsRecents} vide="Aucun retard" rendu={(s) => <>
            <div className="texte-orange">+{s.retard_minutes} min</div>
            <div className="secondaire">{date(s.date_seance)} · prévu {heure(s.debut_prevu)}</div>
            <BadgeStatut table={STATUTS_ARRIVEE} valeur={s.statut_arrivee} />
          </>} />
        </Carte>
        <Carte titre="Justifications en attente" corps={false} actions={<Link to="/justifications">Examiner</Link>}>
          {d.justifications.length ? (
            <ul className="liste-simple">
              {d.justifications.map((j) => (
                <li key={j.id}>
                  <div>
                    <div className="principal">{j.enseignant}</div>
                    <div className="secondaire" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>« {j.texte} »</div>
                  </div>
                  <Badge ton="orange">{TYPES_JUSTIFICATION[j.type]}</Badge>
                </li>
              ))}
            </ul>
          ) : <Vide texte="Aucune justification en attente" />}
        </Carte>
        <Carte titre="Interventions sans pointage" corps={false} className="" actions={<Link to="/presences?statut=absence_presumee">Tout voir</Link>}>
          <ListeSeances lignes={d.sansPointage} vide="Aucune intervention sans pointage" rendu={(s) => <>
            <div><strong>{heure(s.debut_prevu)}</strong></div>
            <div className="secondaire">{date(s.date_seance)}</div>
            <BadgeStatut table={STATUTS_SEANCE} valeur={s.statut} />
          </>} />
        </Carte>
      </div>
    </>
  );
}
