import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Power, Info } from 'lucide-react';
import { api, chaineRequete } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDonnees, useReferentiels } from '../hooks.js';
import { Alerte, AlerteErreur, Badge, Carte, Champ, Confirmation, EntetePage, Modale, Tableau, useFormulaire, useNotifier } from '../composants/ui.jsx';
import { aujourdhui, date, telephone } from '../format.js';

function FormulaireAffectation({ affectation, initial, onFermer, onEnregistre }) {
  const notifier = useNotifier();
  const refs = useReferentiels('enseignants', 'domiciles');
  const [fiche, setFiche] = useState(null);
  const f = useFormulaire({
    enseignant_id: affectation?.enseignant_id || initial?.enseignant_id || '', domicile_id: affectation?.domicile_id || '',
    matiere_id: affectation?.matiere_id || '', date_debut: affectation?.date_debut || aujourdhui(), date_fin: affectation?.date_fin || '',
  });
  const v = f.valeurs;
  // Matières de l'enseignant choisi
  useEffect(() => {
    if (!v.enseignant_id) { setFiche(null); return; }
    api.get(`/enseignants/${v.enseignant_id}`).then(setFiche).catch(() => setFiche(null));
  }, [v.enseignant_id]);
  const domicile = (refs.domiciles || []).find((d) => String(d.id) === String(v.domicile_id));

  const enregistrer = () => f.soumettre(async (x) => {
    const r = affectation ? await api.put(`/affectations/${affectation.id}`, x) : await api.post('/affectations', x);
    notifier(affectation ? 'Affectation modifiée' : 'Affectation créée');
    onEnregistre(r);
  }).catch(() => {});

  return (
    <Modale titre={affectation ? "Modifier l'affectation" : 'Nouvelle affectation'} onFermer={onFermer} pied={<>
      <button className="bouton bouton-secondaire" onClick={onFermer}>Annuler</button>
      <button className="bouton bouton-principal" disabled={f.encours} onClick={enregistrer}>Enregistrer</button>
    </>}>
      <AlerteErreur erreur={f.erreur} />
      <Champ libelle="Enseignant" obligatoire erreur={f.erreurChamp('enseignant_id')}>
        <select className="saisie" value={v.enseignant_id} onChange={(e) => f.setValeurs({ ...v, enseignant_id: e.target.value, matiere_id: '' })}>
          <option value="">— Sélectionner —</option>
          {(refs.enseignants || []).filter((e) => e.actif).map((e) => <option key={e.id} value={e.id}>{e.nom} {e.prenoms} · {telephone(e.telephone)}</option>)}
        </select>
      </Champ>
      <Champ libelle="Domicile (parent)" obligatoire erreur={f.erreurChamp('domicile_id')}>
        <select className="saisie" value={v.domicile_id} onChange={f.maj('domicile_id')}>
          <option value="">— Sélectionner —</option>
          {(refs.domiciles || []).filter((d) => d.actif).map((d) => <option key={d.id} value={d.id}>{d.code} · {d.parent_nom} {d.parent_prenoms} · {d.commune}</option>)}
        </select>
      </Champ>
      {domicile && <Alerte type="info">Marché : <strong>{domicile.marche}</strong> (déterminé par le domicile).</Alerte>}
      <Champ libelle="Matière enseignée" obligatoire erreur={f.erreurChamp('matiere_id')} aide={fiche && !fiche.matieres.length ? "Cet enseignant n'a aucune matière : complétez sa fiche." : undefined}>
        <select className="saisie" value={v.matiere_id} onChange={f.maj('matiere_id')} disabled={!fiche}>
          <option value="">— Sélectionner —</option>
          {(fiche?.matieres || []).map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
        </select>
      </Champ>
      <div className="ligne-champs">
        <Champ libelle="Début de validité" obligatoire erreur={f.erreurChamp('date_debut')}><input className="saisie" type="date" value={v.date_debut} onChange={f.maj('date_debut')} /></Champ>
        <Champ libelle="Fin de validité" aide="Vide = sans date de fin" erreur={f.erreurChamp('date_fin')}><input className="saisie" type="date" value={v.date_fin} onChange={f.maj('date_fin')} /></Champ>
      </div>
    </Modale>
  );
}

export default function Affectations() {
  const { peut } = useAuth();
  const notifier = useNotifier();
  const [params, setParams] = useSearchParams();
  const refs = useReferentiels('enseignants', 'marches', 'domiciles');
  const filtres = { enseignant_id: params.get('enseignant_id') || '', marche_id: params.get('marche_id') || '', domicile_id: params.get('domicile_id') || '', en_cours: params.get('en_cours') ?? '1' };
  const { donnees, erreur, recharger } = useDonnees(`/affectations${chaineRequete(filtres)}`);
  const [form, setForm] = useState(null);
  const [statut, setStatut] = useState(null);
  const changer = (k) => (e) => { const p = new URLSearchParams(params); p.set(k, e.target.value); setParams(p); };
  const gerer = peut('affectations.gerer');

  return (
    <>
      <EntetePage titre="Affectations" description="Quel enseignant intervient dans quel domicile, pour quelle matière et sur quelle période.">
        {gerer && <button className="bouton bouton-principal" onClick={() => setForm({ initial: { enseignant_id: filtres.enseignant_id } })}><Plus size={16} /> Nouvelle affectation</button>}
      </EntetePage>
      <Alerte type="info">L'enseignant ne choisit jamais son lieu d'intervention : le QR Code scanné détermine le domicile, qui est vérifié par rapport à cette affectation et à l'emploi du temps.</Alerte>
      <AlerteErreur erreur={erreur} />
      <Carte corps={false}>
        <div className="filtres">
          <div className="champ"><label>Enseignant</label>
            <select className="saisie" value={filtres.enseignant_id} onChange={changer('enseignant_id')}>
              <option value="">Tous</option>{(refs.enseignants || []).map((e) => <option key={e.id} value={e.id}>{e.nom} {e.prenoms}</option>)}
            </select></div>
          <div className="champ"><label>Marché</label>
            <select className="saisie" value={filtres.marche_id} onChange={changer('marche_id')}>
              <option value="">Tous</option>{(refs.marches || []).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select></div>
          <div className="champ"><label>Domicile</label>
            <select className="saisie" value={filtres.domicile_id} onChange={changer('domicile_id')}>
              <option value="">Tous</option>{(refs.domiciles || []).map((d) => <option key={d.id} value={d.id}>{d.code} · {d.parent_nom}</option>)}
            </select></div>
          <div className="champ"><label>Période</label>
            <select className="saisie" value={filtres.en_cours} onChange={changer('en_cours')}>
              <option value="1">En vigueur</option><option value="0">Toutes (historique)</option>
            </select></div>
        </div>
        <Tableau lignes={donnees} vide="Aucune affectation" classeLigne={(a) => (a.actif ? '' : 'inactif')} colonnes={[
          { cle: 'enseignant', titre: 'Enseignant', rendu: (a) => <><Link to={`/enseignants/${a.enseignant_id}`}>{a.enseignant}</Link><div className="secondaire">{telephone(a.enseignant_telephone)}</div></> },
          { cle: 'marche', titre: 'Marché' },
          { cle: 'parent', titre: 'Parent' },
          { cle: 'domicile_code', titre: 'Domicile', rendu: (a) => <><Link to={`/domiciles/${a.domicile_id}`}>{a.domicile_code}</Link><div className="secondaire">{a.commune}{a.quartier && ` · ${a.quartier}`}</div></> },
          { cle: 'matiere', titre: 'Matière' },
          { cle: 'periode', titre: 'Validité', rendu: (a) => `${date(a.date_debut)} → ${a.date_fin ? date(a.date_fin) : '…'}` },
          { cle: 'nb_creneaux', titre: 'Créneaux', num: true, rendu: (a) => <Link to={`/plannings?enseignant_id=${a.enseignant_id}`}>{a.nb_creneaux}</Link> },
          { cle: 'statut', titre: 'Statut', rendu: (a) => <Badge ton={a.actif ? 'vert' : 'neutre'}>{a.actif ? 'Active' : 'Inactive'}</Badge> },
          ...(gerer ? [{ cle: 'actions', titre: '', rendu: (a) => <div className="actions">
            <button className="bouton-icone" title="Modifier" onClick={() => setForm({ affectation: a })}><Pencil size={15} /></button>
            <button className="bouton-icone" title={a.actif ? 'Désactiver' : 'Réactiver'} onClick={() => setStatut(a)}><Power size={15} /></button>
          </div> }] : []),
        ]} />
      </Carte>
      {!gerer && <p className="texte-petit texte-secondaire"><Info size={12} /> Consultation seule : seule l'administration peut modifier les affectations.</p>}
      {form && <FormulaireAffectation {...form} onFermer={() => setForm(null)} onEnregistre={() => { setForm(null); recharger(); }} />}
      {statut && <Confirmation titre={statut.actif ? "Désactiver l'affectation" : "Réactiver l'affectation"}
        message={statut.actif ? 'Les séances futures liées à cette affectation seront annulées. Les séances passées restent dans l\'historique.' : 'Les créneaux de cette affectation seront de nouveau programmés.'}
        libelle={statut.actif ? 'Désactiver' : 'Réactiver'} danger={!!statut.actif} onFermer={() => setStatut(null)}
        onConfirmer={async () => { notifier((await api.patch(`/affectations/${statut.id}/statut`, { actif: !statut.actif })).message); recharger(); }} />}
    </>
  );
}
