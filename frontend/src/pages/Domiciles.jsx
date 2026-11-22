import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, ArrowLeft, QrCode, RefreshCw, Ban, Printer, Download, MapPin, Crosshair, ExternalLink, Power } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDonnees, useReferentiels } from '../hooks.js';
import {
  Alerte, AlerteErreur, Badge, Carte, Champ, Chargement, Confirmation, EntetePage, Modale, Recherche, Tableau, useFormulaire, useNotifier,
} from '../composants/ui.jsx';
import { date, dateHeure, telephone } from '../format.js';

function FormulaireDomicile({ domicile, onFermer, onEnregistre }) {
  const notifier = useNotifier();
  const refs = useReferentiels('marches', 'parents');
  const [modeParent, setModeParent] = useState(domicile ? 'existant' : 'nouveau');
  const [localisation, setLocalisation] = useState('');
  const f = useFormulaire({
    code: domicile?.code || '', parent_id: domicile?.parent_id || '', marche_id: domicile?.marche_id || '',
    commune: domicile?.commune || '', quartier: domicile?.quartier || '', adresse: domicile?.adresse || '',
    latitude: domicile?.latitude ?? '', longitude: domicile?.longitude ?? '', rayon_tolerance_m: domicile?.rayon_tolerance_m ?? '',
    p_nom: '', p_prenoms: '', p_telephone: '', p_email: '',
  });
  const v = f.valeurs;

  const capturer = () => {
    if (!navigator.geolocation) return setLocalisation("La géolocalisation n'est pas disponible sur cet appareil.");
    setLocalisation('Localisation en cours…');
    navigator.geolocation.getCurrentPosition((p) => {
      f.setValeurs((x) => ({ ...x, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }));
      setLocalisation(`Position relevée (précision ± ${Math.round(p.coords.accuracy)} m). À faire de préférence sur place, au domicile.`);
    }, (e) => setLocalisation(e.code === 1 ? 'Accès à la position refusé.' : 'Position indisponible.'), { enableHighAccuracy: true, timeout: 20000 });
  };

  const enregistrer = () => f.soumettre(async (x) => {
    const corps = {
      code: x.code, marche_id: x.marche_id, commune: x.commune, quartier: x.quartier, adresse: x.adresse,
      latitude: x.latitude, longitude: x.longitude, rayon_tolerance_m: x.rayon_tolerance_m,
      ...(modeParent === 'existant' ? { parent_id: x.parent_id || null } : { parent: { nom: x.p_nom, prenoms: x.p_prenoms, telephone: x.p_telephone, email: x.p_email } }),
    };
    const r = domicile ? await api.put(`/domiciles/${domicile.id}`, corps) : await api.post('/domiciles', corps);
    notifier(domicile ? 'Domicile modifié' : 'Domicile enregistré');
    onEnregistre(r);
  }).catch(() => {});

  return (
    <Modale titre={domicile ? 'Modifier le domicile' : 'Nouveau domicile'} onFermer={onFermer} large pied={<>
      <button className="bouton bouton-secondaire" onClick={onFermer}>Annuler</button>
      <button className="bouton bouton-principal" disabled={f.encours} onClick={enregistrer}>Enregistrer</button>
    </>}>
      <AlerteErreur erreur={f.erreur} />
      <div className="sous-titre-form">Parent</div>
      <div className="actions mb">
        <label><input type="radio" checked={modeParent === 'existant'} onChange={() => setModeParent('existant')} /> Parent déjà enregistré</label>
        <label><input type="radio" checked={modeParent === 'nouveau'} onChange={() => setModeParent('nouveau')} /> Nouveau parent</label>
      </div>
      {modeParent === 'existant' ? (
        <Champ libelle="Parent" obligatoire erreur={f.erreurChamp('parent_id')}>
          <select className="saisie" value={v.parent_id} onChange={f.maj('parent_id')}>
            <option value="">— Sélectionner —</option>
            {(refs.parents || []).map((p) => <option key={p.id} value={p.id}>{p.nom} {p.prenoms} · {telephone(p.telephone)}</option>)}
          </select>
        </Champ>
      ) : (
        <div className="ligne-champs">
          <Champ libelle="Nom du parent" obligatoire erreur={f.erreurChamp('parent.nom')}><input className="saisie" value={v.p_nom} onChange={f.maj('p_nom')} /></Champ>
          <Champ libelle="Prénoms du parent" obligatoire erreur={f.erreurChamp('parent.prenoms')}><input className="saisie" value={v.p_prenoms} onChange={f.maj('p_prenoms')} /></Champ>
          <Champ libelle="Téléphone du parent" obligatoire erreur={f.erreurChamp('parent.telephone')}><input className="saisie" type="tel" value={v.p_telephone} onChange={f.maj('p_telephone')} placeholder="05 00 00 00 00" /></Champ>
          <Champ libelle="E-mail du parent (facultatif)" erreur={f.erreurChamp('parent.email')}><input className="saisie" type="email" value={v.p_email} onChange={f.maj('p_email')} /></Champ>
        </div>
      )}
      <hr className="separateur" />
      <div className="sous-titre-form">Domicile</div>
      <div className="ligne-champs">
        <Champ libelle="Marché" obligatoire erreur={f.erreurChamp('marche_id')}>
          <select className="saisie" value={v.marche_id} onChange={f.maj('marche_id')}>
            <option value="">— Sélectionner —</option>
            {(refs.marches || []).filter((m) => m.actif || m.id === v.marche_id).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        </Champ>
        <Champ libelle="Code du domicile" aide="Laissez vide pour une génération automatique (DOM-0001…)" erreur={f.erreurChamp('code')}>
          <input className="saisie" value={v.code} onChange={f.maj('code')} />
        </Champ>
        <Champ libelle="Commune" obligatoire erreur={f.erreurChamp('commune')}><input className="saisie" value={v.commune} onChange={f.maj('commune')} placeholder="Ex. : Cocody" /></Champ>
        <Champ libelle="Quartier"><input className="saisie" value={v.quartier} onChange={f.maj('quartier')} placeholder="Ex. : Riviera 3" /></Champ>
      </div>
      <Champ libelle="Adresse et repères" obligatoire erreur={f.erreurChamp('adresse')}><textarea className="saisie" value={v.adresse} onChange={f.maj('adresse')} maxLength={300} /></Champ>
      <div className="sous-titre-form">Coordonnées GPS</div>
      <div className="ligne-champs-3">
        <Champ libelle="Latitude" erreur={f.erreurChamp('latitude')}><input className="saisie" inputMode="decimal" value={v.latitude} onChange={f.maj('latitude')} placeholder="5.360000" /></Champ>
        <Champ libelle="Longitude" erreur={f.erreurChamp('longitude')}><input className="saisie" inputMode="decimal" value={v.longitude} onChange={f.maj('longitude')} placeholder="-3.980000" /></Champ>
        <Champ libelle="Rayon de tolérance (m)" aide="Vide = paramètre général" erreur={f.erreurChamp('rayon_tolerance_m')}><input className="saisie" inputMode="numeric" value={v.rayon_tolerance_m} onChange={f.maj('rayon_tolerance_m')} /></Champ>
      </div>
      <div className="actions">
        <button type="button" className="bouton bouton-secondaire bouton-petit" onClick={capturer}><Crosshair size={14} /> Utiliser ma position actuelle</button>
        {v.latitude && v.longitude && <a className="bouton bouton-fantome bouton-petit" href={`https://www.openstreetmap.org/?mlat=${v.latitude}&mlon=${v.longitude}#map=18/${v.latitude}/${v.longitude}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Vérifier sur la carte</a>}
      </div>
      {localisation && <p className="texte-petit texte-secondaire">{localisation}</p>}
      {!v.latitude && <Alerte type="attention">Sans coordonnées GPS, la position des enseignants ne pourra pas être vérifiée pour ce domicile.</Alerte>}
    </Modale>
  );
}

export default function Domiciles() {
  const { peut } = useAuth();
  const navigate = useNavigate();
  const refs = useReferentiels('marches');
  const [q, setQ] = useState('');
  const [marche, setMarche] = useState('');
  const [statut, setStatut] = useState('1');
  const { donnees, erreur } = useDonnees(`/domiciles?actif=${statut}&marche_id=${marche}`);
  const [form, setForm] = useState(false);
  const lignes = useMemo(() => {
    if (!donnees) return null;
    const t = q.toLowerCase();
    return donnees.filter((d) => !t || `${d.code} ${d.parent_nom} ${d.parent_prenoms} ${d.commune} ${d.quartier || ''} ${d.parent_telephone}`.toLowerCase().includes(t));
  }, [donnees, q]);

  return (
    <>
      <EntetePage titre="Parents et domiciles" description="Lieux d'intervention et QR Codes de pointage.">
        {peut('domiciles.gerer') && <button className="bouton bouton-principal" onClick={() => setForm(true)}><Plus size={16} /> Enregistrer un domicile</button>}
      </EntetePage>
      <AlerteErreur erreur={erreur} />
      <Carte corps={false}>
        <div className="filtres">
          <div className="champ" style={{ flex: 1, minWidth: 220 }}><label>Recherche</label><Recherche valeur={q} onChange={setQ} placeholder="Code, parent, commune, téléphone…" /></div>
          <div className="champ"><label>Marché</label>
            <select className="saisie" value={marche} onChange={(e) => setMarche(e.target.value)}>
              <option value="">Tous</option>
              {(refs.marches || []).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>
          <div className="champ"><label>Statut</label>
            <select className="saisie" value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="1">Actifs</option><option value="0">Inactifs</option><option value="">Tous</option>
            </select>
          </div>
        </div>
        <Tableau lignes={lignes} onLigne={(d) => navigate(`/domiciles/${d.id}`)} vide="Aucun domicile" classeLigne={(d) => (d.actif ? '' : 'inactif')} colonnes={[
          { cle: 'code', titre: 'Code', rendu: (d) => <span className="code">{d.code}</span> },
          { cle: 'parent', titre: 'Parent', rendu: (d) => <><strong>{d.parent_nom} {d.parent_prenoms}</strong><div className="secondaire">{telephone(d.parent_telephone)}</div></> },
          { cle: 'marche', titre: 'Marché' },
          { cle: 'commune', titre: 'Localisation', rendu: (d) => <>{d.commune}{d.quartier && ` · ${d.quartier}`}<div className="secondaire">{d.latitude != null ? <><MapPin size={12} /> GPS renseigné</> : <span className="texte-orange">GPS manquant</span>}</div></> },
          { cle: 'nb_affectations', titre: 'Affectations', num: true },
          { cle: 'qr', titre: 'QR Code', rendu: (d) => (d.qr_statut === 'actif' ? <Badge ton="vert">Actif</Badge> : d.qr_statut === 'revoque' ? <Badge ton="rouge">Révoqué</Badge> : <Badge>Non généré</Badge>) },
        ]} />
      </Carte>
      {form && <FormulaireDomicile onFermer={() => setForm(false)} onEnregistre={(d) => navigate(`/domiciles/${d.id}`)} />}
    </>
  );
}

function BlocQr({ domicile, onChange }) {
  const notifier = useNotifier();
  const actif = domicile.qr_statut === 'actif';
  const { donnees: qr, setDonnees } = useDonnees(actif ? `/domiciles/${domicile.id}/qrcode?v=${domicile.qr_codes[0]?.id}` : null);
  const [action, setAction] = useState(null);
  useEffect(() => { if (!actif) setDonnees(null); }, [actif, setDonnees]);

  const generer = async (motif) => {
    const r = await api.post(`/domiciles/${domicile.id}/qrcode`, { motif });
    notifier(r.message);
    onChange();
  };
  const revoquer = async (motif) => {
    const r = await api.post(`/domiciles/${domicile.id}/qrcode/revoquer`, { motif });
    notifier(r.message);
    onChange();
  };

  return (
    <Carte titre="QR Code de pointage" actions={actif ? <Badge ton="vert">Actif</Badge> : <Badge ton="rouge">Aucun QR Code actif</Badge>}>
      {actif ? (qr ? (
        <div style={{ textAlign: 'center' }}>
          <img src={qr.image} alt={`QR Code du domicile ${qr.domicile_code}`} style={{ width: 220, height: 220 }} />
          <p className="texte-petit texte-secondaire">Généré le {dateHeure(qr.cree_le)}. Le QR Code ne contient qu'un jeton opaque, aucune donnée du parent.</p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <Link className="bouton bouton-principal" to={`/domiciles/${domicile.id}/impression`} target="_blank"><Printer size={15} /> Imprimer</Link>
            <a className="bouton bouton-secondaire" href={qr.image} download={`QR_${qr.domicile_code}.png`}><Download size={15} /> Télécharger</a>
            <button className="bouton bouton-secondaire" onClick={() => setAction('renouveler')}><RefreshCw size={15} /> Renouveler</button>
            <button className="bouton bouton-secondaire" onClick={() => setAction('revoquer')}><Ban size={15} /> Révoquer</button>
          </div>
        </div>
      ) : <Chargement />) : (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <QrCode size={40} color="#94A3B8" />
          <p className="texte-secondaire">{domicile.actif ? 'Générez le QR Code puis imprimez-le pour le placer au domicile.' : 'Domicile désactivé.'}</p>
          {domicile.actif && <button className="bouton bouton-principal" onClick={() => generer('')}><QrCode size={15} /> Générer le QR Code</button>}
        </div>
      )}
      {action === 'renouveler' && <Confirmation titre="Renouveler le QR Code" avecMotif libelleMotif="Motif du renouvellement"
        message="L'ancien QR Code deviendra immédiatement invalide. Il faudra imprimer et placer le nouveau au domicile."
        libelle="Renouveler" onConfirmer={generer} onFermer={() => setAction(null)} />}
      {action === 'revoquer' && <Confirmation titre="Révoquer le QR Code" avecMotif libelleMotif="Motif de la révocation" danger
        message="Plus aucun pointage ne sera possible avec ce QR Code. Les tentatives seront signalées comme anomalies."
        libelle="Révoquer" onConfirmer={revoquer} onFermer={() => setAction(null)} />}
    </Carte>
  );
}

export function FicheDomicile() {
  const { id } = useParams();
  const { peut } = useAuth();
  const notifier = useNotifier();
  const { donnees: d, erreur, recharger } = useDonnees(`/domiciles/${id}`);
  const [modif, setModif] = useState(false);
  const [statut, setStatut] = useState(false);
  if (erreur) return <AlerteErreur erreur={erreur} />;
  if (!d) return <Chargement />;

  return (
    <>
      <p><Link to="/domiciles"><ArrowLeft size={14} /> Parents et domiciles</Link></p>
      <EntetePage titre={`Domicile ${d.code}`} description={`${d.parent_nom} ${d.parent_prenoms} · ${d.marche}`}>
        <Badge ton={d.actif ? 'vert' : 'neutre'}>{d.actif ? 'Actif' : 'Inactif'}</Badge>
        {peut('domiciles.gerer') && <>
          <button className="bouton bouton-secondaire" onClick={() => setModif(true)}><Pencil size={15} /> Modifier</button>
          <button className="bouton bouton-secondaire" onClick={() => setStatut(true)}><Power size={15} /> {d.actif ? 'Désactiver' : 'Activer'}</button>
        </>}
      </EntetePage>
      <div className="grille grille-2">
        <Carte titre="Informations">
          <dl className="liste-def">
            <dt>Parent</dt><dd>{d.parent_nom} {d.parent_prenoms}</dd>
            <dt>Téléphone du parent</dt><dd>{telephone(d.parent_telephone)}</dd>
            {d.parent_email && <><dt>E-mail du parent</dt><dd>{d.parent_email}</dd></>}
            <dt>Marché</dt><dd><Link to={`/marches/${d.marche_id}`}>{d.marche}</Link></dd>
            <dt>Commune / quartier</dt><dd>{d.commune}{d.quartier && ` · ${d.quartier}`}</dd>
            <dt>Adresse</dt><dd>{d.adresse}</dd>
            <dt>Coordonnées GPS</dt>
            <dd>{d.latitude != null ? <a href={`https://www.openstreetmap.org/?mlat=${d.latitude}&mlon=${d.longitude}#map=18/${d.latitude}/${d.longitude}`} target="_blank" rel="noreferrer">{d.latitude}, {d.longitude} <ExternalLink size={12} /></a> : <span className="texte-orange">Non renseignées</span>}</dd>
            <dt>Rayon de tolérance</dt><dd>{d.rayon_tolerance_m ? `${d.rayon_tolerance_m} m` : 'Paramètre général'}</dd>
          </dl>
        </Carte>
        {peut('qrcodes.gerer') ? <BlocQr domicile={d} onChange={recharger} /> : (
          <Carte titre="QR Code de pointage"><p>Statut : {d.qr_statut === 'actif' ? <Badge ton="vert">Actif</Badge> : <Badge ton="rouge">Aucun QR Code actif</Badge>}</p></Carte>
        )}
      </div>
      <div className="grille grille-2 mt">
        <Carte titre="Enseignants affectés" corps={false}>
          <Tableau compact lignes={d.affectations} vide="Aucune affectation" colonnes={[
            { cle: 'enseignant', titre: 'Enseignant', rendu: (a) => <Link to={`/enseignants/${a.enseignant_id}`}>{a.enseignant}</Link> },
            { cle: 'matiere', titre: 'Matière' },
            { cle: 'periode', titre: 'Période', rendu: (a) => `${date(a.date_debut)} → ${a.date_fin ? date(a.date_fin) : '…'}` },
            { cle: 'actif', titre: '', rendu: (a) => !a.actif && <Badge>Inactive</Badge> },
          ]} />
        </Carte>
        <Carte titre="Historique des QR Codes" corps={false}>
          <Tableau compact lignes={d.qr_codes} vide="Aucun QR Code généré" colonnes={[
            { cle: 'id', titre: 'N°', rendu: (q) => `#${q.id}` },
            { cle: 'cree_le', titre: 'Généré', rendu: (q) => <>{dateHeure(q.cree_le)}<div className="secondaire">par {q.cree_par}</div></> },
            { cle: 'statut', titre: 'Statut', rendu: (q) => (q.statut === 'actif' ? <Badge ton="vert">Actif</Badge> : <><Badge ton="rouge">Révoqué</Badge><div className="secondaire">{dateHeure(q.revoque_le)} · {q.motif_revocation}</div></>) },
          ]} />
        </Carte>
      </div>
      {modif && <FormulaireDomicile domicile={d} onFermer={() => setModif(false)} onEnregistre={() => { setModif(false); recharger(); }} />}
      {statut && <Confirmation titre={d.actif ? 'Désactiver le domicile' : 'Activer le domicile'}
        message={d.actif ? 'Les séances futures seront annulées et le QR Code ne permettra plus de pointer. L\'historique est conservé.' : 'Les créneaux actifs seront de nouveau programmés.'}
        libelle={d.actif ? 'Désactiver' : 'Activer'} danger={!!d.actif} onFermer={() => setStatut(false)}
        onConfirmer={async () => { notifier((await api.patch(`/domiciles/${d.id}/statut`, { actif: !d.actif })).message); recharger(); }} />}
    </>
  );
}

export function ImpressionQr() {
  const { id } = useParams();
  const { donnees: qr, erreur } = useDonnees(`/domiciles/${id}/qrcode`);
  if (erreur) return <div className="page"><AlerteErreur erreur={erreur} /></div>;
  if (!qr) return <Chargement />;
  return (
    <div className="page">
      <div className="actions pas-imprimer" style={{ justifyContent: 'center' }}>
        <button className="bouton bouton-principal" onClick={() => window.print()}><Printer size={15} /> Imprimer</button>
      </div>
      <div className="fiche-qr">
        <img className="fiche-qr-logo" src={`${import.meta.env.BASE_URL}logo-komenan-complet.png`} alt="KOMENAN FORMATION" />
        <h1>Pointage des cours</h1>
        <p className="texte-secondaire">Domicile <strong>{qr.domicile_code}</strong> · {qr.marche}</p>
        <img src={qr.image} alt="QR Code de pointage" />
        <div className="consignes">
          <strong>Enseignant :</strong>
          <ol>
            <li>À votre arrivée, scannez ce code avec l'appareil photo de votre téléphone.</li>
            <li>Saisissez votre numéro de téléphone et votre nom, puis autorisez la localisation.</li>
            <li>À la fin du cours, scannez à nouveau ce code pour enregistrer votre départ.</li>
          </ol>
          <p>Ne photographiez pas et ne diffusez pas ce code. Toute utilisation hors du domicile est détectée et signalée.</p>
        </div>
        <p className="texte-petit texte-secondaire">Code n° {qr.id} — émis le {date(qr.cree_le)}</p>
      </div>
    </div>
  );
}
