import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, List, CalendarDays } from 'lucide-react';
import { api, chaineRequete } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDonnees, useReferentiels } from '../hooks.js';
import { AlerteErreur, Badge, Carte, Champ, Chargement, Confirmation, EntetePage, Modale, Onglets, Tableau, useFormulaire, useNotifier } from '../composants/ui.jsx';
import { aujourdhui, date, decalerJours, FREQUENCES, JOURS, STATUTS_SEANCE } from '../format.js';

function FormulaireCreneau({ creneau, onFermer, onEnregistre }) {
  const notifier = useNotifier();
  const { donnees: affectations } = useDonnees('/affectations?en_cours=0');
  const f = useFormulaire({
    affectation_id: creneau?.affectation_id || '', jour_semaine: creneau?.jour_semaine || 1, heure_debut: creneau?.heure_debut || '16:00',
    heure_fin: creneau?.heure_fin || '18:00', frequence: creneau?.frequence || 'hebdomadaire',
    date_debut: creneau?.date_debut || aujourdhui(), date_fin: creneau?.frequence === 'ponctuelle' ? '' : creneau?.date_fin || '',
  });
  const v = f.valeurs;
  const aff = (affectations || []).find((a) => String(a.id) === String(v.affectation_id));
  const enregistrer = () => f.soumettre(async (x) => {
    const r = creneau ? await api.put(`/plannings/${creneau.id}`, x) : await api.post('/plannings', x);
    notifier(creneau ? 'Créneau modifié' : 'Créneau programmé');
    onEnregistre(r);
  }).catch(() => {});

  return (
    <Modale titre={creneau ? 'Modifier le créneau' : 'Programmer une intervention'} onFermer={onFermer} pied={<>
      <button className="bouton bouton-secondaire" onClick={onFermer}>Annuler</button>
      <button className="bouton bouton-principal" disabled={f.encours} onClick={enregistrer}>Enregistrer</button>
    </>}>
      <AlerteErreur erreur={f.erreur} />
      <Champ libelle="Affectation (enseignant · domicile · matière)" obligatoire erreur={f.erreurChamp('affectation_id')}>
        <select className="saisie" value={v.affectation_id} onChange={f.maj('affectation_id')}>
          <option value="">— Sélectionner —</option>
          {(affectations || []).filter((a) => a.actif).map((a) => <option key={a.id} value={a.id}>{a.enseignant} · {a.domicile_code} ({a.parent}) · {a.matiere}</option>)}
        </select>
      </Champ>
      {aff && <p className="texte-petit texte-secondaire" style={{ marginTop: -8 }}>Marché : {aff.marche} · affectation valable du {date(aff.date_debut)} {aff.date_fin ? `au ${date(aff.date_fin)}` : 'sans date de fin'}</p>}
      <div className="ligne-champs">
        <Champ libelle="Fréquence" obligatoire>
          <select className="saisie" value={v.frequence} onChange={f.maj('frequence')}>
            {Object.entries(FREQUENCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Champ>
        {v.frequence !== 'ponctuelle' && (
          <Champ libelle="Jour" obligatoire erreur={f.erreurChamp('jour_semaine')}>
            <select className="saisie" value={v.jour_semaine} onChange={f.maj('jour_semaine')}>
              {JOURS.slice(1).map((j, i) => <option key={j} value={i + 1}>{j}</option>)}
            </select>
          </Champ>
        )}
        <Champ libelle="Heure de début" obligatoire erreur={f.erreurChamp('heure_debut')}><input className="saisie" type="time" value={v.heure_debut} onChange={f.maj('heure_debut')} /></Champ>
        <Champ libelle="Heure de fin" obligatoire erreur={f.erreurChamp('heure_fin')}><input className="saisie" type="time" value={v.heure_fin} onChange={f.maj('heure_fin')} /></Champ>
        <Champ libelle={v.frequence === 'ponctuelle' ? 'Date de la séance' : 'Début de validité'} obligatoire erreur={f.erreurChamp('date_debut')}>
          <input className="saisie" type="date" value={v.date_debut} onChange={f.maj('date_debut')} />
        </Champ>
        {v.frequence !== 'ponctuelle' && (
          <Champ libelle="Fin de validité" aide="Vide = jusqu'à la fin de l'affectation" erreur={f.erreurChamp('date_fin')}>
            <input className="saisie" type="date" value={v.date_fin} onChange={f.maj('date_fin')} />
          </Champ>
        )}
      </div>
    </Modale>
  );
}

function lundiDe(iso) {
  const j = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return decalerJours(iso, j === 0 ? -6 : 1 - j);
}

function Calendrier({ filtres }) {
  const [lundi, setLundi] = useState(lundiDe(aujourdhui()));
  const dimanche = decalerJours(lundi, 6);
  const { donnees, erreur } = useDonnees(`/plannings/calendrier${chaineRequete({ ...filtres, debut: lundi, fin: dimanche })}`);
  const jours = Array.from({ length: 7 }, (_, i) => decalerJours(lundi, i));
  const ajd = aujourdhui();
  return (
    <>
      <div className="filtres" style={{ justifyContent: 'space-between' }}>
        <div className="actions">
          <button className="bouton bouton-secondaire bouton-petit" onClick={() => setLundi(decalerJours(lundi, -7))}><ChevronLeft size={15} /> Semaine précédente</button>
          <button className="bouton bouton-secondaire bouton-petit" onClick={() => setLundi(lundiDe(ajd))}>Cette semaine</button>
          <button className="bouton bouton-secondaire bouton-petit" onClick={() => setLundi(decalerJours(lundi, 7))}>Semaine suivante <ChevronRight size={15} /></button>
        </div>
        <strong>Du {date(lundi)} au {date(dimanche)}</strong>
      </div>
      <AlerteErreur erreur={erreur} />
      {!donnees ? <Chargement /> : (
        <div className="calendrier">
          {jours.map((j, i) => (
            <div key={j} className={`cal-jour ${j === ajd ? 'aujourdhui' : ''}`}>
              <div className="cal-jour-entete"><strong>{JOURS[i + 1]}</strong><span>{date(j)}</span></div>
              {donnees.filter((e) => e.date === j).map((e) => (
                <div key={`${e.creneau_id}-${e.date}`} className={`cal-evt ${e.statut}`} title={`${e.enseignant} — ${e.parent}`}>
                  <div className="h">{e.heure_debut} – {e.heure_fin}</div>
                  <div>{e.enseignant}</div>
                  <div className="texte-secondaire">{e.domicile_code} · {e.matiere}</div>
                  {e.statut !== 'prevue' && <div className="texte-petit">{STATUTS_SEANCE[e.statut]?.libelle}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function Plannings() {
  const { peut } = useAuth();
  const notifier = useNotifier();
  const [params, setParams] = useSearchParams();
  const refs = useReferentiels('enseignants', 'marches', 'domiciles');
  const [vue, setVue] = useState(params.get('vue') || 'liste');
  const filtres = { enseignant_id: params.get('enseignant_id') || '', marche_id: params.get('marche_id') || '', domicile_id: params.get('domicile_id') || '' };
  const { donnees, erreur, recharger } = useDonnees(vue === 'liste' ? `/plannings${chaineRequete(filtres)}` : null);
  const [form, setForm] = useState(null);
  const [suppr, setSuppr] = useState(null);
  const changer = (k) => (e) => { const p = new URLSearchParams(params); p.set(k, e.target.value); setParams(p); };
  useEffect(() => { const p = new URLSearchParams(params); p.set('vue', vue); setParams(p, { replace: true }); }, [vue]); // eslint-disable-line
  const gerer = peut('plannings.gerer');

  return (
    <>
      <EntetePage titre="Emplois du temps" description="Interventions programmées. Les chevauchements et les trajets impossibles sont refusés automatiquement.">
        {gerer && <button className="bouton bouton-principal" onClick={() => setForm({})}><Plus size={16} /> Programmer une intervention</button>}
      </EntetePage>
      <Onglets actif={vue} onChange={setVue} onglets={[['liste', <><List size={14} /> Vue liste</>], ['calendrier', <><CalendarDays size={14} /> Vue calendrier</>]]} />
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
        </div>
        {vue === 'calendrier' ? <Calendrier filtres={filtres} /> : (
          <>
            <AlerteErreur erreur={erreur} />
            <Tableau lignes={donnees} vide="Aucune intervention programmée" colonnes={[
              { cle: 'jour', titre: 'Jour', rendu: (c) => <strong>{c.frequence === 'ponctuelle' ? date(c.date_debut) : JOURS[c.jour_semaine]}</strong> },
              { cle: 'heures', titre: 'Horaire', rendu: (c) => `${c.heure_debut} – ${c.heure_fin}` },
              { cle: 'enseignant', titre: 'Enseignant' },
              { cle: 'parent', titre: 'Parent' },
              { cle: 'domicile_code', titre: 'Domicile', rendu: (c) => <>{c.domicile_code}<div className="secondaire">{c.commune}</div></> },
              { cle: 'marche', titre: 'Marché' },
              { cle: 'matiere', titre: 'Matière' },
              { cle: 'frequence', titre: 'Fréquence', rendu: (c) => <Badge ton="bleu">{FREQUENCES[c.frequence]}</Badge> },
              { cle: 'validite', titre: 'Validité', rendu: (c) => `${date(c.date_debut)} → ${c.date_fin ? date(c.date_fin) : '…'}` },
              ...(gerer ? [{ cle: 'actions', titre: '', rendu: (c) => <div className="actions">
                <button className="bouton-icone" title="Modifier" onClick={() => setForm({ creneau: c })}><Pencil size={15} /></button>
                <button className="bouton-icone" title="Supprimer le créneau" onClick={() => setSuppr(c)}><Trash2 size={15} /></button>
              </div> }] : []),
            ]} />
          </>
        )}
      </Carte>
      {form && <FormulaireCreneau {...form} onFermer={() => setForm(null)} onEnregistre={() => { setForm(null); recharger(); }} />}
      {suppr && <Confirmation titre="Supprimer le créneau" danger libelle="Supprimer"
        message={`${JOURS[suppr.jour_semaine]} ${suppr.heure_debut}–${suppr.heure_fin} · ${suppr.enseignant} chez ${suppr.parent}. Les séances futures seront annulées ; l'historique est conservé.`}
        onFermer={() => setSuppr(null)}
        onConfirmer={async () => { notifier((await api.patch(`/plannings/${suppr.id}/statut`, { actif: false })).message); recharger(); }} />}
    </>
  );
}
