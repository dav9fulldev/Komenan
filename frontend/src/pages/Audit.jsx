import { useState } from 'react';
import { chaineRequete } from '../api.js';
import { useDonnees } from '../hooks.js';
import { AlerteErreur, Carte, EntetePage, Modale, Pagination, Tableau } from '../composants/ui.jsx';
import { dateHeure } from '../format.js';

const libelleAction = (a) => a.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()).replace('qrcode', 'QR Code');

export default function Audit() {
  const [f, setF] = useState({ action: '', entite: '', debut: '', fin: '', page: 1 });
  const { donnees, erreur } = useDonnees(`/audit${chaineRequete({ ...f, taille: 50 })}`);
  const { donnees: actions } = useDonnees('/audit/actions');
  const [detail, setDetail] = useState(null);
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1 });

  return (
    <>
      <EntetePage titre="Journal d'audit" description="Actions importantes effectuées dans le back-office. Ce journal ne peut être ni modifié ni supprimé." />
      <AlerteErreur erreur={erreur} />
      <Carte corps={false}>
        <div className="filtres">
          <div className="champ"><label>Action</label>
            <select className="saisie" value={f.action} onChange={maj('action')}>
              <option value="">Toutes</option>{(actions || []).map((a) => <option key={a} value={a}>{libelleAction(a)}</option>)}
            </select></div>
          <div className="champ"><label>Du</label><input className="saisie" type="date" value={f.debut} onChange={maj('debut')} /></div>
          <div className="champ"><label>Au</label><input className="saisie" type="date" value={f.fin} onChange={maj('fin')} /></div>
        </div>
        <Tableau lignes={donnees?.donnees} onLigne={setDetail} vide="Aucune action" colonnes={[
          { cle: 'date_action', titre: 'Date', rendu: (a) => dateHeure(a.date_action) },
          { cle: 'utilisateur', titre: 'Utilisateur', rendu: (a) => (a.nom ? `${a.prenoms} ${a.nom}` : 'Système') },
          { cle: 'action', titre: 'Action', rendu: (a) => <strong>{libelleAction(a.action)}</strong> },
          { cle: 'entite', titre: 'Élément', rendu: (a) => `${a.entite}${a.entite_id ? ` n° ${a.entite_id}` : ''}` },
          { cle: 'ip', titre: 'Adresse IP' },
        ]} />
        {donnees && <Pagination page={donnees.page} taille={donnees.taille} total={donnees.total} onPage={(page) => setF({ ...f, page })} />}
      </Carte>
      {detail && (
        <Modale titre={libelleAction(detail.action)} onFermer={() => setDetail(null)} large>
          <p className="texte-secondaire" style={{ marginTop: 0 }}>{dateHeure(detail.date_action)} · {detail.nom ? `${detail.prenoms} ${detail.nom}` : 'Système'} · {detail.entite} {detail.entite_id}</p>
          <div className="grille grille-2">
            <div><strong>Avant</strong><pre className="code" style={{ whiteSpace: 'pre-wrap', padding: 10, maxHeight: 400, overflow: 'auto' }}>{detail.avant ? JSON.stringify(detail.avant, null, 2) : '—'}</pre></div>
            <div><strong>Après</strong><pre className="code" style={{ whiteSpace: 'pre-wrap', padding: 10, maxHeight: 400, overflow: 'auto' }}>{detail.apres ? JSON.stringify(detail.apres, null, 2) : '—'}</pre></div>
          </div>
        </Modale>
      )}
    </>
  );
}
