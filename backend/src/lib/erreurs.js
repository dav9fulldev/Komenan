export class ErreurMetier extends Error {
  constructor(statut, message, details) {
    super(message);
    this.statut = statut;
    this.details = details;
  }
}
export const nonTrouve = (quoi = 'Élément') => new ErreurMetier(404, `${quoi} introuvable`);
export const interdit = () => new ErreurMetier(403, "Vous n'avez pas les droits nécessaires pour cette action");
export const conflit = (message, details) => new ErreurMetier(409, message, details);
export const invalide = (message, details) => new ErreurMetier(400, message, details);
