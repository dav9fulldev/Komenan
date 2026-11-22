(function () {
  'use strict';
  var jeton = (window.JETON_DEMO || location.pathname.split('/p/')[1] || '').split(/[?#/]/)[0];
  var CLE_MEMOIRE = 'pointage_identite';
  var confirmation = null;
  var dernierePosition = null;

  function $(id) { return document.getElementById(id); }
  function afficher(id) {
    ['etape-identification', 'etape-attente', 'etape-justification', 'etape-resultat'].forEach(function (e) { $(e).hidden = e !== id; });
    window.scrollTo(0, 0);
  }
  function erreur(id, texte) { var el = $(id); el.textContent = texte || ''; el.hidden = !texte; }

  // Mémorisation facultative de l'identité sur le téléphone de l'enseignant
  try {
    var m = JSON.parse(localStorage.getItem(CLE_MEMOIRE) || 'null');
    if (m) { $('telephone').value = m.telephone || ''; $('nom').value = m.nom || ''; }
  } catch (e) { /* stockage indisponible */ }

  function obtenirPosition() {
    return new Promise(function (resoudre) {
      if (!navigator.geolocation || !window.isSecureContext) return resoudre({ erreur: 'indisponible' });
      $('texte-attente').textContent = 'Localisation en cours… Autorisez l’accès à votre position.';
      navigator.geolocation.getCurrentPosition(function (p) {
        resoudre({ latitude: p.coords.latitude, longitude: p.coords.longitude, precision: Math.round(p.coords.accuracy) });
      }, function (e) {
        resoudre({ erreur: e.code === 1 ? 'refuse' : e.code === 3 ? 'delai' : 'indisponible' });
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }

  function envoyer(corps) {
    $('texte-attente').textContent = 'Vérification en cours…';
    return fetch('/api/pointage/' + encodeURIComponent(jeton), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
      cache: 'no-store',
    }).then(function (r) {
      return r.json().catch(function () { return { statut: 'rejete', message: 'Réponse inattendue du serveur.' }; });
    });
  }

  var ICONES = {
    succes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    attention: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 16v-5M12 8h.01"/></svg>',
    echec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  };

  function resultat(type, titre, message, details, gps) {
    var s = $('etape-resultat');
    s.className = 'carte ' + type;
    $('icone-resultat').innerHTML = ICONES[type];
    $('titre-resultat').textContent = titre;
    $('message-resultat').textContent = message;
    var dl = $('details-resultat');
    dl.innerHTML = '';
    (details || []).forEach(function (d) {
      var div = document.createElement('div');
      var dt = document.createElement('dt'); dt.textContent = d[0];
      var dd = document.createElement('dd'); dd.textContent = d[1];
      div.appendChild(dt); div.appendChild(dd); dl.appendChild(div);
    });
    dl.hidden = !details || !details.length;
    $('gps-resultat').textContent = gps || '';
    afficher('etape-resultat');
  }

  function duree(min) { return Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0'); }

  function traiter(r) {
    switch (r.statut) {
      case 'arrivee_enregistree':
        confirmation = null;
        return resultat('succes', 'Arrivée enregistrée', r.message,
          [['Arrivée', r.heure_arrivee], ['Prévue', r.heure_prevue], ['Fin prévue', r.fin_prevue]], r.gps);
      case 'depart_enregistre':
        confirmation = null;
        return resultat('succes', 'Départ enregistré', r.message,
          [['Arrivée', r.heure_arrivee], ['Départ', r.heure_depart], ['Durée', duree(r.duree_minutes)]], r.gps);
      case 'justification_requise':
        confirmation = r.confirmation;
        var retard = r.type === 'retard';
        $('titre-justification').textContent = retard ? 'Retard constaté' : 'Départ avant la fin du cours';
        $('lib-prevue').textContent = retard ? 'Heure prévue' : 'Fin prévue';
        $('lib-ecart').textContent = retard ? 'Retard' : 'Avance';
        $('j-prevue').textContent = r.heure_prevue;
        $('j-reelle').textContent = r.heure_reelle;
        $('j-ecart').textContent = (retard ? r.retard_minutes : r.avance_minutes) + ' min';
        $('j-message').textContent = r.message;
        $('bouton-confirmer').textContent = retard ? 'Confirmer mon arrivée' : 'Confirmer mon départ';
        erreur('erreur-justification', r.erreur);
        afficher('etape-justification');
        return $('justification').focus();
      case 'trop_tot':
        return resultat('attention', 'Trop tôt pour pointer', r.message,
          [['Maintenant', r.heure_actuelle], ['Ouverture', r.heure_ouverture], ['Cours', r.heure_prevue]]);
      case 'deja_arrive':
        return resultat('info', 'Arrivée déjà enregistrée', r.message, [['Arrivée', r.heure_arrivee], ['Fin prévue', r.fin_prevue]]);
      default:
        confirmation = null;
        if (r.champ === 'telephone') { afficher('etape-identification'); return erreur('erreur-identification', r.message); }
        return resultat('echec', 'Pointage non enregistré', r.message || 'Le pointage a été refusé.');
    }
  }

  function echecReseau() {
    resultat('echec', 'Connexion impossible', "Le pointage n'a pas pu être envoyé. Vérifiez votre connexion internet puis réessayez. Rien n'a été enregistré.");
  }

  $('form-identification').addEventListener('submit', function (e) {
    e.preventDefault();
    var tel = $('telephone').value.trim();
    var nom = $('nom').value.trim();
    if (tel.replace(/\D/g, '').length < 10) return erreur('erreur-identification', 'Saisissez votre numéro de téléphone (10 chiffres).');
    if (nom.split(/\s+/).length < 2) return erreur('erreur-identification', 'Saisissez votre nom et au moins un prénom.');
    erreur('erreur-identification', '');
    try {
      if ($('memoriser').checked) localStorage.setItem(CLE_MEMOIRE, JSON.stringify({ telephone: tel, nom: nom }));
      else localStorage.removeItem(CLE_MEMOIRE);
    } catch (x) { /* ignoré */ }
    afficher('etape-attente');
    obtenirPosition().then(function (pos) {
      dernierePosition = pos;
      return envoyer({ telephone: tel, nom: nom, position: pos, heure_appareil: new Date().toISOString() });
    }).then(traiter).catch(echecReseau);
  });

  $('form-justification').addEventListener('submit', function (e) {
    e.preventDefault();
    var texte = $('justification').value.trim();
    if (texte.length < 10) return erreur('erreur-justification', 'La justification doit contenir au moins 10 caractères.');
    $('bouton-confirmer').disabled = true;
    afficher('etape-attente');
    envoyer({
      telephone: $('telephone').value.trim(), nom: $('nom').value.trim(), position: dernierePosition,
      justification: texte, confirmation: confirmation, heure_appareil: new Date().toISOString(),
    }).then(function (r) {
      $('bouton-confirmer').disabled = false;
      if (r.statut !== 'justification_requise') $('justification').value = '';
      traiter(r);
    }).catch(function () { $('bouton-confirmer').disabled = false; echecReseau(); });
  });

  $('bouton-annuler-justif').addEventListener('click', function () { confirmation = null; afficher('etape-identification'); });
  $('bouton-recommencer').addEventListener('click', function () { afficher('etape-identification'); });

  if (!jeton) resultat('echec', 'QR Code incomplet', 'Le lien ouvert ne contient pas de code valide. Scannez à nouveau le QR Code du domicile.');
})();
