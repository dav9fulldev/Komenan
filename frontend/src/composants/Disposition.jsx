import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Store, Home, Link2, CalendarDays, ClipboardCheck, AlertTriangle, FileText, BarChart3,
  UserCog, ScrollText, Settings, LogOut, Menu as IconeMenu, GraduationCap,
} from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { useDonnees } from '../hooks.js';

const MENU = [
  ['Pilotage', [
    ['/', 'Tableau de bord', LayoutDashboard, 'tableau_de_bord.voir'],
  ]],
  ['Référentiels', [
    ['/enseignants', 'Enseignants', Users, 'enseignants.voir'],
    ['/marches', 'Marchés', Store, 'marches.voir'],
    ['/domiciles', 'Parents et domiciles', Home, 'domiciles.voir'],
    ['/affectations', 'Affectations', Link2, 'affectations.voir'],
    ['/plannings', 'Emplois du temps', CalendarDays, 'plannings.voir'],
  ]],
  ['Suivi', [
    ['/presences', 'Suivi des présences', ClipboardCheck, 'presences.voir'],
    ['/anomalies', 'Anomalies', AlertTriangle, 'anomalies.voir', 'anomalies'],
    ['/justifications', 'Justifications', FileText, 'justifications.voir', 'justifications'],
    ['/rapports', 'Rapports', BarChart3, 'rapports.voir'],
  ]],
  ['Administration', [
    ['/utilisateurs', 'Utilisateurs et rôles', UserCog, 'utilisateurs.gerer'],
    ['/audit', "Journal d'audit", ScrollText, 'audit.voir'],
    ['/parametres', 'Paramètres', Settings, 'parametres.gerer'],
  ]],
];

export default function Disposition() {
  const { utilisateur, deconnecter, peut } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const { pathname } = useLocation();
  // Compteurs rafraîchis à chaque changement de page
  const { donnees: tdb } = useDonnees(peut('tableau_de_bord.voir') ? `/tableau-de-bord?_=${pathname}` : null);
  const compteurs = { anomalies: tdb?.indicateurs?.anomalies_a_examiner, justifications: tdb?.indicateurs?.justifications_en_attente };

  return (
    <div className="app">
      <aside className={`menu ${ouvert ? 'ouvert' : ''}`}>
        <div className="menu-marque">
          <div className="logo"><GraduationCap size={20} /></div>
          <div><strong>Suivi des présences</strong><span>Cours à domicile</span></div>
        </div>
        <nav onClick={() => setOuvert(false)}>
          {MENU.map(([section, liens]) => {
            const visibles = liens.filter((l) => peut(l[3]));
            if (!visibles.length) return null;
            return (
              <div key={section}>
                <div className="menu-section">{section}</div>
                {visibles.map(([to, libelle, Icone, , compteur]) => (
                  <NavLink key={to} to={to} end={to === '/'}>
                    <Icone size={17} /> {libelle}
                    {compteur && compteurs[compteur] > 0 && <span className="compteur">{compteurs[compteur]}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="menu-pied">
          <div className="nom">{utilisateur.prenoms} {utilisateur.nom}</div>
          <div>{utilisateur.role === 'admin' ? 'Administrateur' : 'Superviseur'}</div>
          <button onClick={deconnecter}><LogOut size={15} /> Se déconnecter</button>
        </div>
      </aside>
      <div className="contenu">
        <div className="barre-haut">
          <button onClick={() => setOuvert(!ouvert)} aria-label="Ouvrir le menu"><IconeMenu size={22} /></button>
          <strong>Suivi des présences</strong>
        </div>
        <main className="page"><Outlet /></main>
      </div>
    </div>
  );
}
