import cron from 'node-cron';
import { creerApp } from './app.js';
import { config } from './config.js';
import { genererHorizon, traiterEcheances } from './services/seances.js';

const app = creerApp();

async function tachePeriodique() {
  try {
    await genererHorizon();
    const r = await traiterEcheances();
    if (r.absences || r.sansDepart) console.log(`[TÂCHE] ${r.absences} absence(s) présumée(s), ${r.sansDepart} séance(s) sans départ`);
  } catch (e) {
    console.error('[TÂCHE] Échec', e.message);
  }
}

app.listen(config.port, () => {
  console.log(`API démarrée sur http://localhost:${config.port} (documentation : /api/docs)`);
  tachePeriodique();
  cron.schedule('*/2 * * * *', tachePeriodique);
});
