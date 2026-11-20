import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Power, ArrowLeft } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDonnees, useReferentiels } from '../hooks.js';
import {
  AlerteErreur, Badge, Carte, Champ, Chargement, Confirmation, EntetePage, Modale, Recherche, Tableau, useFormulaire, useNotifier, Indicateur,
} from '../composants/ui.jsx';
import { date, duree, telephone } from '../format.js';
import { CalendarDays, CheckCircle2, Clock, UserX, Timer } from 'lucide-react';

export function FormulaireEnseignant({ enseignant, onFermer, onEnregistre }) {
  const notifier = useNotifier();
  const refs = useReferentiels('matieres', 'marches');
  const [matieres, setMatieres] = useState(null);
  const [nouvelleMatiere, setNouvelleMatiere] = useState('');
  const f = useFormulaire({
    matricule: enseignant?.matricule || '', nom: enseignant?.nom || '', prenoms: enseignant?.prenoms || '',
    telephone: enseignant ? telephone(enseignant.telephone) : '', email: enseignant?.email || '',
    matieres: enseignant?.matieres?.map((m) => m.id) || [], marches: enseignant?.marches?.map((m) => m.id) || [],
  });
  const listeMatieres = matieres || refs.matieres || [];
  const basculer = (champ, id) => f.setValeurs((v) => ({ ...v, [champ]: v[champ].includes(id) ? v[champ].filter((x) => x !== id) : [...v[champ], id] }));

  const ajouterMatiere = async () => {
    try {
      const m = await api.post('/matieres', { libelle: nouvelleMatiere });
      setMatieres([...listeMatieres, m].sort((a, b) => a.libelle.localeCompare(b.libelle)));
      f.setValeurs((v) => ({ ...v, matieres: [...v.matieres, m.id] }));
      setNouvelleMatiere('');
    } catch (e) { notifier(e.message, 'erreur'); }
  };

  const enregistrer = () => f.soumettre(async (v) => {
    const r = enseignant ? await api.put(`/enseignants/${enseignant.id}`, v) : await api.post('/enseignants', v);
    notifier(enseignant ? 'Enseignant modifié' : 'Enseignant créé');
    onEnregistre(r);
  }).catch(() => {});

  return (
    <Modale titre={enseignant ? "Modifier l'enseignant" : 'Nouvel enseignant'} onFermer={onFermer} large pied={<>
      <button className="bouton bouton-secondaire" onClick={onFermer}>Annuler</button>
      <button className="bouton bouton-principal" disabled={f.encours} onClick={enregistrer}>Enregistrer</button>
    </>}>
      <AlerteErreur erreur={f.erreur} />
      <div className="ligne-champs">
        <Champ libelle="Nom" obligatoire erreur={f.erreurChamp('nom')}><input className="saisie" value={f.valeurs.nom} onChange={f.maj('nom')} /></Champ>
        <Champ libelle="Prénoms" obligatoire erreur={f.erreurChamp('prenoms')}><input className="saisie" value={f.valeurs.prenoms} onChange={f.maj('prenoms')} /></Champ>
        <Champ libelle="Numéro de téléphone" obligatoire erreur={f.erreurChamp('telephone')} aide="Numéro unique, utilisé pour le pointage">
          <input className="saisie" type="tel" value={f.valeurs.telephone} onChange={f.maj('telephone')} placeholder="07 00 00 00 00" />
        </Champ>
        <Champ libelle="Adresse e-mail (facultative)" erreur={f.erreurChamp('email')}><input className="saisie" type="email" value={f.valeurs.email} onChange={f.maj('email')} /></Champ>
        <Champ libelle="Identifiant interne" aide="Laissez vide pour une génération automatique (ENS-0001…)" erreur={f.erreurChamp('matricule')}>
          <input className="saisie" value={f.valeurs.matricule} onChange={f.maj('matricule')} />
        </Champ>
      </div>
      <Champ libelle="Matières enseignées">
        <div className="cases">
          {listeMatieres.map((m) => (
            <label key={m.id}><input type="checkbox" checked={f.valeurs.matieres.includes(m.id)} onChange={() => basculer('matieres', m.id)} /> {m.libelle}</label>
          ))}
          {!listeMatieres.length && <span className="texte-secondaire">Aucune matière : ajoutez-en une ci-dessous.</span>}
        </div>
        <div className="actions" style={{ marginTop: 8 }}>
          <input className="saisie" style={{ maxWidth: 240 }} placeholder="Nouvelle matière" value={nouvelleMatiere} onChange={(e) => setNouvelleMatiere(e.target.value)} />
          <button type="button" className="bouton bouton-secondaire bouton-petit" disabled={!nouvelleMatiere.trim()} onClick={ajouterMatiere}><Plus size={14} /> Ajouter</button>
        </div>
      </Champ>
      <Champ libelle="Marchés" aide="Un enseignant peut intervenir sur plusieurs marchés. Il est aussi rattaché automatiquement lors d'une affectation.">
        <div className="cases">
          {(refs.marches || []).filter((m) => m.actif).map((m) => (
            <label key={m.id}><input type="checkbox" checked={f.valeurs.marches.includes(m.id)} onChange={() => basculer('marches', m.id)} /> {m.nom}</label>
          ))}
        </div>
      </Champ>
    </Modale>
  );
}

export default function Enseignants() {
  const { peut } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('1');
  const { donnees, erreur } = useDonnees(`/enseignants?actif=${statut}`);
  const [form, setForm] = useState(null);
  const lignes = useMemo(() => {
    if (!donnees) return null;
    const t = q.toLowerCase();
    return donnees.filter((e) => !t || `${e.nom} ${e.prenoms} ${e.telephone} ${e.matricule} ${e.matieres || ''}`.toLowerCase().includes(t));
  }, [donnees, q]);

  return (
    <>
      <EntetePage titre="Enseignants" description="Enseignants intervenant à domicile et leurs informations d'identification.">
        {peut('enseignants.gerer') && <button className="bouton bouton-principal" onClick={() => setForm({})}><Plus size={16} /> Ajouter un enseignant</button>}
      </EntetePage>
      <AlerteErreur erreur={erreur} />
      <Carte corps={false}>
        <div className="filtres">
          <div className="champ" style={{ flex: 1, minWidth: 220 }}><label>Recherche</label><Recherche valeur={q} onChange={setQ} placeholder="Nom, téléphone, identifiant, matière…" /></div>
          <div className="champ"><label>Statut</label>
            <select className="saisie" value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="1">Actifs</option><option value="0">Inactifs</option><option value="">Tous</option>
            </select>
          </div>
        </div>
        <Tableau
          lignes={lignes}
          onLigne={(e) => navigate(`/enseignants/${e.id}`)}
          classeLigne={(e) => (e.actif ? '' : 'inactif')}
          vide="Aucun enseignant"
          colonnes={[
            { cle: 'matricule', titre: 'Identifiant', rendu: (e) => <span className="code">{e.matricule}</span> },
            { cle: 'nom', titre: 'Nom et prénoms', rendu: (e) => <strong>{e.nom} {e.prenoms}</strong> },
            { cle: 'telephone', titre: 'Téléphone', rendu: (e) => telephone(e.telephone) },
            { cle: 'matieres', titre: 'Matières', rendu: (e) => <span className="libre">{e.matieres || '—'}</span> },
            { cle: 'marches', titre: 'Marchés' },
            { cle: 'nb_affectations', titre: 'Affectations', num: true },
            { cle: 'actif', titre: 'Statut', rendu: (e) => <Badge ton={e.actif ? 'vert' : 'neutre'}>{e.actif ? 'Actif' : 'Inactif'}</Badge> },
          ]}
        />
      </Carte>
      {form && <FormulaireEnseignant onFermer={() => setForm(null)} onEnregistre={(e) => { setForm(null); navigate(`/enseignants/${e.id}`); }} />}
    </>
  );
}

export function FicheEnseignant() {
  const { id } = useParams();
  const { peut } = useAuth();
  const notifier = useNotifier();
  const { donnees: e, erreur, recharger } = useDonnees(`/enseignants/${id}`);
  const [modif, setModif] = useState(false);
  const [statut, setStatut] = useState(false);
  if (erreur) return <AlerteErreur erreur={erreur} />;
  if (!e) return <Chargement />;
  const s = e.statistiques || {};

  return (
    <>
      <p className="pas-imprimer"><Link to="/enseignants"><ArrowLeft size={14} /> Enseignants</Link></p>
      <EntetePage titre={`${e.nom} ${e.prenoms}`} description={<><span className="code">{e.matricule}</span> · {telephone(e.telephone)} {e.email && `· ${e.email}`}</>}>
        <Badge ton={e.actif ? 'vert' : 'neutre'}>{e.actif ? 'Actif' : 'Inactif'}</Badge>
        {peut('enseignants.gerer') && <>
          <button className="bouton bouton-secondaire" onClick={() => setModif(true)}><Pencil size={15} /> Modifier</button>
          <button className={`bouton ${e.actif ? 'bouton-secondaire' : 'bouton-succes'}`} onClick={() => setStatut(true)}><Power size={15} /> {e.actif ? 'Désactiver' : 'Activer'}</button>
        </>}
        <Link className="bouton bouton-secondaire" to={`/presences?enseignant_id=${e.id}`}>Voir les présences</Link>
      </EntetePage>

      <div className="indicateurs">
        <Indicateur icone={CalendarDays} valeur={s.seances} libelle="Séances (30 derniers jours)" />
        <Indicateur icone={CheckCircle2} valeur={s.presences} libelle="Présences" ton="vert" />
        <Indicateur icone={Clock} valeur={s.retards} libelle="Retards" ton="orange" />
        <Indicateur icone={UserX} valeur={s.absences} libelle="Absences présumées" ton="rouge" />
        <Indicateur icone={Timer} valeur={duree(Number(s.minutes_effectives || 0))} libelle="Durée effective" ton="turquoise" />
      </div>

      <div className="grille grille-2">
        <Carte titre="Informations">
          <dl className="liste-def">
            <dt>Matières</dt><dd>{e.matieres.map((m) => m.libelle).join(', ') || '—'}</dd>
            <dt>Marchés</dt><dd>{e.marches.map((m) => <span key={m.id}><Link to={`/marches/${m.id}`}>{m.nom}</Link> </span>)}{!e.marches.length && '—'}</dd>
            <dt>Créé le</dt><dd>{date(e.cree_le)}</dd>
          </dl>
        </Carte>
        <Carte titre="Affectations" corps={false} actions={peut('affectations.gerer') && <Link to={`/affectations?enseignant_id=${e.id}`}>Gérer</Link>}>
          <Tableau compact lignes={e.affectations} vide="Aucune affectation" colonnes={[
            { cle: 'domicile_code', titre: 'Domicile', rendu: (a) => <Link to={`/domiciles/${a.domicile_id}`}>{a.domicile_code}</Link> },
            { cle: 'parent', titre: 'Parent' },
            { cle: 'matiere', titre: 'Matière' },
            { cle: 'periode', titre: 'Période', rendu: (a) => `${date(a.date_debut)} → ${a.date_fin ? date(a.date_fin) : '…'}` },
            { cle: 'actif', titre: '', rendu: (a) => !a.actif && <Badge>Inactive</Badge> },
          ]} />
        </Carte>
      </div>

      {modif && <FormulaireEnseignant enseignant={e} onFermer={() => setModif(false)} onEnregistre={() => { setModif(false); recharger(); }} />}
      {statut && <Confirmation
        titre={e.actif ? "Désactiver l'enseignant" : "Activer l'enseignant"}
        message={e.actif ? 'Il ne pourra plus pointer et ses séances futures seront annulées. Son historique est conservé.' : 'Ses créneaux actifs seront de nouveau programmés.'}
        libelle={e.actif ? 'Désactiver' : 'Activer'} danger={!!e.actif}
        onFermer={() => setStatut(false)}
        onConfirmer={async () => { const r = await api.patch(`/enseignants/${e.id}/statut`, { actif: !e.actif }); notifier(r.message); recharger(); }}
      />}
    </>
  );
}
