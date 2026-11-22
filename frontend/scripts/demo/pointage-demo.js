// Démonstration statique : simulation du serveur de pointage dans le navigateur.
// Reprend les contrôles du vrai moteur (QR Code, identité, affectation, position GPS)
// mais N'ENREGISTRE RIEN. Chargé uniquement dans la copie publiée sur GitHub Pages.
(function () {
  'use strict';
  var h = location.hash.slice(1);
  window.JETON_DEMO = h ? decodeURIComponent(h) : '';

  var MSG_IDENTIFICATION = 'Identification impossible. Vérifiez votre numéro de téléphone et votre nom, puis réessayez.';
  var donnees = fetch('../demo/pointage.json', { cache: 'no-cache' }).then(function (r) { return r.json(); });
  var fetchReel = window.fetch.bind(window);
  var fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Abidjan', hour: '2-digit', minute: '2-digit' });

  function hm(d) { return fmtHeure.format(d); }
  function mots(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  }
  function chiffres(s) { return String(s || '').replace(/\D/g, '').slice(-10); }
  function rejet(message, extra) { var r = { statut: 'rejete', message: message }; for (var k in extra || {}) r[k] = extra[k]; return r; }

  function distance(a, b, c, d) {
    var R = 6371000, rad = Math.PI / 180;
    var x = Math.sin((c - a) * rad / 2), y = Math.sin((d - b) * rad / 2);
    return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * rad) * Math.cos(c * rad) * y * y));
  }
  function gps(position, dom) {
    if (!position || position.erreur) {
      return position && position.erreur === 'refuse'
        ? "L'accès à la position a été refusé sur le téléphone — anomalie signalée à l'administration"
        : "Position GPS indisponible — anomalie signalée à l'administration";
    }
    var m = Math.round(distance(position.latitude, position.longitude, dom.latitude, dom.longitude));
    var rayon = dom.rayon_tolerance_m || 150;
    if (m <= rayon) return 'Position conforme (' + m + ' m du domicile)';
    var txt = m > 5000 ? (m / 1000).toFixed(0) + ' km' : m + ' m';
    return 'Position à ' + txt + ' du domicile (tolérance ' + rayon + ' m) — anomalie signalée à l’administration';
  }

  function identifier(d, corps) {
    var tel = chiffres(corps.telephone);
    if (tel.length < 10) return { rejet: rejet('Numéro de téléphone invalide. Saisissez les 10 chiffres de votre numéro.', { champ: 'telephone' }) };
    var ens = d.enseignants.filter(function (e) { return chiffres(e.telephone) === tel; })[0];
    if (!ens) return { rejet: rejet(MSG_IDENTIFICATION) };
    var saisis = mots(corps.nom);
    var famille = mots(ens.nom), prenoms = mots(ens.prenoms), connus = famille.concat(prenoms);
    var ok = famille.every(function (m) { return saisis.indexOf(m) >= 0; })
      && prenoms.some(function (p) { return saisis.indexOf(p) >= 0; })
      && saisis.every(function (m) { return connus.indexOf(m) >= 0; });
    return ok ? { ens: ens } : { rejet: rejet(MSG_IDENTIFICATION) };
  }

  function simuler(d, jeton, corps) {
    var domId = d.jetons[jeton];
    var dom = d.domiciles.filter(function (x) { return x.id === domId; })[0];
    if (!dom) return rejet("Ce QR Code n'est pas reconnu. Signalez-le à l'administration.");
    var id = identifier(d, corps);
    if (id.rejet) return id.rejet;
    var aff = d.affectations.filter(function (a) { return a.enseignant_id === id.ens.id && a.domicile_id === dom.id && a.actif; })[0];
    if (!aff) return rejet("Vous n'êtes pas affecté(e) à ce domicile. Votre tentative a été transmise à l'administration.");

    var cle = 'demo_pointage_' + jeton + '_' + id.ens.id;
    var etat = null;
    try { etat = JSON.parse(sessionStorage.getItem(cle) || 'null'); } catch (e) { /* stockage indisponible */ }
    var t = new Date();
    var texteGps = gps(corps.position, dom);

    if (!etat) {
      var prevue = new Date(Math.floor(t.getTime() / 900000) * 900000); // cours supposé commencer au quart d'heure
      var fin = new Date(prevue.getTime() + 2 * 3600000);
      try { sessionStorage.setItem(cle, JSON.stringify({ arrivee: t.toISOString(), fin: fin.toISOString() })); } catch (e) { /* ignoré */ }
      return {
        statut: 'arrivee_enregistree',
        message: 'Vérifications conformes. Votre arrivée est enregistrée. Bon cours ! (Démonstration : rien n’est enregistré.)',
        heure_prevue: hm(prevue), heure_arrivee: hm(t), fin_prevue: hm(fin), gps: texteGps,
      };
    }
    var arrivee = new Date(etat.arrivee), finPrevue = new Date(etat.fin);
    var avance = Math.max(1, Math.round((finPrevue - t) / 60000));
    if (!corps.confirmation || !corps.justification) {
      return {
        statut: 'justification_requise', type: 'depart', confirmation: 'demo',
        heure_prevue: hm(finPrevue), heure_reelle: hm(t), avance_minutes: avance,
        message: 'Votre cours se termine à ' + hm(finPrevue) + '. Vous partez ' + avance + ' minutes plus tôt : expliquez la raison pour enregistrer votre départ.',
      };
    }
    try { sessionStorage.removeItem(cle); } catch (e) { /* ignoré */ }
    return {
      statut: 'depart_enregistre',
      message: 'Votre départ et votre justification sont enregistrés. La séance est clôturée. Merci ! (Démonstration : rien n’est enregistré.)',
      heure_arrivee: hm(arrivee), heure_depart: hm(t), duree_minutes: Math.max(0, Math.round((t - arrivee) / 60000)), gps: texteGps,
    };
  }

  window.fetch = function (url, options) {
    if (typeof url === 'string' && url.indexOf('/api/pointage/') === 0) {
      var jeton = decodeURIComponent(url.split('/api/pointage/')[1] || '');
      return donnees.then(function (d) {
        var corps = {};
        try { corps = JSON.parse(options.body); } catch (e) { /* vide */ }
        return new Response(JSON.stringify(simuler(d, jeton, corps)), { headers: { 'content-type': 'application/json' } });
      });
    }
    return fetchReel(url, options);
  };

  // Aide à la démonstration : enseignants fictifs affectés à ce domicile.
  document.addEventListener('DOMContentLoaded', function () {
    var main = document.querySelector('main');
    var note = document.createElement('div');
    note.className = 'note-demo';
    note.textContent = 'Démonstration : le pointage est simulé dans votre navigateur, rien n’est enregistré.';
    main.insertBefore(note, main.firstChild);
    donnees.then(function (d) {
      var dom = d.domiciles.filter(function (x) { return x.id === d.jetons[window.JETON_DEMO]; })[0];
      if (!dom) return;
      var noms = d.affectations.filter(function (a) { return a.domicile_id === dom.id && a.actif; }).map(function (a) {
        var e = d.enseignants.filter(function (x) { return x.id === a.enseignant_id; })[0];
        var t = chiffres(e.telephone);
        return e.nom + ' ' + e.prenoms + ' — ' + t.replace(/(\d\d)(?=\d)/g, '$1 ');
      });
      note.textContent += ' Domicile ' + dom.code + ' : essayez avec ' + noms.join(' ou ') + '.';
    });
  });
})();
