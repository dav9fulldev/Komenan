// Horloge de la démonstration statique (GitHub Pages). Sans effet dans la vraie plateforme.
export const MODE_DEMO = import.meta.env.VITE_DEMO === '1';
const JOUR = 86400000;
export const INSTANT = MODE_DEMO ? Date.parse(import.meta.env.VITE_DEMO_MAINTENANT) : 0;

// Décalage (multiple de 7 jours) entre l'instantané et aujourd'hui : les données paraissent récentes
// et les jours de la semaine restent cohérents avec les emplois du temps.
export const DECALAGE_JOURS = (() => {
  if (!MODE_DEMO) return 0;
  const ecart = Math.floor((Date.now() - INSTANT) / JOUR);
  return ecart > 0 ? Math.floor(ecart / 7) * 7 : 0;
})();

/** « Maintenant » vu par l'interface : l'heure réelle, ou l'instant figé de la démonstration. */
export const maintenantApp = () => (MODE_DEMO ? new Date(INSTANT + DECALAGE_JOURS * JOUR) : new Date());
