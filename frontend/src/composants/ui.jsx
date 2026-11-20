import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Inbox, Info, Loader2, Search, X } from 'lucide-react';

// ---------- Notifications ----------
const ContexteNotif = createContext(() => {});
export const useNotifier = () => useContext(ContexteNotif);

export function FournisseurNotifications({ children }) {
  const [liste, setListe] = useState([]);
  const notifier = useCallback((message, type = 'succes') => {
    const id = Math.random();
    setListe((l) => [...l, { id, message, type }]);
    setTimeout(() => setListe((l) => l.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ContexteNotif.Provider value={notifier}>
      {children}
      <div className="notifications" role="status" aria-live="polite">
        {liste.map((n) => (
          <div key={n.id} className={`notification ${n.type}`}>
            {n.type === 'erreur' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{n.message}</span>
          </div>
        ))}
      </div>
    </ContexteNotif.Provider>
  );
}

// ---------- Éléments simples ----------
export function Badge({ ton = 'neutre', children }) {
  return <span className={`badge ton-${ton}`}>{children}</span>;
}

export function BadgeStatut({ table, valeur }) {
  const s = table[valeur];
  if (!s) return <span className="texte-secondaire">—</span>;
  return <Badge ton={s.ton}>{s.libelle}</Badge>;
}

export function Chargement({ texte = 'Chargement…' }) {
  return <div className="chargement"><Loader2 size={20} className="rotation" /> {texte}</div>;
}

export function Vide({ texte = 'Aucun élément à afficher' }) {
  return <div className="vide"><Inbox size={28} /><div>{texte}</div></div>;
}

export function Alerte({ type = 'erreur', children }) {
  const Icone = type === 'erreur' ? AlertCircle : type === 'succes' ? CheckCircle2 : Info;
  return <div className={`alerte alerte-${type}`} role={type === 'erreur' ? 'alert' : undefined}><Icone size={16} /><div>{children}</div></div>;
}

/** Affiche l'erreur d'API, y compris la liste des conflits éventuels. */
export function AlerteErreur({ erreur }) {
  if (!erreur) return null;
  const conflits = erreur.details?.conflits;
  return (
    <Alerte>
      {erreur.message}
      {conflits && <ul>{conflits.map((c, i) => <li key={i}>{c.message}</li>)}</ul>}
    </Alerte>
  );
}

export function EntetePage({ titre, description, children }) {
  return (
    <div className="entete-page">
      <div><h1>{titre}</h1>{description && <p>{description}</p>}</div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function Carte({ titre, actions, children, corps = true, className = '' }) {
  return (
    <section className={`carte ${className}`}>
      {titre && <div className="carte-entete"><h2>{titre}</h2>{actions}</div>}
      {corps ? <div className="carte-corps">{children}</div> : children}
    </section>
  );
}

// ---------- Modale ----------
export function Modale({ titre, onFermer, children, pied, large = false }) {
  useEffect(() => {
    const echap = (e) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [onFermer]);
  return (
    <div className="voile" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className={`modale ${large ? 'large' : ''}`} role="dialog" aria-modal="true" aria-label={titre}>
        <div className="modale-entete">
          <h2>{titre}</h2>
          <button className="bouton-icone" onClick={onFermer} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modale-corps">{children}</div>
        {pied && <div className="modale-pied">{pied}</div>}
      </div>
    </div>
  );
}

export function Confirmation({ titre, message, libelle = 'Confirmer', danger = false, onConfirmer, onFermer, avecMotif = false, libelleMotif = 'Motif' }) {
  const [motif, setMotif] = useState('');
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const valider = async () => {
    setEncours(true);
    setErreur(null);
    try { await onConfirmer(motif); onFermer(); } catch (e) { setErreur(e); setEncours(false); }
  };
  return (
    <Modale titre={titre} onFermer={onFermer} pied={<>
      <button className="bouton bouton-secondaire" onClick={onFermer}>Annuler</button>
      <button className={`bouton ${danger ? 'bouton-danger' : 'bouton-principal'}`} disabled={encours || (avecMotif && !motif.trim())} onClick={valider}>{libelle}</button>
    </>}>
      <AlerteErreur erreur={erreur} />
      <p style={{ marginTop: 0 }}>{message}</p>
      {avecMotif && (
        <Champ libelle={libelleMotif} obligatoire>
          <textarea className="saisie" value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={300} />
        </Champ>
      )}
    </Modale>
  );
}

// ---------- Formulaires ----------
export function Champ({ libelle, obligatoire, aide, erreur, children, id }) {
  return (
    <div className="champ">
      {libelle && <label htmlFor={id}>{libelle}{obligatoire && <span className="obligatoire"> *</span>}</label>}
      {children}
      {erreur ? <div className="erreur-champ">{erreur}</div> : aide && <div className="aide">{aide}</div>}
    </div>
  );
}

export function Recherche({ valeur, onChange, placeholder = 'Rechercher…' }) {
  return (
    <div className="recherche">
      <Search size={15} />
      <input className="saisie" type="search" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

/** Gestion simple d'un formulaire : valeurs, erreurs par champ, soumission. */
export function useFormulaire(initial) {
  const [valeurs, setValeurs] = useState(initial);
  const [erreur, setErreur] = useState(null);
  const [encours, setEncours] = useState(false);
  const maj = (champ) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValeurs((x) => ({ ...x, [champ]: v }));
  };
  const soumettre = async (fn) => {
    setEncours(true);
    setErreur(null);
    try { return await fn(valeurs); } catch (e) { setErreur(e); throw e; } finally { setEncours(false); }
  };
  const erreurChamp = (champ) => (erreur?.details && !erreur.details.conflits ? erreur.details[champ] : undefined);
  return { valeurs, setValeurs, maj, erreur, setErreur, encours, soumettre, erreurChamp };
}

// ---------- Tableau ----------
export function Tableau({ colonnes, lignes, cle = 'id', onLigne, vide, classeLigne, compact }) {
  if (!lignes) return <Chargement />;
  if (!lignes.length) return <Vide texte={vide} />;
  return (
    <div className="tableau-conteneur">
      <table className={`tableau ${compact ? 'tableau-compact' : ''}`}>
        <thead>
          <tr>{colonnes.map((c) => <th key={c.cle} className={c.num ? 'num' : ''} style={c.largeur ? { width: c.largeur } : undefined}>{c.titre}</th>)}</tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={l[cle] ?? i} className={`${onLigne ? 'cliquable' : ''} ${classeLigne ? classeLigne(l) : ''}`} onClick={onLigne ? () => onLigne(l) : undefined}>
              {colonnes.map((c) => <td key={c.cle} className={c.num ? 'num' : ''}>{c.rendu ? c.rendu(l) : (l[c.cle] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, taille, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / taille));
  if (total <= taille) return total ? <div className="pagination"><span>{total} résultat{total > 1 ? 's' : ''}</span></div> : null;
  return (
    <div className="pagination">
      <span>{total} résultats — page {page} sur {pages}</span>
      <div className="actions">
        <button className="bouton bouton-secondaire bouton-petit" disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</button>
        <button className="bouton bouton-secondaire bouton-petit" disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant</button>
      </div>
    </div>
  );
}

export function Onglets({ onglets, actif, onChange }) {
  return (
    <div className="onglets" role="tablist">
      {onglets.map(([cle, libelle]) => (
        <button key={cle} role="tab" aria-selected={actif === cle} className={actif === cle ? 'actif' : ''} onClick={() => onChange(cle)}>{libelle}</button>
      ))}
    </div>
  );
}

export function Indicateur({ icone: Icone, valeur, libelle, ton = 'bleu', onClick }) {
  return (
    <div className="carte indicateur" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className={`icone ton-${ton}`}><Icone size={20} /></div>
      <div><div className="valeur">{valeur ?? '—'}</div><div className="libelle">{libelle}</div></div>
    </div>
  );
}
