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

async function appel(methode, url, corps) {
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

export function chaineRequete(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
