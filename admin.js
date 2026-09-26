// Poste de commandement — édition et publication de data.json
(async function () {
  await AUTH.pret;
  const $ = s => document.querySelector(s);
  $('#btnDeconnexion').onclick = AUTH.deconnexion;
  const esc = C.esc;
  const CLE_BROUILLON = 'cendres-brouillon', CLE_CONFIG = 'cendres-config', CLE_ANNONCES = 'cendres-annonces';

  const lire = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } };
  const effacer = k => { try { localStorage.removeItem(k); } catch (e) { /* idem */ } };

  // Sérialisation sans les champs internes (_secteur…)
  const versJSON = d => JSON.stringify(d, (k, v) => k.startsWith('_') ? undefined : v, 2);

  let data, publie, publieTension;
  let onglet = 'situation', districtSel = null, evEdite = null;
  let config = await AUTH.lireConfig();
  let annonces = lire(CLE_ANNONCES, []);

  // Devine le dépôt quand la page est servie par GitHub Pages (pseudo.github.io/depot)
  if (!config.owner && location.hostname.endsWith('.github.io')) {
    config.owner = location.hostname.split('.')[0];
    config.repo = location.pathname.split('/').filter(Boolean)[0] || location.hostname;
    config.site = location.origin + location.pathname.replace(/admin\.html$/, '');
  }

  // ---------- Chargement ----------
  try {
    const txt = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
    publie = versJSON(JSON.parse(txt));
  } catch (e) {
    avis('Impossible de lire data.json : ' + e.message, true);
    return;
  }
  const brouillon = lire(CLE_BROUILLON, null);
  if (brouillon && versJSON(brouillon) !== publie) {
    data = brouillon;
    avis(`Brouillon local restauré (modifications non publiées). <button class="ds-btn ds-btn-outline ds-btn-sm" id="abandon">Abandonner le brouillon</button>`);
    $('#abandon').onclick = () => { if (confirm('Abandonner toutes les modifications non publiées ?')) { effacer(CLE_BROUILLON); location.reload(); } };
  } else {
    data = JSON.parse(publie);
  }
  publieTension = JSON.parse(publie).tension.valeur;

  function avis(html, erreur) {
    const el = $('#avis');
    el.hidden = false; el.className = 'avis' + (erreur ? ' erreur' : '');
    el.innerHTML = html;
  }
  let tt;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(tt); tt = setTimeout(() => el.hidden = true, 2600);
  }

  // ---------- Suivi des modifications ----------
  let ts;
  function modifie() {
    clearTimeout(ts);
    ts = setTimeout(() => {
      const diff = versJSON(data) !== publie;
      if (diff) ecrire(CLE_BROUILLON, JSON.parse(versJSON(data))); else effacer(CLE_BROUILLON);
      majEtat();
    }, 250);
  }
  function majEtat() {
    const diff = versJSON(data) !== publie;
    $('#etatPub').textContent = diff ? '● Modifications non publiées' : 'À jour avec la version publiée';
    $('#etatPub').style.color = diff ? 'var(--confed)' : '';
    $('#btnPublier').classList.toggle('modifie', diff);
  }

  // ---------- Liaison champs ↔ données ----------
  // <input data-bind="meta.dateRP" data-type="texte|nombre|valeur">
  function getPath(p) { return p.split('.').reduce((o, k) => o == null ? o : o[k], data); }
  function setPath(p, v) {
    const ks = p.split('.'); const last = ks.pop();
    const o = ks.reduce((o, k) => o[k] ?? (o[k] = {}), data);
    o[last] = v;
  }
  // "12 000" → 12000 · "~12000" et "CLASSIFIÉ" restent du texte
  function valeurChamp(s) {
    s = String(s).trim();
    if (s === '') return 0;
    if (/^-?[\d\s  ]+([.,]\d+)?$/.test(s)) return Number(s.replace(/[\s  ]/g, '').replace(',', '.'));
    return s;
  }
  function afficheValeur(v) {
    if (typeof v === 'number') return C.num(v);
    return v ?? '';
  }
  function lier(racine) {
    racine.querySelectorAll('[data-bind]').forEach(el => {
      const p = el.dataset.bind, t = el.dataset.type || 'texte';
      const v = getPath(p);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (t === 'lignes') el.value = (v || []).join('\n');
      else el.value = t === 'valeur' ? afficheValeur(v) : (v ?? '');
    });
  }
  $('#contenu').addEventListener('input', e => {
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    const t = el.dataset.type || 'texte';
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (t === 'nombre') v = Number(v) || 0;
    if (t === 'valeur') v = valeurChamp(v);
    if (t === 'lignes') v = el.value.split('\n').map(x => x.trim()).filter(Boolean);
    setPath(el.dataset.bind, v);
    // Champs liés entre eux (curseur + nombre)
    document.querySelectorAll(`[data-bind="${el.dataset.bind}"]`).forEach(o => { if (o !== el && o.type !== 'checkbox') o.value = v; });
    if (el.dataset.bind.startsWith('tension')) apercuTension();
    if (el.dataset.maj === 'nav') majNavDistricts();
    modifie();
  });
  $('#contenu').addEventListener('change', e => {
    const el = e.target.closest('[data-bind][data-type="valeur"]');
    if (el) el.value = afficheValeur(getPath(el.dataset.bind));
  });

  // ---------- Onglets ----------
  $('#onglets').addEventListener('click', e => {
    const b = e.target.closest('[data-onglet]');
    if (!b) return;
    onglet = b.dataset.onglet;
    document.querySelectorAll('#onglets button').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); });
    rendre();
  });

  // Applique les composants du système de design aux champs générés
  function habiller(racine) {
    racine.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file])').forEach(e => e.classList.add('ds-input'));
    racine.querySelectorAll('select').forEach(e => e.classList.add('ds-select'));
    racine.querySelectorAll('textarea').forEach(e => e.classList.add('ds-textarea'));
    racine.querySelectorAll('.champ > span').forEach(e => e.classList.add('ds-label'));
  }

  function rendre() {
    const vues = { situation: vueSituation, evenements: vueEvenements, districts: vueDistricts, zones: vueZones, secteurs: vueSecteurs, reglages: vueReglages };
    $('#contenu').innerHTML = vues[onglet]();
    habiller($('#contenu'));
    lier($('#contenu'));
    if (onglet === 'situation') apercuTension();
    majEtat();
  }

  // ---------- 1. Situation ----------
  function vueSituation() {
    return `
    <section class="ds-card carte"><h2 class="ds-section-title">Date du RP</h2>
      <p class="ds-supporting aide">La date affichée en haut de la carte. Changez-la à chaque nouveau « tour » du conflit : elle sert aussi de repère dans la chronologie.</p>
      <div class="grille"><label class="champ"><span>Date actuelle</span><input data-bind="meta.dateRP"></label></div>
    </section>
    <section class="ds-card carte"><h2 class="ds-section-title">Tension mondiale</h2>
      <p class="ds-supporting aide">Réglée à la main, de 0 à 100. Les paliers se modifient dans l'onglet Réglages.</p>
      <div class="ligne"><input type="range" min="0" max="100" data-bind="tension.valeur" data-type="nombre" style="flex:1">
        <input type="number" min="0" max="100" data-bind="tension.valeur" data-type="nombre" class="num" style="width:90px"></div>
      <div class="apercu-tension" id="apercuT"></div>
    </section>
    <section class="ds-card carte"><h2 class="ds-section-title">Distorsion de la carte</h2>
      <p class="ds-supporting aide">Effet de brouillage sur la carte publique (grain, balayage, coupures). 0 = aucun, 100 = maximal. Enregistré avec chaque point de chronologie, donc il évolue dans le temps quand on rejoue le conflit.</p>
      <div class="ligne"><input type="range" min="0" max="100" data-bind="meta.distorsion" data-type="nombre" style="flex:1">
        <input type="number" min="0" max="100" data-bind="meta.distorsion" data-type="nombre" class="num" style="width:90px"></div>
    </section>
    <section class="ds-card carte"><h2 class="ds-section-title">En-tête</h2>
      <div class="grille">
        <label class="champ"><span>Titre</span><input data-bind="meta.titre"></label>
        <label class="champ large"><span>Sous-titre</span><input data-bind="meta.sousTitre"></label>
      </div>
    </section>
    <section class="ds-card carte"><h2 class="ds-section-title">Mise à jour type</h2>
      <p class="ds-supporting aide" style="margin:0">1. Changer la date du RP ici → 2. Ajouter les événements du tour → 3. Ajuster les districts touchés (statut, influence, effectifs, pertes) → 4. Régler la tension → 5. <strong>Publier</strong>.</p>
    </section>`;
  }
  function apercuTension() {
    const el = $('#apercuT');
    if (!el) return;
    const t = data.tension.valeur, P = data.tension.paliers;
    const i = C.palier(t, P), m = C.minutes(t, P);
    const change = C.palier(publieTension, P) !== i;
    el.innerHTML = `<span class="h">${C.heure(m)}</span><div><div class="p">Palier ${i + 1} · ${esc(P[i].nom)}</div>
      ${change ? `<div class="small" style="color:var(--g-critique);margin-top:4px">Changement de palier depuis la dernière publication (${esc(P[C.palier(publieTension, P)].nom)} → ${esc(P[i].nom)})</div>` : ''}</div>`;
  }

  // ---------- 2. Événements ----------
  function optionsPortee(sel) {
    const s = sel ? sel.type + ':' + sel.id : 'monde:';
    let h = `<option value="monde:" ${s === 'monde:' ? 'selected' : ''}>Mondial</option>`;
    for (const sec of data.secteurs) {
      h += `<optgroup label="${esc(sec.nom)}"><option value="secteur:${sec.id}" ${s === 'secteur:' + sec.id ? 'selected' : ''}>Secteur ${esc(sec.nom)} (entier)</option>`;
      for (const d of sec.districts) h += `<option value="district:${d.id}" ${s === 'district:' + d.id ? 'selected' : ''}>${esc(d.nom)}</option>`;
      h += '</optgroup>';
    }
    return h;
  }
  function nomPortee(p) {
    if (p.type === 'monde') return 'Mondial';
    for (const s of data.secteurs) {
      if (p.type === 'secteur' && s.id === p.id) return 'Secteur ' + s.nom;
      for (const d of s.districts) if (p.type === 'district' && d.id === p.id) return d.nom + ' · ' + s.nom;
    }
    return '(portée supprimée)';
  }

  function vueEvenements() {
    const ev = evEdite !== null ? data.evenements[evEdite] : null;
    const g = ev ? ev.gravite : 'majeur';
    const liste = data.evenements.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => `
      <article class="ev ${e.gravite} ${i === evEdite ? 'edite' : ''}">
        <div class="meta"><span class="ds-badge grav ${e.gravite}">${esc(C.GRAVITES[e.gravite])}</span><span class="date">${esc(e.date)}</span><span>${esc(nomPortee(e.portee))}</span>
          ${annonces.includes(e.id) ? '<span class="ds-badge ann">Annonce Discord en attente</span>' : ''}</div>
        <div class="outils">
          <button class="ds-btn ds-btn-outline ds-btn-sm" data-ev-haut="${i}" title="Plus ancien" ${i === 0 ? 'disabled' : ''}>↓</button>
          <button class="ds-btn ds-btn-outline ds-btn-sm" data-ev-bas="${i}" title="Plus récent" ${i === data.evenements.length - 1 ? 'disabled' : ''}>↑</button>
          <button class="ds-btn ds-btn-outline ds-btn-sm" data-ev-edit="${i}">Modifier</button>
          <button class="ds-btn ds-btn-outline ds-btn-sm danger" data-ev-suppr="${i}">✕</button>
        </div>
        <h4>${esc(e.titre)}</h4><p>${esc(e.description)}</p>
        ${e.consequences && e.consequences.length ? `<ul>${e.consequences.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      </article>`).join('');
    return `
    <section class="ds-card carte"><h2 class="ds-section-title">${ev ? 'Modifier l\'événement' : 'Nouvel événement'}</h2>
      <p class="ds-supporting aide">${ev ? 'Les changements s\'appliquent dès que vous enregistrez.' : 'Il apparaîtra en tête du fil, avec un marqueur sur la carte. Les événements critiques s\'affichent aussi en bandeau d\'alerte.'}</p>
      <form id="formEv" class="grille">
        <label class="champ"><span>Date</span><input name="date" value="${esc(ev ? ev.date : data.meta.dateRP)}" required></label>
        <label class="champ" style="grid-column:span 2"><span>Portée</span><select name="portee">${optionsPortee(ev && ev.portee)}</select></label>
        <div class="champ large"><span>Gravité</span><div class="gravites">
          ${Object.entries(C.GRAVITES).map(([k, l]) => `<label class="${k}"><input type="radio" name="gravite" value="${k}" ${g === k ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
        <label class="champ large"><span>Titre</span><input name="titre" value="${esc(ev ? ev.titre : '')}" required></label>
        <label class="champ large"><span>Description</span><textarea name="description" rows="3">${esc(ev ? ev.description : '')}</textarea></label>
        <label class="champ large"><span>Conséquences — une par ligne</span><textarea name="consequences" rows="3">${esc(ev ? (ev.consequences || []).join('\n') : '')}</textarea></label>
        <label class="champ"><span>Effet sur la tension</span><input name="tension" type="number" class="num" value="${ev ? ev.tension || 0 : 0}"><small>Affiché sur l'événement (ex. +8)</small></label>
        <div class="champ" style="grid-column:span 2;justify-content:flex-end;gap:8px">
          ${ev ? '' : '<label class="case"><input type="checkbox" name="appliquer" checked> Ajouter cette valeur à la jauge de tension</label>'}
          <label class="case"><input type="checkbox" name="annoncer" ${ev ? (annonces.includes(ev.id) ? 'checked' : '') : (g !== 'mineur' ? 'checked' : '')}> Annoncer sur Discord à la prochaine publication</label>
        </div>
        <div class="champ large"><div class="ligne">
          <button class="ds-btn ds-btn-primary" type="submit">${ev ? 'Enregistrer' : 'Ajouter l\'événement'}</button>
          ${ev ? '<button class="ds-btn ds-btn-outline" type="button" id="annulerEv">Annuler</button>' : ''}</div></div>
      </form>
    </section>
    <section class="ds-card carte ev-liste"><h2 class="ds-section-title">Fil des événements (${data.evenements.length})</h2>
      <p class="ds-supporting aide">Du plus récent au plus ancien. Les flèches corrigent l'ordre si besoin.</p>
      ${liste || '<div class="vide">Aucun événement.</div>'}
    </section>`;
  }

  $('#contenu').addEventListener('submit', e => {
    if (e.target.id !== 'formEv') return;
    e.preventDefault();
    const f = new FormData(e.target);
    const [type, id] = f.get('portee').split(':');
    const ev = {
      id: evEdite !== null ? data.evenements[evEdite].id : 'ev' + Date.now().toString(36),
      date: f.get('date').trim(),
      portee: type === 'monde' ? { type: 'monde' } : { type, id },
      gravite: f.get('gravite'),
      titre: f.get('titre').trim(),
      description: f.get('description').trim(),
      consequences: f.get('consequences').split('\n').map(x => x.trim()).filter(Boolean),
      tension: Number(f.get('tension')) || 0
    };
    if (evEdite !== null) {
      data.evenements[evEdite] = ev;
      toast('Événement modifié');
    } else {
      data.evenements.push(ev);
      if (f.get('appliquer') && ev.tension) {
        data.tension.valeur = Math.max(0, Math.min(100, data.tension.valeur + ev.tension));
        toast(`Événement ajouté — tension ${ev.tension > 0 ? '+' : ''}${ev.tension} → ${data.tension.valeur}`);
      } else toast('Événement ajouté');
    }
    annonces = annonces.filter(x => x !== ev.id);
    if (f.get('annoncer')) annonces.push(ev.id);
    ecrire(CLE_ANNONCES, annonces);
    evEdite = null;
    modifie(); rendre();
  });

  $('#contenu').addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    const ds = t.dataset;
    if (ds.evEdit !== undefined) { evEdite = +ds.evEdit; rendre(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (t.id === 'annulerEv') { evEdite = null; rendre(); }
    else if (ds.evSuppr !== undefined) {
      const ev = data.evenements[+ds.evSuppr];
      if (!confirm(`Supprimer « ${ev.titre} » ?`)) return;
      data.evenements.splice(+ds.evSuppr, 1);
      // Garde la chronologie cohérente
      data.historique.forEach(h => { if (h.evenements > +ds.evSuppr) h.evenements--; });
      annonces = annonces.filter(x => x !== ev.id); ecrire(CLE_ANNONCES, annonces);
      evEdite = null; modifie(); rendre();
    }
    else if (ds.evHaut !== undefined || ds.evBas !== undefined) {
      const i = +(ds.evHaut ?? ds.evBas), j = ds.evHaut !== undefined ? i - 1 : i + 1;
      [data.evenements[i], data.evenements[j]] = [data.evenements[j], data.evenements[i]];
      modifie(); rendre();
    }
    // Districts
    else if (ds.district) { districtSel = ds.district; rendre(); }
    else if (ds.ajoutUnite) {
      const d = trouverDistrict(districtSel).d;
      (d.forces[ds.ajoutUnite] ||= []).push({ nom: '', effectif: 0 });
      modifie(); rendre();
    }
    else if (ds.supprUnite) {
      const [f, i] = ds.supprUnite.split(':');
      trouverDistrict(districtSel).d.forces[f].splice(+i, 1);
      modifie(); rendre();
    }
    else if (ds.supprDistrict) {
      const { s, i, d } = trouverDistrict(ds.supprDistrict);
      if (!confirm(`Supprimer définitivement le ${d.nom} (${s.nom}) ?`)) return;
      s.districts.splice(i, 1); districtSel = null; modifie(); rendre();
    }
    // Secteurs
    else if (ds.ajoutDistrict) {
      const s = data.secteurs.find(x => x.id === ds.ajoutDistrict);
      const nom = prompt('Nom du nouveau district :', 'District ');
      if (!nom) return;
      const d = nouveauDistrict(s.id, nom);
      s.districts.push(d); districtSel = d.id;
      onglet = 'districts'; document.querySelectorAll('#onglets button').forEach(x => { x.classList.toggle('active', x.dataset.onglet === 'districts'); x.setAttribute('aria-selected', x.dataset.onglet === 'districts'); });
      modifie(); rendre();
    }
    else if (t.id === 'ajoutZone') {
      const d0 = trouverDistrict(districtSel).d || data.secteurs[0].districts[0];
      (data.zones ||= []).push({ id: 'z-' + Date.now().toString(36), nom: 'Nouvelle zone', dieu: 'Nargal', couleur: '#2fbf5b', district: d0.id, centre: [0, 0], rayon: 2 });
      modifie(); rendre();
    }
    else if (ds.supprZone !== undefined) {
      const z = data.zones[+ds.supprZone];
      if (!confirm(`Supprimer « ${z.nom} » ?`)) return;
      data.zones.splice(+ds.supprZone, 1); modifie(); rendre();
    }
    else if (t.id === 'ajoutSecteur') {
      const nom = prompt('Nom du nouveau secteur :');
      if (!nom) return;
      data.secteurs.push({ id: slug(nom), nom, geographique: false, note: '', districts: [] });
      modifie(); rendre();
    }
    else if (ds.supprSecteur) {
      const i = data.secteurs.findIndex(x => x.id === ds.supprSecteur);
      if (!confirm(`Supprimer le secteur ${data.secteurs[i].nom} et tous ses districts ?`)) return;
      data.secteurs.splice(i, 1); modifie(); rendre();
    }
    // Réglages
    else if (ds.supprPalier !== undefined) { data.tension.paliers.splice(+ds.supprPalier, 1); modifie(); rendre(); }
    else if (t.id === 'ajoutPalier') { data.tension.paliers.push({ min: 100, nom: 'Nouveau palier', minutes: 0 }); modifie(); rendre(); }
    else if (ds.supprHist !== undefined) { data.historique.splice(+ds.supprHist, 1); modifie(); rendre(); }
    else if (t.id === 'testGithub') testGithub();
    else if (t.id === 'changerAcces') changerAcces();
    else if (t.id === 'testDiscord') testDiscord();
    else if (t.id === 'importer') $('#fichierImport').click();
  });

  // ---------- 3. Districts ----------
  function trouverDistrict(id) {
    for (const s of data.secteurs) {
      const i = s.districts.findIndex(d => d.id === id);
      if (i >= 0) return { s, i, d: s.districts[i], si: data.secteurs.indexOf(s) };
    }
    return {};
  }
  const COUL = { controle: 'var(--st-controle)', conteste: 'var(--st-conteste)', reconquete: 'var(--st-reconquete)', quarantaine: 'var(--st-quarantaine)', perdu: 'var(--st-perdu)' };
  function navDistricts() {
    return data.secteurs.map(s => `<h4>${esc(s.nom)}</h4>` + s.districts.map(d => `
      <button data-district="${d.id}" class="${d.id === districtSel ? 'on' : ''}"><span>${esc(d.nom)}</span>
      <span class="ds-supporting">${d.influence} % <i class="pt" style="display:inline-block;background:${COUL[d.statut]}"></i></span></button>`).join('')).join('');
  }
  function majNavDistricts() { const n = $('.nav-districts'); if (n) n.innerHTML = navDistricts(); }

  function vueDistricts() {
    if (!districtSel) districtSel = data.secteurs[0] && data.secteurs[0].districts[0] && data.secteurs[0].districts[0].id;
    const { s, i, d, si } = trouverDistrict(districtSel);
    if (!d) return `<div class="deux"><nav class="nav-districts">${navDistricts()}</nav><div class="ds-card carte">Aucun district.</div></div>`;
    const P = `secteurs.${si}.districts.${i}`;
    d.forces ||= { confederation: [], cultistes: [] };
    d.pertes ||= { confederation: {}, cultistes: {} };
    d.civils ||= {};
    const nomsUnites = [...new Set(data.secteurs.flatMap(x => x.districts.flatMap(y => C.FACTIONS.flatMap(f => ((y.forces || {})[f] || []).map(u => u.nom)))))].filter(Boolean);

    const forces = f => `<div style="--c:var(--${f === 'confederation' ? 'confed' : 'cult'})">
      <h3 style="margin-top:0">${esc(data.factions[f].court)}</h3>
      <div class="unites-ed">${(d.forces[f] || []).map((u, j) => `
        <div class="unite-ed"><input data-bind="${P}.forces.${f}.${j}.nom" list="unitesConnues" placeholder="Nom de l'unité">
        <input class="num" data-bind="${P}.forces.${f}.${j}.effectif" data-type="valeur" placeholder="0">
        <button data-suppr-unite="${f}:${j}" title="Retirer">✕</button></div>`).join('') || '<div class="vide">Aucune unité.</div>'}</div>
      <button class="ds-btn ds-btn-outline ds-btn-sm" style="margin-top:8px" data-ajout-unite="${f}">+ Ajouter une unité</button></div>`;

    return `<div class="deux"><nav class="nav-districts">${navDistricts()}</nav><div>
    <section class="ds-card carte"><h2 class="ds-section-title">${esc(d.nom)}</h2><p class="ds-supporting aide">Secteur ${esc(s.nom)}. Les modifications sont enregistrées automatiquement dans le brouillon.</p>
      <div class="grille">
        <label class="champ"><span>Statut</span><select data-bind="${P}.statut" data-maj="nav">${Object.entries(data.statuts).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <label class="champ"><span>Tendance</span><select data-bind="${P}.tendance">${Object.entries(C.TENDANCES).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <div class="champ" style="grid-column:span 2"><span>Influence cultiste (%)</span><div class="ligne">
          <input type="range" min="0" max="100" data-bind="${P}.influence" data-type="nombre" data-maj="nav" style="flex:1">
          <input type="number" min="0" max="100" class="num" data-bind="${P}.influence" data-type="nombre" data-maj="nav" style="width:80px"></div></div>
        <label class="champ"><span>Supériorité aérienne</span><select data-bind="${P}.air.niveau"><option value="">Non évaluée</option>${Object.entries(data.niveauxAir || {}).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <label class="champ" style="grid-column:span 2"><span>Justification aérienne</span><input data-bind="${P}.air.note"></label>
        <label class="champ large case"><input type="checkbox" data-bind="${P}.quarantaine" data-maj="nav"> Zone en quarantaine (hachures sur la carte, indépendant du statut)</label>
        <label class="champ large"><span>Note de situation (optionnelle)</span><textarea data-bind="${P}.note" rows="2"></textarea></label>
      </div>
      <p class="ds-supporting" style="margin:14px 0 0">Pour tous les chiffres : <code>12000</code> · <code>~12000</code> pour une estimation · <code>?</code> ou <code>CLASSIFIÉ</code> pour une donnée inconnue.</p>
    </section>
    <section class="ds-card carte"><h2 class="ds-section-title">Population civile</h2><div class="grille">
      ${C.CIVILS.map(([k, l]) => `<label class="champ"><span>${l}</span><input class="num" data-bind="${P}.civils.${k}" data-type="valeur"></label>`).join('')}</div></section>
    <section class="ds-card carte"><h2 class="ds-section-title">Effectifs</h2><p class="ds-supporting aide">Le total de chaque faction est calculé automatiquement. Côté cultiste, vous pouvez classer les forces par Dieu.</p>
      <div class="factions-ed">${forces('confederation')}${forces('cultistes')}</div>
      <datalist id="unitesConnues">${nomsUnites.map(n => `<option value="${esc(n)}">`).join('')}</datalist></section>
    <section class="ds-card carte"><h2 class="ds-section-title">Pertes militaires</h2><div class="pertes-ed"><span></span>${C.PERTES.map(([, l]) => `<span>${l}</span>`).join('')}
      ${C.FACTIONS.map(f => `<span>${esc(data.factions[f].court)}</span>${C.PERTES.map(([k]) => `<input class="num" data-bind="${P}.pertes.${f}.${k}" data-type="valeur">`).join('')}`).join('')}</div></section>
    <details class="ds-card carte"><summary class="avance">Avancé : nom, pays couverts, suppression</summary>
      <div class="grille" style="margin-top:14px">
        <label class="champ"><span>Nom du district</span><input data-bind="${P}.nom" data-maj="nav"></label>
        <label class="champ large"><span>Pays couverts — un par ligne, noms anglais de la carte</span><textarea data-bind="${P}.pays" data-type="lignes" rows="5">${esc((d.pays || []).join('\n'))}</textarea>
          <small>Un district sans pays n'apparaît pas sur la carte, mais reste consultable dans les listes.</small></label>
        <div class="champ large"><button class="ds-btn ds-btn-outline danger" data-suppr-district="${d.id}" style="align-self:flex-start">Supprimer ce district</button></div>
      </div></details>
    </div></div>`;
  }

  function slug(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-3);
  }
  function nouveauDistrict(secteurId, nom) {
    return {
      id: slug(nom), nom, pays: [], statut: 'controle', influence: 0, tendance: 'stable',
      civils: { population: 0, impliques: 0, deplaces: 0, disparus: 0, deces: 0 },
      forces: { confederation: [], cultistes: [] },
      pertes: { confederation: { tues: 0, blesses: 0, disparus: 0 }, cultistes: { tues: 0, blesses: 0, disparus: 0 } },
      note: ''
    };
  }

  // ---------- Zones cultistes (taches sur la carte) ----------
  function vueZones() {
    data.zones ||= [];
    const optDistricts = sel => data.secteurs.filter(s => s.geographique !== false).map(s => `<optgroup label="${esc(s.nom)}">${s.districts.map(d => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${esc(d.nom)}</option>`).join('')}</optgroup>`).join('');
    return `<section class="ds-card carte"><h2 class="ds-section-title">Zones cultistes</h2>
      <p class="ds-supporting aide">Chaque zone est une tache dessinée sur la carte, découpée sur les terres. Le centre se donne en longitude / latitude (ex. Brasilia : -47,9 / -15,8), le rayon en degrés (1° ≈ 110 km).</p>
      <div class="ligne"><button class="ds-btn ds-btn-primary" type="button" id="ajoutZone">Ajouter une zone</button></div></section>
      ${data.zones.map((z, i) => `<section class="ds-card carte"><div class="grille">
        <label class="champ"><span>Nom</span><input data-bind="zones.${i}.nom"></label>
        <label class="champ"><span>Dieu ou faction</span><input data-bind="zones.${i}.dieu" list="dieuxConnus"></label>
        <label class="champ"><span>Couleur</span><input type="color" data-bind="zones.${i}.couleur"></label>
        <label class="champ"><span>District concerné</span><select data-bind="zones.${i}.district">${optDistricts(z.district)}</select></label>
        <label class="champ"><span>Longitude</span><input type="number" step="0.1" class="num" data-bind="zones.${i}.centre.0" data-type="nombre"></label>
        <label class="champ"><span>Latitude</span><input type="number" step="0.1" class="num" data-bind="zones.${i}.centre.1" data-type="nombre"></label>
        <label class="champ"><span>Rayon (degrés)</span><input type="number" step="0.1" min="0.2" class="num" data-bind="zones.${i}.rayon" data-type="nombre"></label>
        <div class="champ" style="justify-content:flex-end"><button class="ds-btn ds-btn-outline ds-btn-sm danger" type="button" data-suppr-zone="${i}">Supprimer la zone</button></div>
      </div></section>`).join('')}
      <datalist id="dieuxConnus">${[...new Set(data.zones.map(z => z.dieu).filter(Boolean))].map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
  }

  // ---------- Secteurs ----------
  function vueSecteurs() {
    return `<section class="ds-card carte"><h2 class="ds-section-title">Secteurs</h2>
      <p class="ds-supporting aide">Un secteur « hors carte » (non géographique) apparaît dans les listes de la carte avec ses districts, sans zone dessinée.</p>
      <button class="ds-btn ds-btn-outline" id="ajoutSecteur">+ Nouveau secteur</button></section>
      ${data.secteurs.map((s, i) => `<section class="ds-card carte">
        <div class="grille">
          <label class="champ"><span>Nom</span><input data-bind="secteurs.${i}.nom"></label>
          <div class="champ"><span>Type</span><div class="ds-supporting" style="padding:8px 0">${s.geographique === false ? 'Hors carte' : 'Géographique'} · ${s.districts.length} districts</div></div>
          <label class="champ large"><span>Note du secteur (optionnelle)</span><textarea data-bind="secteurs.${i}.note" rows="2"></textarea></label>
        </div>
        <div class="ligne" style="margin-top:12px">
          <button class="ds-btn ds-btn-outline ds-btn-sm" data-ajout-district="${s.id}">+ Ajouter un district</button>
          <button class="ds-btn ds-btn-outline ds-btn-sm danger" data-suppr-secteur="${s.id}">Supprimer le secteur</button>
        </div></section>`).join('')}`;
  }

  // ---------- Réglages ----------
  function vueReglages() {
    const P = data.tension.paliers;
    return `
    <section class="ds-card carte"><h2 class="ds-section-title">Publication GitHub</h2>
      <p class="ds-supporting aide">Le bouton « Publier » envoie data.json sur votre dépôt GitHub : la carte se met à jour pour tout le monde en une à deux minutes. Ces informations restent dans <strong>ce navigateur uniquement</strong>.</p>
      <div class="grille">
        <label class="champ"><span>Compte GitHub</span><input id="cfgOwner" value="${esc(config.owner || '')}"></label>
        <label class="champ"><span>Dépôt</span><input id="cfgRepo" value="${esc(config.repo || '')}"></label>
        <label class="champ"><span>Branche</span><input id="cfgBranch" value="${esc(config.branch || '')}" placeholder="(branche par défaut)"></label>
        <label class="champ large"><span>Jeton d'accès (fine-grained token)</span><input id="cfgToken" type="password" value="${esc(config.token || '')}" autocomplete="off"><small>Droit requis : Contents → Read and write, sur ce dépôt uniquement. Voir LISEZMOI.</small></label>
      </div>
      <div class="ligne" style="margin-top:12px"><button class="ds-btn ds-btn-outline" id="testGithub">Tester la connexion</button></div>
    </section>
    <section class="ds-card carte"><h2 class="ds-section-title">Accès au poste de commandement</h2>
      <p class="ds-supporting aide">Change l'identifiant et le mot de passe pour tout le monde (le fichier acces.json est publié sur GitHub). Au moins 12 caractères.</p>
      <div class="grille">
        <label class="champ"><span>Nouvel identifiant</span><input id="nvId" autocomplete="off"></label>
        <label class="champ"><span>Nouveau mot de passe</span><input id="nvMdp" type="password" autocomplete="new-password"></label>
        <label class="champ"><span>Confirmer le mot de passe</span><input id="nvMdp2" type="password" autocomplete="new-password"></label>
      </div>
      <div class="ligne" style="margin-top:0.75rem"><button class="ds-btn ds-btn-outline" type="button" id="changerAcces">Changer les accès</button></div>
    </section>
    <section class="ds-card carte"><h2 class="ds-section-title">Annonces Discord</h2>
      <p class="ds-supporting aide">Webhook d'un salon Discord (Paramètres du salon → Intégrations → Webhooks). Les événements cochés « Annoncer » y sont postés à la publication, ainsi que les changements de palier de tension.</p>
      <div class="grille">
        <label class="champ large"><span>URL du webhook</span><input id="cfgWebhook" type="password" value="${esc(config.webhook || '')}" autocomplete="off"></label>
        <label class="champ large"><span>Adresse publique de la carte</span><input id="cfgSite" value="${esc(config.site || '')}" placeholder="https://pseudo.github.io/front-des-cendres/"><small>Pour les liens dans les messages Discord.</small></label>
      </div>
      <div class="ligne" style="margin-top:12px"><button class="ds-btn ds-btn-outline" id="testDiscord">Envoyer un message de test</button></div>
    </section>
    <section class="ds-card carte"><h2 class="ds-section-title">Paliers de tension</h2>
      <p class="ds-supporting aide">« Seuil » = tension à partir de laquelle le palier s'active. « Minutes » = temps avant minuit affiché sur l'horloge.</p>
      ${P.map((p, i) => `<div class="grille" style="grid-template-columns:70px 1fr 90px 90px 40px;margin-bottom:8px;align-items:end">
        <div class="champ"><span>Palier</span><div class="palier-num">${i + 1}</div></div>
        <label class="champ"><span>Nom</span><input data-bind="tension.paliers.${i}.nom"></label>
        <label class="champ"><span>Seuil</span><input type="number" class="num" data-bind="tension.paliers.${i}.min" data-type="nombre"></label>
        <label class="champ"><span>Minutes</span><input type="number" step="0.5" class="num" data-bind="tension.paliers.${i}.minutes" data-type="nombre"></label>
        <button class="ds-btn ds-btn-outline ds-btn-sm danger" data-suppr-palier="${i}" ${P.length <= 1 ? 'disabled' : ''}>✕</button></div>`).join('')}
      <button class="ds-btn ds-btn-outline ds-btn-sm" id="ajoutPalier">+ Ajouter un palier</button>
    </section>
    <section class="ds-card carte"><h2 class="ds-section-title">Factions et statuts</h2><div class="grille">
      ${C.FACTIONS.map(f => `<label class="champ"><span>Nom court · ${f}</span><input data-bind="factions.${f}.court"></label>`).join('')}
      ${Object.keys(data.statuts).map(k => `<label class="champ"><span>Statut · ${k}</span><input data-bind="statuts.${k}"></label>`).join('')}
    </div></section>
    <section class="ds-card carte"><h2 class="ds-section-title">Chronologie (${data.historique.length} points)</h2>
      <p class="ds-supporting aide">Chaque publication peut enregistrer un point : la carte peut ensuite « rejouer » le conflit avec le curseur du bas.</p>
      <div class="hist">${data.historique.map((h, i) => `<div><span class="d">${esc(h.date)}</span><span class="ds-supporting">Tension ${h.tension} · ${h.evenements} év.</span>
        <button class="ds-btn ds-btn-outline ds-btn-sm danger" data-suppr-hist="${i}">✕</button></div>`).reverse().join('') || '<div class="vide">Aucun point.</div>'}</div>
    </section>
    <section class="ds-card carte"><h2 class="ds-section-title">Fichier</h2>
      <p class="ds-supporting aide">Secours : importer un data.json remplace le brouillon (rien n'est publié tant que vous ne cliquez pas sur Publier).</p>
      <button class="ds-btn ds-btn-outline" id="importer">Importer un data.json</button><input type="file" id="fichierImport" accept=".json,application/json" hidden>
    </section>`;
  }
  // Champs de configuration (hors data.json)
  $('#contenu').addEventListener('input', e => {
    const map = { cfgOwner: 'owner', cfgRepo: 'repo', cfgBranch: 'branch', cfgToken: 'token', cfgWebhook: 'webhook', cfgSite: 'site' };
    if (map[e.target.id]) { config[map[e.target.id]] = e.target.value.trim(); AUTH.ecrireConfig(config); }
  });
  $('#contenu').addEventListener('change', async e => {
    if (e.target.id !== 'fichierImport' || !e.target.files[0]) return;
    try {
      const d = JSON.parse(await e.target.files[0].text());
      if (!d.secteurs || !d.tension) throw new Error('structure inattendue');
      data = d; modifie(); rendre(); toast('Fichier importé dans le brouillon');
    } catch (err) { alert('Fichier invalide : ' + err.message); }
  });

  // ---------- GitHub ----------
  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function gh(methode, chemin, corps) {
    if (!config.owner || !config.repo || !config.token) throw new Error('Réglages GitHub incomplets (onglet Réglages).');
    const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${chemin}`, {
      method: methode,
      headers: { Authorization: 'Bearer ' + config.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: corps ? JSON.stringify(corps) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = { 401: 'Jeton invalide ou expiré.', 403: 'Le jeton n\'a pas le droit d\'écrire sur ce dépôt.', 404: 'Dépôt ou fichier introuvable (vérifiez le compte, le dépôt, la branche et les droits du jeton).', 409: 'Conflit de version, réessayez.', 422: 'Requête refusée par GitHub.' }[r.status];
      throw new Error((msg || 'Erreur GitHub ' + r.status) + (j.message ? ` (${j.message})` : ''));
    }
    return j;
  }
  async function testGithub() {
    try {
      const f = await gh('GET', '/contents/data.json' + refBranche());
      toast('Connexion OK — data.json trouvé (' + Math.round(f.size / 1024) + ' ko)');
    } catch (e) { alert(e.message); }
  }
  async function envoyerFichier(chemin, contenu, message) {
    let sha;
    try { sha = (await gh('GET', '/contents/' + chemin + refBranche())).sha; } catch (e) { if (!/introuvable/.test(e.message)) throw e; }
    const corps = { message, content: b64(contenu) };
    if (sha) corps.sha = sha;
    if (config.branch) corps.branch = config.branch;
    return gh('PUT', '/contents/' + chemin, corps);
  }
  async function changerAcces() {
    const id = $('#nvId').value.trim(), m1 = $('#nvMdp').value, m2 = $('#nvMdp2').value;
    if (!id) return alert('Indiquez un identifiant.');
    if (m1.length < 12) return alert('Le mot de passe doit contenir au moins 12 caractères.');
    if (m1 !== m2) return alert('Les deux mots de passe ne correspondent pas.');
    try {
      const { acces, appliquer } = await AUTH.creerAcces(id, m1, config);
      await envoyerFichier('acces.json', JSON.stringify(acces, null, 2) + '\n', 'Changement des accès du poste de commandement');
      await appliquer();
      toast('Accès changés. Ils seront actifs pour tous d\'ici une à deux minutes.');
      $('#nvMdp').value = $('#nvMdp2').value = '';
    } catch (e) { alert('Échec : ' + e.message); }
  }
  async function envoyerGithub(contenu, message) {
    const f = await gh('GET', '/contents/data.json' + refBranche());
    const corps = { message, content: b64(contenu), sha: f.sha };
    if (config.branch) corps.branch = config.branch;
    return gh('PUT', '/contents/data.json', corps);
  }
  // Sans branche indiquée, GitHub utilise la branche par défaut du dépôt
  const refBranche = () => config.branch ? '?ref=' + encodeURIComponent(config.branch) : '';

  // ---------- Discord ----------
  const COUL_G = { mineur: 0x5d8fb8, majeur: 0xe3a33b, critique: 0xff3b5c };
  const ICONE_G = { mineur: '🔹', majeur: '🔶', critique: '🚨' };
  function lienPortee(p) {
    if (!config.site) return undefined;
    const base = config.site.replace(/#.*$/, '');
    if (p.type === 'district') { const t = trouverDistrict(p.id); return t.s ? `${base}#${t.s.id}/${p.id}` : base; }
    if (p.type === 'secteur') return `${base}#${p.id}`;
    return base;
  }
  async function discord(payload) {
    if (!config.webhook) throw new Error('Aucun webhook Discord configuré.');
    const r = await fetch(config.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Réseau tactique confédéré', ...payload }) });
    if (!r.ok) throw new Error('Discord a refusé le message (' + r.status + ')');
  }
  function embedEvenement(ev) {
    const fields = [{ name: 'Portée', value: nomPortee(ev.portee), inline: true }];
    if (ev.tension) fields.push({ name: 'Tension', value: `${ev.tension > 0 ? '+' : ''}${ev.tension}`, inline: true });
    if (ev.consequences && ev.consequences.length) fields.push({ name: 'Conséquences', value: ev.consequences.map(c => '• ' + c).join('\n').slice(0, 1000) });
    return {
      title: `${ICONE_G[ev.gravite]} ${ev.titre}`.slice(0, 250), url: lienPortee(ev.portee),
      description: ev.description.slice(0, 3500), color: COUL_G[ev.gravite], fields,
      footer: { text: `${C.GRAVITES[ev.gravite]} · ${ev.date}` }
    };
  }
  function embedPalier() {
    const P = data.tension.paliers, i = C.palier(data.tension.valeur, P);
    return {
      title: `⏱️ Tension mondiale : palier ${i + 1} · ${P[i].nom}`, url: config.site || undefined,
      description: `**${C.heure(C.minutes(data.tension.valeur, P))}** — tension ${data.tension.valeur} / 100`,
      color: i > C.palier(publieTension, P) ? 0xff3b5c : 0x3f8f6b, footer: { text: data.meta.dateRP }
    };
  }
  async function testDiscord() {
    try { await discord({ content: '✅ Test de connexion du Poste de commandement.' }); toast('Message de test envoyé'); }
    catch (e) { alert(e.message); }
  }

  // ---------- Publication ----------
  $('#btnTelecharger').onclick = () => {
    const blob = new Blob([versJSON(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'data.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  $('#btnPublier').onclick = () => {
    const dlg = $('#dlgPublier');
    const h = data.historique, dernier = h[h.length - 1];
    const memeDate = dernier && dernier.date === data.meta.dateRP;
    const aAnnoncer = data.evenements.filter(e => annonces.includes(e.id));
    const P = data.tension.paliers;
    const changePalier = C.palier(publieTension, P) !== C.palier(data.tension.valeur, P);
    dlg.innerHTML = `<button class="ds-btn ds-btn-ghost ds-btn-sm fermer" type="button" onclick="this.closest('dialog').close()" aria-label="Fermer">${C.ICONES.close}</button>
      <h2 class="ds-display" id="pubTitre">Publier la mise à jour</h2>
      <p class="ds-supporting">La carte sera à jour pour tous les joueurs d'ici une à deux minutes.</p>
      <label class="case"><input type="checkbox" id="pSnap" checked> ${memeDate ? `Mettre à jour le point de chronologie « ${esc(data.meta.dateRP)} »` : `Ajouter un point de chronologie « ${esc(data.meta.dateRP)} »`}</label>
      <h3 class="ds-section-title sous-titre">Annonces Discord</h3>${config.webhook ? '' : '<p class="ds-supporting">Aucun webhook configuré : rien ne sera annoncé.</p>'}
      <div class="pub-liste">
        ${aAnnoncer.map(e => `<label class="case"><input type="checkbox" class="pAnn" value="${e.id}" ${config.webhook ? 'checked' : 'disabled'}> <span class="ds-badge grav ${e.gravite}">${esc(C.GRAVITES[e.gravite])}</span> ${esc(e.titre)}</label>`).join('')}
        ${changePalier ? `<label class="case"><input type="checkbox" id="pPalier" ${config.webhook ? 'checked' : 'disabled'}> Changement de palier : ${esc(P[C.palier(data.tension.valeur, P)].nom)}</label>` : ''}
        ${!aAnnoncer.length && !changePalier ? '<span class="ds-supporting">Rien à annoncer.</span>' : ''}
      </div>
      <div class="ligne"><button class="ds-btn ds-btn-primary" id="pGo">Publier maintenant</button><button class="ds-btn ds-btn-outline" onclick="this.closest('dialog').close()">Annuler</button></div>
      <div class="pub-journal" id="pLog" hidden></div>`;
    dlg.showModal();
    $('#pGo').onclick = async () => {
      const log = $('#pLog'); log.hidden = false; log.innerHTML = '';
      const note = (t, ok = true) => { log.innerHTML += `<span class="${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span> ${esc(t)}\n`; };
      $('#pGo').disabled = true;
      const choisis = [...document.querySelectorAll('.pAnn:checked')].map(x => x.value);
      const annoncerPalier = $('#pPalier') && $('#pPalier').checked;

      // Copie à publier (le brouillon n'est remplacé qu'en cas de succès)
      const pub = JSON.parse(versJSON(data));
      if ($('#pSnap').checked) {
        const districts = {};
        for (const s of pub.secteurs) for (const d of s.districts) districts[d.id] = { statut: d.statut, influence: d.influence, quarantaine: !!d.quarantaine };
        const snap = { date: pub.meta.dateRP, tension: pub.tension.valeur, distorsion: pub.meta.distorsion || 0, evenements: pub.evenements.length, districts, zones: JSON.parse(JSON.stringify(pub.zones || [])) };
        const ph = pub.historique;
        if (memeDate) ph[ph.length - 1] = snap; else ph.push(snap);
      }
      pub.meta.derniereMaj = new Date().toISOString();
      const contenu = versJSON(pub);
      try {
        await envoyerGithub(contenu, `Mise à jour du front — ${pub.meta.dateRP}`);
        note('data.json publié sur GitHub');
      } catch (e) {
        note(e.message, false);
        note('Rien n\'a été publié. Vous pouvez aussi « Télécharger data.json » et le déposer vous-même sur GitHub.', false);
        $('#pGo').disabled = false;
        return;
      }
      data = pub;
      const ancienneTension = publieTension;
      publie = contenu;
      publieTension = data.tension.valeur;
      effacer(CLE_BROUILLON);

      // Annonces
      const embeds = [];
      if (annoncerPalier) { publieTension = ancienneTension; embeds.push(embedPalier()); publieTension = data.tension.valeur; }
      for (const id of choisis) { const ev = data.evenements.find(e => e.id === id); if (ev) embeds.push(embedEvenement(ev)); }
      for (let i = 0; i < embeds.length; i += 10) {
        try { await discord({ embeds: embeds.slice(i, i + 10) }); note(`${Math.min(10, embeds.length - i)} annonce(s) envoyée(s) sur Discord`); }
        catch (e) { note(e.message, false); }
      }
      annonces = annonces.filter(id => !choisis.includes(id));
      ecrire(CLE_ANNONCES, annonces);
      note('Terminé. La carte se met à jour d\'ici une à deux minutes.');
      $('#avis').hidden = true;
      rendre();
    };
  };

  rendre();
})();
