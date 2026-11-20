import { useState } from 'react';
import { Plus, Pencil, Power, KeyRound } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDonnees } from '../hooks.js';
import { Alerte, AlerteErreur, Badge, Carte, Champ, Confirmation, EntetePage, Modale, Onglets, Tableau, useFormulaire, useNotifier } from '../composants/ui.jsx';
import { dateHeure } from '../format.js';

function FormulaireUtilisateur({ compte, onFermer, onEnregistre }) {
  const notifier = useNotifier();
  const f = useFormulaire({ nom: compte?.nom || '', prenoms: compte?.prenoms || '', email: compte?.email || '', role: compte?.role || 'superviseur', mot_de_passe: '' });
  const enregistrer = () => f.soumettre(async (v) => {
    if (compte) await api.put(`/utilisateurs/${compte.id}`, v); else await api.post('/utilisateurs', v);
    notifier(compte ? 'Compte modifié' : 'Compte créé');
    onEnregistre();
  }).catch(() => {});
  return (
    <Modale titre={compte ? 'Modifier le compte' : 'Nouveau compte administratif'} onFermer={onFermer} pied={<>
      <button className="bouton bouton-secondaire" onClick={onFermer}>Annuler</button>
      <button className="bouton bouton-principal" disabled={f.encours} onClick={enregistrer}>Enregistrer</button>
    </>}>
      <AlerteErreur erreur={f.erreur} />
      <div className="ligne-champs">
        <Champ libelle="Nom" obligatoire erreur={f.erreurChamp('nom')}><input className="saisie" value={f.valeurs.nom} onChange={f.maj('nom')} /></Champ>
        <Champ libelle="Prénoms" obligatoire erreur={f.erreurChamp('prenoms')}><input className="saisie" value={f.valeurs.prenoms} onChange={f.maj('prenoms')} /></Champ>
      </div>
      <Champ libelle="Adresse e-mail" obligatoire erreur={f.erreurChamp('email')}><input className="saisie" type="email" value={f.valeurs.email} onChange={f.maj('email')} /></Champ>
      <Champ libelle="Rôle" obligatoire>
        <select className="saisie" value={f.valeurs.role} onChange={f.maj('role')}>
          <option value="superviseur">Superviseur (droits opérationnels limités)</option>
          <option value="admin">Administrateur (tous les droits)</option>
        </select>
      </Champ>
      {!compte && <Champ libelle="Mot de passe initial" obligatoire aide="10 caractères minimum, avec lettres et chiffres. À communiquer de façon sécurisée." erreur={f.erreurChamp('mot_de_passe')}>
        <input className="saisie" type="password" autoComplete="new-password" value={f.valeurs.mot_de_passe} onChange={f.maj('mot_de_passe')} />
      </Champ>}
    </Modale>
  );
}

function NouveauMotDePasse({ compte, onFermer }) {
  const notifier = useNotifier();
  const f = useFormulaire({ mot_de_passe: '' });
  const enregistrer = () => f.soumettre(async (v) => {
    notifier((await api.post(`/utilisateurs/${compte.id}/mot-de-passe`, v)).message);
    onFermer();
  }).catch(() => {});
  return (
    <Modale titre={`Réinitialiser le mot de passe de ${compte.prenoms} ${compte.nom}`} onFermer={onFermer} pied={<>
      <button className="bouton bouton-secondaire" onClick={onFermer}>Annuler</button>
      <button className="bouton bouton-principal" disabled={f.encours} onClick={enregistrer}>Enregistrer</button>
    </>}>
      <AlerteErreur erreur={f.erreur} />
      <Champ libelle="Nouveau mot de passe" erreur={f.erreurChamp('mot_de_passe')} aide="10 caractères minimum, avec lettres et chiffres">
        <input className="saisie" type="password" autoComplete="new-password" value={f.valeurs.mot_de_passe} onChange={f.maj('mot_de_passe')} />
      </Champ>
    </Modale>
  );
}

function Permissions() {
  const notifier = useNotifier();
  const { donnees, erreur, setDonnees } = useDonnees('/utilisateurs/permissions');
  const [enregistrement, setEnregistrement] = useState(false);
  const basculer = (cle) => setDonnees(donnees.map((p) => (p.cle === cle ? { ...p, superviseur: !p.superviseur } : p)));
  const enregistrer = async () => {
    setEnregistrement(true);
    try { notifier((await api.put('/utilisateurs/permissions/superviseur', { permissions: donnees.filter((p) => p.superviseur).map((p) => p.cle) })).message); }
    catch (e) { notifier(e.message, 'erreur'); }
    setEnregistrement(false);
  };
  return (
    <Carte corps={false} titre="Permissions par rôle" actions={<button className="bouton bouton-principal bouton-petit" disabled={enregistrement || !donnees} onClick={enregistrer}>Enregistrer</button>}>
      <AlerteErreur erreur={erreur} />
      <div className="carte-corps" style={{ paddingBottom: 0 }}>
        <Alerte type="info">L'administrateur dispose toujours de tous les droits. Les droits de modification des référentiels, des affectations, des plannings, des QR Codes et des comptes sont réservés à l'administrateur.</Alerte>
      </div>
      <Tableau lignes={donnees} cle="cle" colonnes={[
        { cle: 'libelle', titre: 'Permission' },
        { cle: 'admin', titre: 'Administrateur', rendu: () => <input type="checkbox" checked disabled aria-label="Administrateur" /> },
        { cle: 'superviseur', titre: 'Superviseur', rendu: (p) => (p.reservee_admin
          ? <span className="texte-petit texte-secondaire">Réservée à l'administrateur</span>
          : <input type="checkbox" checked={p.superviseur} onChange={() => basculer(p.cle)} aria-label={`Superviseur : ${p.libelle}`} />) },
      ]} />
    </Carte>
  );
}

function Connexions() {
  const { donnees, erreur } = useDonnees('/utilisateurs/connexions');
  const MOTIFS = { identifiants_incorrects: 'Identifiants incorrects', compte_desactive: 'Compte désactivé', compte_temporairement_bloque: 'Trop de tentatives' };
  return (
    <Carte corps={false} titre="Historique des connexions (300 dernières)">
      <AlerteErreur erreur={erreur} />
      <Tableau lignes={donnees} compact vide="Aucune connexion" colonnes={[
        { cle: 'date_connexion', titre: 'Date', rendu: (c) => dateHeure(c.date_connexion) },
        { cle: 'compte', titre: 'Compte', rendu: (c) => (c.nom ? `${c.prenoms} ${c.nom}` : <span className="texte-secondaire">{c.email_saisi}</span>) },
        { cle: 'succes', titre: 'Résultat', rendu: (c) => (c.succes ? <Badge ton="vert">Réussie</Badge> : <Badge ton="rouge">Échec : {MOTIFS[c.motif] || c.motif}</Badge>) },
        { cle: 'ip', titre: 'Adresse IP' },
        { cle: 'user_agent', titre: 'Navigateur', rendu: (c) => <span className="texte-petit texte-secondaire">{(c.user_agent || '').slice(0, 70)}</span> },
      ]} />
    </Carte>
  );
}

export default function Utilisateurs() {
  const { utilisateur } = useAuth();
  const notifier = useNotifier();
  const [onglet, setOnglet] = useState('comptes');
  const { donnees, erreur, recharger } = useDonnees('/utilisateurs');
  const [form, setForm] = useState(null);
  const [statut, setStatut] = useState(null);
  const [mdp, setMdp] = useState(null);

  return (
    <>
      <EntetePage titre="Utilisateurs et rôles" description="Comptes administratifs, permissions et historique des connexions.">
        {onglet === 'comptes' && <button className="bouton bouton-principal" onClick={() => setForm({})}><Plus size={16} /> Créer un compte</button>}
      </EntetePage>
      <Onglets actif={onglet} onChange={setOnglet} onglets={[['comptes', 'Comptes'], ['permissions', 'Permissions'], ['connexions', 'Historique des connexions']]} />
      {onglet === 'comptes' && <Carte corps={false}>
        <AlerteErreur erreur={erreur} />
        <Tableau lignes={donnees} classeLigne={(u) => (u.actif ? '' : 'inactif')} colonnes={[
          { cle: 'nom', titre: 'Nom', rendu: (u) => <strong>{u.prenoms} {u.nom}</strong> },
          { cle: 'email', titre: 'E-mail' },
          { cle: 'role', titre: 'Rôle', rendu: (u) => <Badge ton={u.role === 'admin' ? 'marine' : 'bleu'}>{u.role === 'admin' ? 'Administrateur' : 'Superviseur'}</Badge> },
          { cle: 'derniere_connexion', titre: 'Dernière connexion', rendu: (u) => dateHeure(u.derniere_connexion) },
          { cle: 'actif', titre: 'Statut', rendu: (u) => <Badge ton={u.actif ? 'vert' : 'neutre'}>{u.actif ? 'Actif' : 'Désactivé'}</Badge> },
          { cle: 'actions', titre: '', rendu: (u) => <div className="actions">
            <button className="bouton-icone" title="Modifier" onClick={() => setForm({ compte: u })}><Pencil size={15} /></button>
            <button className="bouton-icone" title="Réinitialiser le mot de passe" onClick={() => setMdp(u)}><KeyRound size={15} /></button>
            {u.id !== utilisateur.id && <button className="bouton-icone" title={u.actif ? 'Désactiver' : 'Activer'} onClick={() => setStatut(u)}><Power size={15} /></button>}
          </div> },
        ]} />
      </Carte>}
      {onglet === 'permissions' && <Permissions />}
      {onglet === 'connexions' && <Connexions />}
      {form && <FormulaireUtilisateur {...form} onFermer={() => setForm(null)} onEnregistre={() => { setForm(null); recharger(); }} />}
      {mdp && <NouveauMotDePasse compte={mdp} onFermer={() => setMdp(null)} />}
      {statut && <Confirmation titre={statut.actif ? 'Désactiver le compte' : 'Activer le compte'} danger={!!statut.actif}
        message={statut.actif ? `${statut.prenoms} ${statut.nom} ne pourra plus se connecter. Son historique est conservé.` : `${statut.prenoms} ${statut.nom} pourra de nouveau se connecter.`}
        libelle={statut.actif ? 'Désactiver' : 'Activer'} onFermer={() => setStatut(null)}
        onConfirmer={async () => { notifier((await api.patch(`/utilisateurs/${statut.id}/statut`, { actif: !statut.actif })).message); recharger(); }} />}
    </>
  );
}
