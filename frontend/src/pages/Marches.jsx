import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, ArrowLeft, CalendarDays, CheckCircle2, Clock, UserX, Timer } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDonnees } from '../hooks.js';
import { AlerteErreur, Badge, Carte, Champ, Chargement, EntetePage, Indicateur, Modale, Tableau, useFormulaire, useNotifier } from '../composants/ui.jsx';
import { duree, telephone } from '../format.js';

function FormulaireMarche({ marche, onFermer, onEnregistre }) {
  const notifier = useNotifier();
  const f = useFormulaire({ code: marche?.code || '', nom: marche?.nom || '', description: marche?.description || '' });
  const enregistrer = () => f.soumettre(async (v) => {
    const r = marche ? await api.put(`/marches/${marche.id}`, v) : await api.post('/marches', v);
    notifier(marche ? 'Marché modifié' : 'Marché créé');
    onEnregistre(r);
  }).catch(() => {});
  return (
    <Modale titre={marche ? 'Modifier le marché' : 'Nouveau marché'} onFermer={onFermer} pied={<>
      <button className="bouton bouton-secondaire" onClick={onFermer}>Annuler</button>
      <button className="bouton bouton-principal" disabled={f.encours} onClick={enregistrer}>Enregistrer</button>
    </>}>
      <AlerteErreur erreur={f.erreur} />
      <div className="ligne-champs">
        <Champ libelle="Code" obligatoire erreur={f.erreurChamp('code')}><input className="saisie" value={f.valeurs.code} onChange={f.maj('code')} placeholder="Ex. : M-COCODY" /></Champ>
        <Champ libelle="Nom" obligatoire erreur={f.erreurChamp('nom')}><input className="saisie" value={f.valeurs.nom} onChange={f.maj('nom')} /></Champ>
      </div>
      <Champ libelle="Description"><textarea className="saisie" value={f.valeurs.description} onChange={f.maj('description')} maxLength={500} /></Champ>
    </Modale>
  );
}

export default function Marches() {
  const { peut } = useAuth();
  const navigate = useNavigate();
  const { donnees, erreur } = useDonnees('/marches');
  const [form, setForm] = useState(false);
  return (
    <>
      <EntetePage titre="Marchés" description="Regroupements de domiciles et d'enseignants.">
        {peut('marches.gerer') && <button className="bouton bouton-principal" onClick={() => setForm(true)}><Plus size={16} /> Créer un marché</button>}
      </EntetePage>
      <AlerteErreur erreur={erreur} />
      <Carte corps={false}>
        <Tableau lignes={donnees} onLigne={(m) => navigate(`/marches/${m.id}`)} vide="Aucun marché" classeLigne={(m) => (m.actif ? '' : 'inactif')} colonnes={[
          { cle: 'code', titre: 'Code', rendu: (m) => <span className="code">{m.code}</span> },
          { cle: 'nom', titre: 'Nom', rendu: (m) => <strong>{m.nom}</strong> },
          { cle: 'description', titre: 'Description', rendu: (m) => <span className="libre">{m.description || '—'}</span> },
          { cle: 'nb_enseignants', titre: 'Enseignants actifs', num: true },
          { cle: 'nb_domiciles', titre: 'Domiciles actifs', num: true },
          { cle: 'actif', titre: 'Statut', rendu: (m) => <Badge ton={m.actif ? 'vert' : 'neutre'}>{m.actif ? 'Actif' : 'Inactif'}</Badge> },
        ]} />
      </Carte>
      {form && <FormulaireMarche onFermer={() => setForm(false)} onEnregistre={(m) => navigate(`/marches/${m.id}`)} />}
    </>
  );
}

export function FicheMarche() {
  const { id } = useParams();
  const { peut } = useAuth();
  const notifier = useNotifier();
  const { donnees: m, erreur, recharger } = useDonnees(`/marches/${id}`);
  const [modif, setModif] = useState(false);
  if (erreur) return <AlerteErreur erreur={erreur} />;
  if (!m) return <Chargement />;
  const s = m.statistiques || {};
  const basculer = async () => {
    try { notifier((await api.patch(`/marches/${m.id}/statut`, { actif: !m.actif })).message); recharger(); } catch (e) { notifier(e.message, 'erreur'); }
  };
  return (
    <>
      <p><Link to="/marches"><ArrowLeft size={14} /> Marchés</Link></p>
      <EntetePage titre={m.nom} description={<><span className="code">{m.code}</span> {m.description && `· ${m.description}`}</>}>
        <Badge ton={m.actif ? 'vert' : 'neutre'}>{m.actif ? 'Actif' : 'Inactif'}</Badge>
        {peut('marches.gerer') && <>
          <button className="bouton bouton-secondaire" onClick={() => setModif(true)}><Pencil size={15} /> Modifier</button>
          <button className="bouton bouton-secondaire" onClick={basculer}>{m.actif ? 'Désactiver' : 'Activer'}</button>
        </>}
        <Link className="bouton bouton-secondaire" to={`/presences?marche_id=${m.id}`}>Voir les présences</Link>
      </EntetePage>
      <div className="indicateurs">
        <Indicateur icone={CalendarDays} valeur={s.seances} libelle="Séances (30 derniers jours)" />
        <Indicateur icone={CheckCircle2} valeur={s.presences} libelle="Présences" ton="vert" />
        <Indicateur icone={Clock} valeur={s.retards} libelle="Retards" ton="orange" />
        <Indicateur icone={UserX} valeur={s.absences} libelle="Absences présumées" ton="rouge" />
        <Indicateur icone={Timer} valeur={duree(Number(s.minutes_effectives || 0))} libelle="Durée effective" ton="turquoise" />
      </div>
      <div className="grille grille-2">
        <Carte titre={`Enseignants associés (${m.enseignants.length})`} corps={false}>
          <Tableau compact lignes={m.enseignants} vide="Aucun enseignant" colonnes={[
            { cle: 'nom', titre: 'Enseignant', rendu: (e) => <Link to={`/enseignants/${e.id}`}>{e.nom} {e.prenoms}</Link> },
            { cle: 'telephone', titre: 'Téléphone', rendu: (e) => telephone(e.telephone) },
            { cle: 'actif', titre: '', rendu: (e) => !e.actif && <Badge>Inactif</Badge> },
          ]} />
        </Carte>
        <Carte titre={`Domiciles rattachés (${m.domiciles.length})`} corps={false}>
          <Tableau compact lignes={m.domiciles} vide="Aucun domicile" colonnes={[
            { cle: 'code', titre: 'Domicile', rendu: (d) => <Link to={`/domiciles/${d.id}`}>{d.code}</Link> },
            { cle: 'parent', titre: 'Parent' },
            { cle: 'commune', titre: 'Localisation', rendu: (d) => `${d.commune}${d.quartier ? ` · ${d.quartier}` : ''}` },
            { cle: 'actif', titre: '', rendu: (d) => !d.actif && <Badge>Inactif</Badge> },
          ]} />
        </Carte>
      </div>
      {modif && <FormulaireMarche marche={m} onFermer={() => setModif(false)} onEnregistre={() => { setModif(false); recharger(); }} />}
    </>
  );
}
