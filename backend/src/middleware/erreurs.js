import { ErreurMetier } from '../lib/erreurs.js';

export function gestionErreurs(err, req, res, _next) {
  if (err instanceof ErreurMetier) {
    return res.status(err.statut).json({ message: err.message, details: err.details });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Requête mal formée' });
  }
  if (err?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Cette valeur existe déjà (doublon interdit)' });
  }
  if (err?.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ message: "Suppression impossible : cet élément est utilisé ailleurs. Désactivez-le plutôt." });
  }
  if (err?.sqlState === '45000') {
    return res.status(409).json({ message: err.sqlMessage });
  }
  console.error('[ERREUR]', err);
  res.status(500).json({ message: 'Une erreur interne est survenue. Veuillez réessayer.' });
}
