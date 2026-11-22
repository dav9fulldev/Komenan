import { MODE_DEMO, maintenantApp } from './horlogeDemo.js';

const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Abidjan', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Bandeau affiché uniquement dans la démonstration en ligne. */
export function BandeauDemo() {
  if (!MODE_DEMO) return null;
  return (
    <div className="bandeau-demo" role="note">
      <strong>Démonstration en ligne</strong> · données fictives, situation du {fmt.format(maintenantApp())} ·
      les modifications sont simulées et disparaissent au rechargement.
    </div>
  );
}

/** Comptes de démonstration proposés sur l'écran de connexion. */
export function ComptesDemo({ remplir }) {
  if (!MODE_DEMO) return null;
  return (
    <div className="comptes-demo">
      <strong>Démonstration : choisissez un compte</strong>
      <div className="comptes-demo-boutons">
        <button type="button" className="bouton bouton-secondaire" onClick={() => remplir('admin@demo.local')}>Administrateur</button>
        <button type="button" className="bouton bouton-secondaire" onClick={() => remplir('superviseur@demo.local')}>Superviseur</button>
      </div>
      <span>Mot de passe : <code>DemoPresences2026</code> — données entièrement fictives.</span>
    </div>
  );
}
