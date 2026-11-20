import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Disposition from './composants/Disposition.jsx';
import { Chargement } from './composants/ui.jsx';
import Connexion, { MotDePasseOublie, Reinitialisation } from './pages/Connexion.jsx';
import TableauDeBord from './pages/TableauDeBord.jsx';
import Enseignants, { FicheEnseignant } from './pages/Enseignants.jsx';
import Marches, { FicheMarche } from './pages/Marches.jsx';
import Domiciles, { FicheDomicile, ImpressionQr } from './pages/Domiciles.jsx';
import Affectations from './pages/Affectations.jsx';
import Plannings from './pages/Plannings.jsx';
import Presences from './pages/Presences.jsx';
import Anomalies from './pages/Anomalies.jsx';
import Justifications from './pages/Justifications.jsx';
import Rapports from './pages/Rapports.jsx';
import Utilisateurs from './pages/Utilisateurs.jsx';
import Audit from './pages/Audit.jsx';
import Parametres from './pages/Parametres.jsx';

function Protegee({ permission, children }) {
  const { peut } = useAuth();
  if (!peut(permission)) {
    return <div className="carte carte-corps">Vous n'avez pas accès à cette page.</div>;
  }
  return children;
}

export default function App() {
  const { utilisateur } = useAuth();
  if (utilisateur === undefined) return <Chargement />;

  if (!utilisateur) {
    return (
      <Routes>
        <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
        <Route path="/reinitialiser-mot-de-passe" element={<Reinitialisation />} />
        <Route path="*" element={<Connexion />} />
      </Routes>
    );
  }

  const P = (permission, element) => <Protegee permission={permission}>{element}</Protegee>;
  return (
    <Routes>
      <Route path="/domiciles/:id/impression" element={P('qrcodes.gerer', <ImpressionQr />)} />
      <Route element={<Disposition />}>
        <Route index element={P('tableau_de_bord.voir', <TableauDeBord />)} />
        <Route path="enseignants" element={P('enseignants.voir', <Enseignants />)} />
        <Route path="enseignants/:id" element={P('enseignants.voir', <FicheEnseignant />)} />
        <Route path="marches" element={P('marches.voir', <Marches />)} />
        <Route path="marches/:id" element={P('marches.voir', <FicheMarche />)} />
        <Route path="domiciles" element={P('domiciles.voir', <Domiciles />)} />
        <Route path="domiciles/:id" element={P('domiciles.voir', <FicheDomicile />)} />
        <Route path="affectations" element={P('affectations.voir', <Affectations />)} />
        <Route path="plannings" element={P('plannings.voir', <Plannings />)} />
        <Route path="presences" element={P('presences.voir', <Presences />)} />
        <Route path="anomalies" element={P('anomalies.voir', <Anomalies />)} />
        <Route path="justifications" element={P('justifications.voir', <Justifications />)} />
        <Route path="rapports" element={P('rapports.voir', <Rapports />)} />
        <Route path="utilisateurs" element={P('utilisateurs.gerer', <Utilisateurs />)} />
        <Route path="audit" element={P('audit.voir', <Audit />)} />
        <Route path="parametres" element={P('parametres.gerer', <Parametres />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
