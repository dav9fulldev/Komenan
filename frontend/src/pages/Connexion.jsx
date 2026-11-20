import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, QrCode, MapPin, ShieldCheck, Clock } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Alerte, Champ } from '../composants/ui.jsx';

function Cadre({ children }) {
  return (
    <div className="ecran-connexion">
      <div className="connexion-visuel">
        <div className="menu-marque" style={{ padding: 0 }}>
          <div className="logo"><GraduationCap size={20} /></div>
          <div><strong>Suivi des présences</strong><span>Cours à domicile</span></div>
        </div>
        <div>
          <h2>Des présences vérifiées pour chaque cours dispensé à domicile.</h2>
          <ul>
            <li><QrCode size={18} /> Pointage par QR Code propre à chaque domicile</li>
            <li><Clock size={18} /> Heure du serveur, retards et départs calculés automatiquement</li>
            <li><MapPin size={18} /> Contrôle de la position GPS au moment du pointage</li>
            <li><ShieldCheck size={18} /> Historique inaltérable et anomalies tracées</li>
          </ul>
        </div>
        <p style={{ fontSize: 12 }}>Abidjan, Côte d'Ivoire</p>
      </div>
      <div className="connexion-form"><div className="boite">{children}</div></div>
    </div>
  );
}

export default function Connexion() {
  const { connecter } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState('');
  const [encours, setEncours] = useState(false);

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur('');
    if (!email || !mdp) return setErreur('Saisissez votre adresse e-mail et votre mot de passe.');
    setEncours(true);
    try {
      await connecter(email, mdp);
      navigate('/', { replace: true });
    } catch (x) {
      setErreur(x.message);
      setEncours(false);
    }
  };

  return (
    <Cadre>
      <h1>Connexion</h1>
      <p className="texte-secondaire" style={{ marginTop: 0, marginBottom: 24 }}>Espace réservé à l'administration et aux superviseurs.</p>
      {erreur && <Alerte>{erreur}</Alerte>}
      <form onSubmit={soumettre} noValidate>
        <Champ libelle="Adresse e-mail" id="email">
          <input id="email" className="saisie" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Champ>
        <Champ libelle="Mot de passe" id="mdp">
          <input id="mdp" className="saisie" type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} />
        </Champ>
        <div style={{ textAlign: 'right', marginTop: -6, marginBottom: 18 }}>
          <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
        </div>
        <button className="bouton bouton-principal" disabled={encours}>{encours ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </Cadre>
  );
}

export function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [encours, setEncours] = useState(false);
  const soumettre = async (e) => {
    e.preventDefault();
    setErreur('');
    setEncours(true);
    try { setMessage((await api.post('/auth/mot-de-passe-oublie', { email })).message); } catch (x) { setErreur(x.message); }
    setEncours(false);
  };
  return (
    <Cadre>
      <h1>Mot de passe oublié</h1>
      <p className="texte-secondaire" style={{ marginTop: 0, marginBottom: 24 }}>Saisissez votre adresse e-mail : vous recevrez un lien pour définir un nouveau mot de passe.</p>
      {erreur && <Alerte>{erreur}</Alerte>}
      {message ? <Alerte type="succes">{message}</Alerte> : (
        <form onSubmit={soumettre} noValidate>
          <Champ libelle="Adresse e-mail" id="email">
            <input id="email" className="saisie" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Champ>
          <button className="bouton bouton-principal" disabled={encours || !email}>Envoyer le lien</button>
        </form>
      )}
      <p style={{ marginTop: 20 }}><Link to="/">← Retour à la connexion</Link></p>
    </Cadre>
  );
}

export function Reinitialisation() {
  const [params] = useSearchParams();
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const soumettre = async (e) => {
    e.preventDefault();
    setErreur('');
    if (mdp !== mdp2) return setErreur('Les deux mots de passe ne correspondent pas.');
    try {
      setMessage((await api.post('/auth/reinitialiser-mot-de-passe', { jeton: params.get('jeton') || '', mot_de_passe: mdp })).message);
    } catch (x) {
      setErreur(x.details?.mot_de_passe || x.message);
    }
  };
  return (
    <Cadre>
      <h1>Nouveau mot de passe</h1>
      <p className="texte-secondaire" style={{ marginTop: 0, marginBottom: 24 }}>Au moins 10 caractères, avec des lettres et des chiffres.</p>
      {erreur && <Alerte>{erreur}</Alerte>}
      {message ? <Alerte type="succes">{message}</Alerte> : (
        <form onSubmit={soumettre} noValidate>
          <Champ libelle="Nouveau mot de passe" id="m1"><input id="m1" className="saisie" type="password" autoComplete="new-password" value={mdp} onChange={(e) => setMdp(e.target.value)} /></Champ>
          <Champ libelle="Confirmer le mot de passe" id="m2"><input id="m2" className="saisie" type="password" autoComplete="new-password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} /></Champ>
          <button className="bouton bouton-principal" disabled={!mdp}>Enregistrer</button>
        </form>
      )}
      <p style={{ marginTop: 20 }}><Link to="/">← Retour à la connexion</Link></p>
    </Cadre>
  );
}
