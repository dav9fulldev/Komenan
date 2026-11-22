// Client de l'API : cookies de session, erreurs en français.
export class ErreurApi extends Error {
  constructor(statut, message, details) {
    super(message);
    this.statut = statut;
    this.details = details;
  }
}

let surDeconnexion = () => {};
export const definirSurDeconnexion = (fn) => { surDeconnexion = fn; };

const MODE_DEMO = import.meta.env.VITE_DEMO === '1';

// Démonstration statique (GitHub Pages) : les réponses viennent d'un instantané de données fictives.
async function appelDemo(methode, url, corps) {
  const { repondre } = await import('./demo/serveurDemo.js');
  const { statut, donnees } = await repondre(methode, url, corps);
  if (statut >= 400) {
    if (statut === 401 && !url.startsWith('/auth/')) surDeconnexion();
    throw new ErreurApi(statut, donnees?.message || 'Une erreur est survenue', donnees?.details);
  }
  return donnees;
}

async function appel(methode, url, corps) {
  if (MODE_DEMO) return appelDemo(methode, url, corps);
  let r;
  try {
    r = await fetch(`/api${url}`, {
      method: methode,
      credentials: 'same-origin',
      headers: corps !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
  } catch {
    throw new ErreurApi(0, 'Serveur injoignable. Vérifiez votre connexion internet.');
  }
  const donnees = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith('/auth/')) surDeconnexion();
    throw new ErreurApi(r.status, donnees?.message || 'Une erreur est survenue', donnees?.details);
  }
  return donnees;
}

export const api = {
  get: (url) => appel('GET', url),
  post: (url, corps = {}) => appel('POST', url, corps),
  put: (url, corps) => appel('PUT', url, corps),
  patch: (url, corps) => appel('PATCH', url, corps),
};

/** Lien direct vers l'API (téléchargements). En démonstration : fichiers pré-générés. */
export function lienApi(url) {
  if (!MODE_DEMO) return `/api${url}`;
  const m = url.match(/^\/rapports\/([a-z-]+)\?.*format=(pdf|xlsx)/);
  return m ? `${import.meta.env.BASE_URL}demo/exports/${m[1]}.${m[2]}` : '#';
}

export function chaineRequete(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
