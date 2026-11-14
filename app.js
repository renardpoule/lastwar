// Carte du front — page publique : navigation, rapport latéral, fiches de renseignement, bandeau, chronologie.
// Le dessin de la carte est dans moteur.js / calques.js / symboles.js / animations.js ; le film, le briefing,
// le comparateur, les courbes, la recherche et la légende sont dans modes.js.
const APP = {};
APP.pret = (async function () {
  const $ = s => document.querySelector(s);
  const esc = C.esc, IC = C.ICONES;
  const ic = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`;
  const ICO = APP.ICO = {
    plus: ic('M12 5v14M5 12h14'), moins: ic('M5 12h14'),
    globe: ic('M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z'),
    calques: ic('M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5'),
    brief: ic('M4 5h16v11H4zM9 20h6M12 16v4M10 8.5v4l3.5-2z'),
    comparer: ic('M12 3v18M4 6h5v12H4zM15 6h5v12h-5zM15 10h5M15 14h5'),
    courbes: ic('M4 19V5M4 19h16M7 15l4-5 3 3 5-7'),
    loupe: ic('M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M15.5 15.5 20 20'),
    fleche: ic('M5 12h14M13 6l6 6-6 6'), film: ic('M7 5v14l11-7z'), pause: ic('M8 5v14M16 5v14'), stop: ic('M7 7h10v10H7z')
  };

  let data, topo, relief;
  $('#map').innerHTML = '<div class="chargement">Liaison avec le réseau tactique…</div>';
  try {
    [data, topo, relief] = await Promise.all([
      fetch('data.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json()),
      fetch('countries.json?v=3').then(r => r.json()),
      fetch('relief.json?v=1').then(r => r.json()).catch(() => null)
    ]);
  } catch (e) {
    $('#map').innerHTML = '<div class="chargement">Liaison perdue : les données de la carte ne répondent pas. Rechargez la page.</div>';
    console.error(e);
    throw e;
  }
  $('#map').innerHTML = '';

  const etat = APP.etat = { niveau: 'monde', secteur: null, district: null, ville: null, replay: null, filtre: 'tous', onglet: 'apercu', volet: 'ouvert' };
  const tel = APP.tel = () => window.matchMedia('(max-width: 760px)').matches;
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)');
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('cc-carte') || '{}'); } catch (e) { return {}; } })();
  const garder = () => { try { localStorage.setItem('cc-carte', JSON.stringify(prefs)); } catch (e) { /* stockage indisponible */ } };
  APP.prefs = prefs; APP.garder = garder;
  if (prefs.globe == null) prefs.globe = !tel() && !reduit.matches;

  CARTE.init({ el: $('#map'), data, topo, relief, globe: prefs.globe, hooks: { surClic, surSurvol, surVue, surGeste: () => APP.surGeste && APP.surGeste() } });
  if (prefs.couches) CARTE.definirCouches(prefs.couches);
  const districts = CARTE._.districts, parId = CARTE._.parId, secteurParId = CARTE._.secteurParId;
  const sc = APP.sc = () => CARTE.scene(etat.replay);
  Object.assign(APP, { data, districts, parId, secteurParId, $, esc });

  // Marges de la carte : la zone que les panneaux flottants laissent libre
  function marges() {
    if (tel()) CARTE.definirMarges({ g: 6, h: 116, d: 6, b: etat.volet === 'ouvert' ? Math.round(innerHeight * 0.5) : 150 });
    else CARTE.definirMarges({ g: 78, h: 122, d: etat.volet === 'ouvert' ? 456 : 24, b: 96 });
  }
  APP.marges = marges;
  if (tel()) etat.volet = 'replie';
  marges();

  // ---------- État affiché ----------
  const statutDe = d => sc().statut(d);
  function influenceMoy(list) {
    let num = 0, den = 0;
    for (const d of list) { const pop = C.parse(d.civils && (d.civils.populationAvant || d.civils.population)).n || 1; num += statutDe(d).influence * pop; den += pop; }
    return den ? num / den : 0;
  }
  APP.influenceMonde = i => { const s = CARTE.scene(i); let num = 0, den = 0; for (const d of districts) { const pop = C.parse(d.civils && (d.civils.populationAvant || d.civils.population)).n || 1; num += s.statut(d).influence * pop; den += pop; } return den ? num / den : 0; };
  const badgeStatut = s => `<span class="ds-badge statut ${esc(s)}">${esc(data.statuts[s] || s)}</span>`;
  const villeParId = id => sc().villes.find(v => v.id === id);
  const nomZone = z => ['Cultistes', 'Entité'].includes(z.dieu) ? z.nom : (/^[aeiouyéèêàâîïôûh]/i.test(z.dieu) ? "Zone d'" : 'Zone de ') + z.dieu;
  APP.nomZone = nomZone;
  const dateCourte = t => (t || '').replace(/\s*\d{4}$/, '');

  // ---------- Navigation (#secteur/district/ville : les liens sont partageables) ----------
  function naviguer(secteur, district, ville) {
    const h = secteur ? '#' + secteur + (district ? '/' + district + (ville ? '/' + ville : '') : '') : '#';
    if (location.hash === h || (h === '#' && !location.hash)) lireHash();
    else location.hash = h;
  }
  APP.naviguer = naviguer;
  function lireHash(anime = true) {
    const [s, d, v] = decodeURIComponent(location.hash.slice(1)).split('/');
    const ville = sc().villes.find(x => x.id === v && x.district === d);
    etat.ville = ville ? ville.id : null;
    if (s && secteurParId[s]) {
      etat.secteur = s;
      if (d && parId[d] && parId[d]._secteur === s) { etat.niveau = 'district'; etat.district = d; }
      else { etat.niveau = 'secteur'; etat.district = null; }
    } else { etat.niveau = 'monde'; etat.secteur = null; etat.district = null; }
    cacherTip();
    // Sur téléphone, la fiche d'une ville s'ouvre d'elle-même : la feuille est dépliée avant de cadrer la carte
    if (etat.ville && tel() && etat.volet !== 'ouvert') definirVolet('ouvert');
    CARTE.naviguer({ niveau: etat.niveau, secteur: etat.secteur, district: etat.district, ville: etat.ville }, anime);
    rendrePanel(); rendreFil();
    $('#panel').scrollTop = 0;
  }
  window.addEventListener('hashchange', () => lireHash());
  function remonter() {
    if (etat.ville) naviguer(etat.secteur, etat.district);
    else if (etat.niveau === 'district') naviguer(etat.secteur);
    else if (etat.niveau === 'secteur') naviguer();
  }
  function allerPortee(p) {
    if (p && p.type === 'district' && parId[p.id]) naviguer(parId[p.id]._secteur, p.id);
    else if (p && p.type === 'secteur' && secteurParId[p.id]) naviguer(p.id);
    else naviguer();
  }
  APP.allerPortee = allerPortee;
  const ouvrirDistrict = d => (etat.niveau === 'monde' || d._secteur !== etat.secteur) ? naviguer(d._secteur) : naviguer(d._secteur, d.id);
  const dossier = x => { location.href = 'secteurs.html#' + x; };
  const lien = x => { const [s, d] = (x || '').split('/'); naviguer(s || undefined, d || undefined); };

  function rendreFil() {
    const crumbs = [{ nav: '', nom: 'Monde' }];
    if (etat.secteur) crumbs.push({ nav: etat.secteur, nom: secteurParId[etat.secteur].nom });
    if (etat.district) crumbs.push({ nav: etat.secteur + '/' + etat.district, nom: parId[etat.district].nom });
    if (etat.ville && villeParId(etat.ville)) crumbs.push({ nav: '', nom: villeParId(etat.ville).nom });
    $('#fil').innerHTML = '<ol>' + crumbs.map((c, i) => {
      const dernier = i === crumbs.length - 1;
      return (i ? '<li class="sep" aria-hidden="true">/</li>' : '') + `<li>${dernier ? `<span aria-current="page">${esc(c.nom)}</span>` : `<button type="button" data-nav="${esc(c.nav)}">${esc(c.nom)}</button>`}</li>`;
    }).join('') + '</ol>';
    $('#fil').hidden = crumbs.length < 2;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-nav]');
    if (!b) return;
    const [s, d, v] = b.dataset.nav.split('/');
    naviguer(s || undefined, d || undefined, v || undefined);
  });

  // =====================================================================================================
  // Fiches de renseignement (infobulles) : type, corps, source, fiabilité, date du dernier rapport
  // =====================================================================================================
  const FIAB = { A: 'confirmé', B: 'probable', C: 'estimation', D: 'signal dégradé' };
  const caviar = n => `<span class="caviar" title="Classifié">${'█'.repeat(n)}</span>`;
  const ficheDl = (x, brume) => x.fiche && x.fiche.length ? `<dl class="f-dl">${x.fiche.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${brume ? caviar(Math.max(3, Math.min(9, String(v).length))) : esc(v)}</dd>`).join('')}</dl>` : '';
  const TYPES_FLOTTE = { surface: 'Division de surface', 'porte-avions': 'Groupe aéronaval', 'sous-marins': 'Flottille sous-marine', recherche: 'Flotte de recherche' };
  const TYPES_FRAPPE = { napalm: 'Bombardement rapproché au napalm', missiles: 'Bombardement intensif, missiles et bombardiers stratégiques' };
  const TYPES_LIGNE = { stabilisee: 'Front stabilisé', fortifiee: 'Ligne fortifiée', renforcee: 'Ligne fortement fortifiée' };
  APP.TYPES = { TYPES_FLOTTE, TYPES_FRAPPE, TYPES_LIGNE };
  const coupe = (t, n) => t && t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : (t || '');

  function fiche(hit) {
    if (!hit) return null;
    const s = sc(), o = hit.obj, date = s.date;
    const brume = c => c && s.brouillard(c);
    switch (hit.type) {
      case 'district': {
        const monde = etat.niveau === 'monde' || o._secteur !== etat.secteur;
        if (monde) {
          const S = secteurParId[o._secteur], touches = S.districts.filter(x => statutDe(x).statut !== 'controle').length;
          return { tag: 'Secteur', titre: S.nom, corps: `${touches} district${touches > 1 ? 's' : ''} touché${touches > 1 ? 's' : ''} sur ${S.districts.length}<br>Influence cultiste : <strong>${Math.round(influenceMoy(S.districts))} %</strong>`, source: 'État-major de secteur', fiab: 'A', action: { lib: 'Ouvrir le secteur', fn: () => naviguer(o._secteur) } };
        }
        const st = statutDe(o);
        return { tag: 'District', titre: o.nom, corps: `${badgeStatut(st.statut)}${s.enQuarantaine(o) && st.statut !== 'quarantaine' ? ' ' + badgeStatut('quarantaine') : ''}<br>Influence cultiste : <strong>${st.influence} %</strong>`, source: 'État-major du district', fiab: st.statut === 'perdu' ? 'C' : 'A', action: { lib: 'Ouvrir le district', fn: () => naviguer(o._secteur, o.id) } };
      }
      case 'zone': {
        const d = parId[o.district] || hit.district;
        return { tag: o.halo ? 'Bordure contestée' : 'Zone cultiste', titre: o.halo ? 'Autour : ' + o.nom : o.nom, corps: `${esc(o.dieu || '')}${d ? ' · ' + esc(d.nom) : ''}${o.depuis ? `<br>Depuis le ${esc(o.depuis)}` : ''}${o.halo ? '' : `<br>Ce qui se passe à l'intérieur n'est connu que par ${caviar(7)} et par l'orbite, quand la tempête laisse voir quelque chose.`}`, source: 'Reconnaissance orbitale', fiab: o.halo ? 'C' : 'D', action: d && { lib: 'Ouvrir le district', fn: () => ouvrirDistrict(d) } };
      }
      case 'detruite':
        return { tag: o.type === 'feu' ? 'Feu nucléaire' : 'Zone détruite', titre: o.nom, corps: `${o.date ? esc(o.date) + '<br>' : ''}${esc(o.info || '')}${o.date && o.type !== 'feu' ? `<br>Retombées portées par le vent dominant, ${Math.round(s.semainesDepuis(o.date))} semaine${Math.round(s.semainesDepuis(o.date)) > 1 ? 's' : ''} après la frappe.` : ''}`, source: 'Relevé radiologique', fiab: 'B', action: parId[o.district] && { lib: 'Ouvrir le district', fn: () => naviguer(parId[o.district]._secteur, o.district) } };
      case 'contestation':
        return { tag: 'Zone de contestation', titre: o.nom || '', corps: `${o.date ? 'Depuis le ' + esc(o.date) + '<br>' : ''}${esc(o.info || '')}`, source: 'État-major du district', fiab: 'B', action: parId[o.district] && { lib: 'Ouvrir le district', fn: () => naviguer(parId[o.district]._secteur, o.district) } };
      case 'ligne':
        return { tag: TYPES_LIGNE[o.type] || 'Ligne de front', titre: o.nom || '', corps: `${o.date ? 'Depuis le ' + esc(o.date) + '<br>' : ''}${esc(o.info || '')}`, source: 'Génie confédéré', fiab: 'A', action: parId[o.district] && { lib: 'Ouvrir le district', fn: () => naviguer(parId[o.district]._secteur, o.district) } };
      case 'axe':
        return { tag: o.camp === 'cc' ? 'Offensive confédérée' : 'Offensive cultiste', titre: o.nom, corps: `Semaine du ${esc(o.date)}`, source: o.camp === 'cc' ? 'État-major' : 'Reconnaissance orbitale', fiab: o.camp === 'cc' ? 'A' : 'C' };
      case 'ville': {
        const v = villeParId(o.id) || o, [lib] = VILLES.niveau(v.etat), b = brume(v.coord), d = parId[v.district];
        return { tag: v.capitale ? 'Capitale de secteur' : 'Ville "Too young to die"', titre: v.nom, corps: `État : <strong>${v.etat} %</strong> (${esc(lib.toLowerCase())})<br>Garnison : ${b ? caviar(6) : C.fmt(C.somme(v.garnison.map(u => u.effectif)), true)}`, source: b ? 'Dernier contact radio' : 'Garnison', fiab: b ? 'D' : 'A', action: { lib: 'Ouvrir la fiche', fn: () => naviguer(d._secteur, d.id, v.id) } };
      }
      case 'site': {
        const T = GLYPHES.SITES[o.icone], b = brume(o.coord) && !o.glitch;
        return { tag: o.glitch ? "Laboratoire d'exclusion" : T ? T.nom : 'Site stratégique', titre: o.nom, corps: `${esc(o.info || '')}${o.etat ? `<br><span class="f-etat">${esc(o.etat)}</span>` : ''}${ficheDl(o, b)}`, source: o.glitch ? 'Division de la Recherche' : 'Registre des installations', fiab: b ? 'D' : 'A', action: o.dossier ? { lib: 'Ouvrir le dossier', fn: () => dossier(o.dossier) } : o.lien ? { lib: 'Ouvrir la fiche', fn: () => lien(o.lien) } : null };
      }
      case 'satellite':
        return { tag: o.geo ? 'Satellite géostationnaire' : `Orbite inclinée à ${o.inclinaison}°`, titre: o.nom, corps: `${esc(o.info || '')}${o.etat ? `<br><span class="f-etat">${esc(o.etat)}</span>` : ''}${ficheDl(o)}`, source: 'Contrôle orbital', fiab: 'A', action: o.dossier && { lib: 'Ouvrir le dossier', fn: () => dossier(o.dossier) } };
      case 'flotte':
        return { tag: TYPES_FLOTTE[o.type] || TYPES_FLOTTE.surface, titre: o.nom, corps: `${o.zone ? (/classifi/i.test(o.zone) ? 'Position : ' + caviar(8) : esc(o.zone)) + '<br>' : ''}${esc(o.info || '')}${ficheDl(o)}`, source: 'Marine confédérée', fiab: 'A', action: o.dossier ? { lib: 'Ouvrir le dossier', fn: () => dossier(o.dossier) } : o.lien ? { lib: 'Ouvrir la fiche', fn: () => lien(o.lien) } : null };
      case 'rail':
        return { tag: 'Traverseur', titre: o.nom, corps: `<span class="f-etat">${[o.coupee && 'voie coupée par endroits', o.enTravaux && 'en reconstruction par endroits'].filter(Boolean).join(', ') || 'en service'}</span><br>${esc(o.info || '')}${ficheDl(o)}`, source: 'Administration des Traverseurs', fiab: 'A', action: o.dossier && { lib: 'Ouvrir le dossier', fn: () => dossier(o.dossier) } };
      case 'pion': {
        const T = CARTE._.TYPES_UNITE[o.type], cult = o.type === 'cult', us = o.usure;
        const usure = us != null ? `<br>Usure : <strong>${Math.round(us * 100)} %</strong> de l'effectif d'origine est tombé` : '';
        const corps = o.synthese
          ? `${esc(o.d.nom)}<br>Total : <strong>${C.fmt(o.v)}</strong>${usure}<dl class="f-dl">${o.detail.map(x => `<dt>${esc(x.nom)}</dt><dd>${C.fmt(x.effectif)}</dd>`).join('')}</dl>`
          : `${esc(o.d.nom)}<br>Effectif : <strong>${C.fmt(o.v)}</strong>${o.total ? `<br>${o.nb} groupements, ${C.fmt(o.total)} au total` : ''}${usure}`;
        return { tag: cult ? 'Force hostile' : 'Unité confédérée', titre: T.nom, corps, source: cult ? 'Estimation orbitale' : 'État-major du district', fiab: s.forcesEstimees ? 'C' : cult ? (o.inconnu ? 'D' : 'C') : 'A', action: { lib: 'Ouvrir le district', fn: () => naviguer(o.d._secteur, o.d.id) } };
      }
      case 'evenement': {
        const evs = hit.extra && hit.extra.length > 1 ? hit.extra : null, T = GLYPHES.EVTS[o.icone];
        if (evs) return { tag: `${evs.length} événements`, titre: 'Semaine du ' + date, corps: `<ul class="f-liste">${evs.map(e => `<li><span class="pt ${e.gravite}"></span>${esc(e.titre)}</li>`).join('')}</ul>`, source: 'Journal du réseau', fiab: 'A', action: { lib: 'Ouvrir le premier', fn: () => allerPortee(evs[0].portee) } };
        return { tag: (T ? T[1] : 'Événement') + ' · ' + C.GRAVITES[o.gravite], titre: o.titre, corps: `${esc(o.date)}<br>${esc(coupe(o.description, 230))}`, source: 'Dépêche du ' + dateCourte(o.date), fiab: 'A', action: { lib: 'Y aller', fn: () => allerPortee(o.portee) } };
      }
      case 'frappe':
        return { tag: 'Bombardement', titre: TYPES_FRAPPE[o.type] || 'Bombardement', corps: `${esc(o.nom || '')}${o.date ? ', ' + esc(o.date) : ''}${o.info ? '<br>' + esc(o.info) : ''}`, source: 'Commandement aérien', fiab: 'A' };
    }
    return null;
  }
  APP.fiche = fiche;

  const tip = $('#tip');
  let tipAction = null, tipFixe = false;
  function montrerTip(f, p, fixe) {
    if (!f) { cacherTip(); return; }
    tipAction = f.action || null; tipFixe = !!fixe;
    tip.innerHTML = `<div class="f-tete"><span class="f-tag">${esc(f.tag || '')}</span><span class="f-fiab n${f.fiab}" title="Fiabilité ${f.fiab} : ${FIAB[f.fiab]}">Fiab. ${f.fiab}</span></div>
      <strong class="f-titre">${esc(f.titre || '')}</strong><div class="f-corps">${f.corps || ''}</div>
      <div class="f-pied"><span>Source : ${esc(f.source || 'réseau')}</span><span>Rapport du ${esc(dateCourte(sc().date))}</span></div>
      ${f.action ? (fixe ? `<button class="f-action" type="button">${esc(f.action.lib)}${ICO.fleche}</button>` : `<div class="f-indice">Clic : ${esc(f.action.lib.toLowerCase())}</div>`) : ''}`;
    tip.hidden = false; tip.classList.toggle('fixe', !!fixe);
    const w = tip.offsetWidth, h = tip.offsetHeight, W = innerWidth, H = innerHeight;
    let x = p[0] + 16, y = p[1] + 16;
    if (x + w > W - 8) x = Math.max(8, p[0] - w - 16);
    if (y + h > H - 8) y = Math.max(8, p[1] - h - 16);
    tip.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  function cacherTip() { tip.hidden = true; tipAction = null; tipFixe = false; }
  APP.cacherTip = cacherTip;
  tip.addEventListener('click', e => { if (e.target.closest('.f-action') && tipAction) { const fn = tipAction.fn; cacherTip(); fn(); } });

  function surSurvol(hit, p) {
    if (tipFixe) return;
    $('#map').style.cursor = hit && hit.type !== 'mer' ? 'pointer' : '';
    if (!hit || hit.type === 'mer') { cacherTip(); return; }
    montrerTip(fiche(hit), p, false);
  }
  function surClic(hit, p, e) {
    const tactile = e.pointerType === 'touch', etaitFixe = tipFixe;
    cacherTip();
    if (APP.surClicCarte && APP.surClicCarte(hit, p) === false) return;
    if (!hit || hit.type === 'mer') { if (!etaitFixe) remonter(); return; }
    const f = fiche(hit);
    if (!f) return;
    if (tactile && !['district', 'zone'].includes(hit.type)) { montrerTip(f, p, true); return; }
    if (f.action) f.action.fn();
  }
  function surVue() {
    $('#oGlobe').setAttribute('aria-pressed', CARTE.mode() !== 'plan');
    APP.surVue && APP.surVue();
  }

  // =====================================================================================================
  // Rapport latéral
  // =====================================================================================================
  function balance(inf) {
    const i = Math.round(inf);
    return `<div class="balance"><div class="piste" role="img" aria-label="Confédération ${100 - i} %, influence cultiste ${i} %"><span class="c" style="width:${100 - i}%"></span><span class="x" style="width:${i}%"></span></div>
      <div class="legende-b"><span>Confédération <strong>${100 - i} %</strong></span><span>Influence cultiste <strong>${i} %</strong></span></div></div>`;
  }
  const stat = (v, lbl, cls = '') => `<div class="stat ${cls}"><span class="v">${C.fmt(v)}</span><span class="lbl">${lbl}</span></div>`;
  const bloc = (titre, corps, cls = '') => `<section class="bloc ${cls}"><h3>${titre}</h3>${corps}</section>`;
  const vide = vals => vals.every(v => !v.n && !v.cls);
  function blocCivils(a) {
    const c = a.civils;
    return bloc('Population civile', `<div class="stats">${stat(c.population, 'Population', 'big')}${stat(c.impliques, 'Civils impliqués')}${stat(c.deplaces, 'Déplacés')}${stat(c.disparus, 'Disparus')}${stat(c.deces, 'Décès', 'rouge')}</div>`);
  }
  function blocForces(a) {
    const f = a.forces;
    const carte = cle => {
      const fa = f[cle], max = Math.max(1, ...fa.unites.map(u => u.v.n));
      const lignes = fa.unites.length ? fa.unites.map(u => `<div class="unite"><span>${esc(u.nom)}</span><span class="n">${C.fmt(u.v)}</span><span class="ub"><i style="width:${(u.v.n / max * 100).toFixed(1)}%"></i></span></div>`).join('') : '<div class="vide">Aucune force engagée.</div>';
      return `<details class="faction ${cle}" ${fa.unites.length ? 'open' : ''}><summary><span class="pastille" aria-hidden="true"></span><span class="nom">${esc(data.factions[cle].court)}</span><span class="tot">${C.fmt(fa.total, fa.total.n >= 1e7)}</span></summary><div class="unites">${lignes}</div></details>`;
    };
    const a1 = f.confederation.total.n, a2 = f.cultistes.total.n;
    let rapport = '';
    if (a1 && a2) rapport = `<p class="rapport">Rapport de force : <strong>${a1 >= a2 ? `${(a1 / a2).toFixed(1).replace('.', ',')} contre 1 pour la Confédération` : `${(a2 / a1).toFixed(1).replace('.', ',')} contre 1 pour les Cultistes`}</strong></p>`;
    return bloc('Effectifs engagés', carte('confederation') + carte('cultistes') + rapport);
  }
  function blocPertes(a) {
    const ligne = cle => `<tr><td>${esc(data.factions[cle].court)}</td>${C.PERTES.map(([k]) => `<td class="num">${C.fmt(a.pertes[cle][k])}</td>`).join('')}</tr>`;
    return bloc('Pertes militaires', `<div class="tableau"><table><thead><tr><th scope="col">Camp</th>${C.PERTES.map(([, l]) => `<th scope="col" class="num">${l}</th>`).join('')}</tr></thead><tbody>${ligne('confederation')}${ligne('cultistes')}</tbody></table></div>`);
  }
  function nomPortee(p) {
    if (p && p.type === 'district' && parId[p.id]) return parId[p.id].nom;
    if (p && p.type === 'secteur' && secteurParId[p.id]) return 'Secteur ' + secteurParId[p.id].nom;
    return 'Mondial';
  }
  APP.nomPortee = nomPortee;
  function blocEvenements(filtreFn, titre) {
    let evs = sc().evts.filter(filtreFn).slice().reverse();
    const filtres = { tous: 'Tout', majeur: 'Majeurs et critiques', critique: 'Critiques' };
    if (etat.filtre === 'majeur') evs = evs.filter(e => e.gravite !== 'mineur');
    if (etat.filtre === 'critique') evs = evs.filter(e => e.gravite === 'critique');
    let jour = null;
    const html = evs.length ? evs.map(ev => {
      const entete = ev.date !== jour ? `<h4 class="ev-jour">${esc(ev.date)}</h4>` : '';
      jour = ev.date;
      return entete + `<article class="ev ${ev.gravite}">
        <div class="meta"><span class="ds-badge grav ${ev.gravite}">${esc(C.GRAVITES[ev.gravite])}</span>
          <button class="portee" type="button" data-portee='${esc(JSON.stringify(ev.portee))}'>${IC.location}${esc(nomPortee(ev.portee))}</button></div>
        <h4>${esc(ev.titre)}</h4><p>${esc(ev.description)}</p>
        ${ev.consequences && ev.consequences.length ? `<ul>${ev.consequences.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        ${ev.tension ? `<span class="ds-badge dt ${ev.tension > 0 ? 'up' : 'down'}">Tension ${ev.tension > 0 ? '+' : '−'}${Math.abs(ev.tension)}</span>` : ''}</article>`;
    }).join('') : '<p class="vide">Rien de consigné pour ce filtre.</p>';
    return bloc(titre, `<div class="filtres" role="group" aria-label="Filtrer par gravité">${Object.entries(filtres).map(([k, l]) => `<button class="ds-chip" type="button" data-filtre="${k}" aria-pressed="${etat.filtre === k}">${l}</button>`).join('')}</div>${html}`);
  }
  function itemListe(o, navCle, sous) {
    const inf = sous ? influenceMoy(sous) : statutDe(o).influence;
    let droite;
    if (sous) {
      const touches = sous.filter(x => statutDe(x).statut !== 'controle').length;
      droite = o.geographique === false ? '<span class="ds-badge statut horscarte">Hors carte</span>' : `<span class="meta-d">${touches} touché${touches > 1 ? 's' : ''} sur ${sous.length}</span>`;
    } else {
      const st = statutDe(o);
      droite = '<span class="statuts">' + badgeStatut(st.statut) + (st.quarantaine && st.statut !== 'quarantaine' ? badgeStatut('quarantaine') : '') + '</span>';
    }
    return `<button class="item" type="button" data-nav="${esc(navCle)}"><span class="t">${esc(o.nom)}${o._sous ? `<small>${esc(o._sous)}</small>` : ''}</span>${droite}<span class="mini" aria-hidden="true"><i style="width:${Math.round(inf)}%"></i></span></button>`;
  }
  function blocStabilite() {
    const st = sc().stabilite;
    if (!data.meta.stabilite) return '';
    if (!st) return bloc('Stabilité intérieure', '<p class="vide">Non archivée à cette date.</p>');
    const L = [['gouvernement', 'Stabilité gouvernementale'], ['armee', "Loyauté de l'armée"], ['population', 'Soutien de la population']];
    const niveau = v => v >= 80 ? 'haut' : v >= 50 ? 'moyen' : 'bas';
    return bloc('Stabilité intérieure', L.map(([k, lib]) => { const v = Math.max(0, Math.min(100, +st[k] || 0)); return `<div class="stab ${niveau(v)}"><span class="stab-lib">${lib}</span><span class="stab-v">${Math.round(v)} %</span><span class="stab-barre" role="img" aria-label="${lib} : ${Math.round(v)} %"><i style="width:${v}%"></i></span></div>`; }).join(''), 'stabilite');
  }
  function blocFronts() {
    const fronts = districts.filter(d => statutDe(d).statut !== 'controle').sort((a, b) => statutDe(b).influence - statutDe(a).influence);
    if (!fronts.length) return '';
    return bloc('Fronts actifs', `<div class="liste">${fronts.map(d => itemListe({ ...d, _sous: 'Secteur ' + secteurParId[d._secteur].nom }, d._secteur + '/' + d.id)).join('')}</div>`);
  }
  const NIV_AIR = ['totale', 'nette', 'contestee', 'perdue'];
  const badgeAir = n => `<span class="ds-badge air ${esc(n)}">${esc((data.niveauxAir || {})[n] || n)}</span>`;
  function blocAirDistrict(d) {
    if (!d.air || !d.air.niveau) return '';
    return bloc('Supériorité aérienne', `<div class="air-ligne">${badgeAir(d.air.niveau)}${d.air.note ? `<p class="texte">${esc(d.air.note)}</p>` : ''}</div>`);
  }
  function blocAirListe(liste, detail) {
    const avec = liste.filter(d => d.air && d.air.niveau);
    if (!avec.length) return '';
    if (detail) return bloc('Supériorité aérienne', `<ul class="air-liste">${avec.map(d => `<li><span>${esc(d.nom)}</span>${badgeAir(d.air.niveau)}</li>`).join('')}</ul>`);
    const c = {}; avec.forEach(d => { c[d.air.niveau] = (c[d.air.niveau] || 0) + 1; });
    return bloc('Supériorité aérienne', `<ul class="air-liste">${NIV_AIR.filter(n => c[n]).map(n => `<li>${badgeAir(n)}<span>${c[n]} district${c[n] > 1 ? 's' : ''}</span></li>`).join('')}</ul>`);
  }
  function blocVilles(vs) {
    if (!vs.length) return '';
    return bloc('Villes "Too young to die"', `<div class="liste">${vs.map(v => {
      const [lib, cls] = VILLES.niveau(v.etat), d = parId[v.district];
      return `<button class="item" type="button" data-nav="${esc(d._secteur + '/' + d.id + '/' + v.id)}"><span class="t">${esc(v.nom)}</span><span class="ds-badge etat ${cls}">${v.etat} % · ${esc(lib)}</span><span class="mini ville ${cls}" aria-hidden="true"><i style="width:${v.etat}%"></i></span></button>`;
    }).join('')}</div>`);
  }
  // Dépêche de la semaine : texte rédigé (data.depeches[date]) ou, à défaut, relevé des événements du tour
  function depeche() {
    const s = sc(), ev = s.evtsTour, txt = (data.depeches || {})[s.date];
    if (!ev.length && !txt) return '';
    const crit = ev.filter(e => e.gravite === 'critique'), maj = ev.filter(e => e.gravite === 'majeur');
    const cite = l => l.slice(0, 3).map(e => `"${esc(e.titre)}"`).join(', ');
    const auto = `Sur la semaine qui s'achève le ${esc(s.date)}, le réseau a consigné ${ev.length} événement${ev.length > 1 ? 's' : ''}${crit.length ? `, dont ${crit.length} critique${crit.length > 1 ? 's' : ''} (${cite(crit)})` : maj.length ? `, dont ${maj.length} majeur${maj.length > 1 ? 's' : ''} (${cite(maj)})` : ''}, pendant que la tension s'établit à ${Math.round(s.tension)} sur 100.`;
    return `<section class="depeche"><p class="cartouche">Dépêche de la semaine · ${esc(dateCourte(s.date))}</p><p class="texte">${txt ? esc(txt) : auto}</p>
      <button class="lancer" type="button" data-brief>${ICO.brief}Dérouler le briefing</button></section>`;
  }
  function panneauVille(v) {
    const d = parId[v.district], s = secteurParId[d._secteur], [lib, cls] = VILLES.niveau(v.etat);
    const zone = sc().zones.find(z => z.district === d.id), tot = C.somme(v.garnison.map(u => u.effectif));
    return `<div class="p-tete"><p class="cartouche">Fiche de ville · ${esc(d.nom)}, secteur ${esc(s.nom)}</p><h2>${esc(v.nom)}</h2>
      <div class="etat-ville ${cls}"><div class="ev-chiffre"><strong>${v.etat} %</strong><span class="ds-badge etat ${cls}">${esc(lib)}</span></div>
        <div class="piste" role="img" aria-label="État de la ville : ${v.etat} %"><i style="width:${v.etat}%"></i></div></div></div>
      <div class="p-corps"><figure class="illu-ville">${VILLES.dessiner(v, zone && zone.couleur)}<figcaption>Vue reconstituée à partir des derniers rapports, avec un signal qui se dégrade à mesure que la ville tombe, ce qui, pour certaines, ne laisse plus grand-chose à voir.</figcaption></figure>
      ${bloc('Situation', `<p class="texte">${esc(v.description)}</p>`)}
      ${bloc('Garnison présente', `<div class="tableau"><table><tbody>${v.garnison.map(u => `<tr><td>${esc(u.nom)}</td><td class="num">${C.fmt(u.effectif)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total</th><td class="num">${C.fmt(tot)}</td></tr></tfoot></table></div>`)}
      <section class="bloc"><button class="retour" type="button" data-nav="${esc(s.id + '/' + d.id)}">Revenir au ${esc(d.nom)}</button></section></div>`;
  }
  function rendrePanel() {
    const el = $('#panel');
    if (etat.ville && villeParId(etat.ville)) { el.innerHTML = panneauVille(villeParId(etat.ville)); return; }
    const archive = etat.replay !== null;
    const forcesPop = a => {
      if (archive) return { forces: '', pop: '' };
      const civils = vide(Object.values(a.civils)) ? '' : blocCivils(a);
      const forces = a.forces.confederation.unites.length || a.forces.cultistes.unites.length ? blocForces(a) : '';
      const pertes = vide(C.FACTIONS.flatMap(f => Object.values(a.pertes[f]))) ? '' : blocPertes(a);
      return { forces: forces + pertes, pop: civils };
    };
    let tete, onglets;
    if (etat.niveau === 'monde') {
      const compte = {}; let nq = 0;
      districts.forEach(d => { const st = statutDe(d); compte[st.statut] = (compte[st.statut] || 0) + 1; if (st.quarantaine && st.statut !== 'quarantaine') nq++; });
      tete = `<p class="cartouche">Réseau tactique · rapport d'ensemble</p><h2>Situation mondiale</h2>
        <div class="statuts">${Object.keys(data.statuts).filter(s => compte[s]).map(s => `<span class="ds-badge statut ${s}">${compte[s]} ${esc(data.statuts[s]).toLowerCase()}</span>`).join('')}${nq ? `<span class="ds-badge statut quarantaine">dont ${nq} en quarantaine</span>` : ''}</div>${balance(influenceMoy(districts))}`;
      const fp = forcesPop(C.agrege(districts)), geo = data.secteurs.filter(s => s.geographique !== false), org = data.secteurs.filter(s => s.geographique === false);
      onglets = [
        ['apercu', 'Situation', depeche() + blocStabilite() + blocFronts() + bloc('Secteurs géographiques', `<div class="liste">${geo.map(s => itemListe(s, s.id, s.districts)).join('')}</div>`) + (org.length ? bloc('Secteurs organisationnels', `<div class="liste">${org.map(s => itemListe(s, s.id, s.districts)).join('')}</div>`) : '')],
        ['villes', 'Villes', blocVilles(sc().villes.slice().sort((a, b) => a.etat - b.etat))],
        ['forces', 'Forces', (archive ? '' : blocAirListe(districts, false)) + fp.forces],
        ['pop', 'Population', fp.pop],
        ['evt', 'Journal', blocEvenements(() => true, 'Journal des événements')]
      ];
    } else if (etat.niveau === 'secteur') {
      const s = secteurParId[etat.secteur], ids = new Set(s.districts.map(d => d.id)), fp = forcesPop(C.agrege(s.districts));
      tete = `<p class="cartouche">${s.geographique === false ? 'Secteur organisationnel · hors carte' : 'Secteur géographique'} · ${s.districts.length} district${s.districts.length > 1 ? 's' : ''}</p><h2>${esc(s.nom)}</h2>${balance(influenceMoy(s.districts))}`;
      onglets = [
        ['apercu', 'Situation', (s.note && !archive ? `<p class="note">${esc(s.note)}</p>` : '') + bloc('Districts', `<div class="liste">${s.districts.map(d => itemListe(d, s.id + '/' + d.id)).join('') || '<p class="vide">Aucun district.</p>'}</div>`)],
        ['villes', 'Villes', blocVilles(sc().villes.filter(v => ids.has(v.district)))],
        ['forces', 'Forces', (archive ? '' : blocAirListe(s.districts, true)) + fp.forces],
        ['pop', 'Population', fp.pop],
        ['evt', 'Journal', blocEvenements(e => (e.portee.type === 'secteur' && e.portee.id === s.id) || (e.portee.type === 'district' && ids.has(e.portee.id)), 'Journal du secteur')]
      ];
    } else {
      const d = parId[etat.district], s = secteurParId[d._secteur], st = statutDe(d), fl = { hausse: '▲', baisse: '▼', stable: '■' }, fp = forcesPop(C.agrege([d]));
      tete = `<p class="cartouche">District · secteur ${esc(s.nom)}</p><h2>${esc(d.nom)}</h2>
        <div class="statuts">${badgeStatut(st.statut)}${st.quarantaine && st.statut !== 'quarantaine' ? badgeStatut('quarantaine') : ''}${!archive && d.tendance ? `<span class="tendance ${d.tendance}"><span aria-hidden="true">${fl[d.tendance]}</span> ${esc(C.TENDANCES[d.tendance])}</span>` : ''}</div>${balance(st.influence)}`;
      onglets = [
        ['apercu', 'Situation', (d.note && !archive ? `<p class="note">${esc(d.note)}</p>` : '') + blocVilles(sc().villes.filter(v => v.district === d.id))],
        ['forces', 'Forces', (archive ? '' : blocAirDistrict(d)) + fp.forces],
        ['pop', 'Population', fp.pop],
        ['evt', 'Journal', blocEvenements(e => (e.portee.type === 'district' && e.portee.id === d.id) || (e.portee.type === 'secteur' && e.portee.id === s.id), 'Journal du district')]
      ];
    }
    onglets = onglets.filter(o => o[2] && o[2].trim());
    const actif = onglets.find(o => o[0] === etat.onglet) || onglets[0];
    el.innerHTML = `<div class="p-tete">${tete}</div>
      ${onglets.length > 1 ? `<div class="p-onglets" role="tablist" aria-label="Rubriques">${onglets.map(o => `<button class="onglet ${o === actif ? 'actif' : ''}" type="button" role="tab" aria-selected="${o === actif}" data-onglet="${o[0]}">${o[1]}</button>`).join('')}</div>` : ''}
      <div class="p-corps" role="tabpanel">${actif ? actif[2] : '<p class="vide">Rien à signaler à cette date.</p>'}</div>`;
  }
  APP.rendrePanel = rendrePanel;
  $('#panel').addEventListener('click', e => {
    const o = e.target.closest('[data-onglet]');
    if (o) { etat.onglet = o.dataset.onglet; rendrePanel(); $('#panel').scrollTop = 0; return; }
    const f = e.target.closest('[data-filtre]');
    if (f) { etat.filtre = f.dataset.filtre; rendrePanel(); return; }
    const p = e.target.closest('[data-portee]');
    if (p) { allerPortee(JSON.parse(p.dataset.portee)); return; }
    if (e.target.closest('[data-brief]') && APP.briefing) APP.briefing();
  });

  // Volet : replié / ouvert (sur téléphone, une feuille qu'on tire du bas)
  function definirVolet(v) {
    etat.volet = v;
    $('#volet').dataset.etat = v;
    $('#voletPoignee').setAttribute('aria-expanded', v === 'ouvert');
    marges();
  }
  APP.definirVolet = definirVolet;
  (() => {
    const p = $('#voletPoignee'); let y0 = null, bouge = false;
    p.addEventListener('pointerdown', e => { y0 = e.clientY; bouge = false; p.setPointerCapture(e.pointerId); });
    p.addEventListener('pointermove', e => { if (y0 != null && Math.abs(e.clientY - y0) > 24) { bouge = true; definirVolet(e.clientY < y0 ? 'ouvert' : 'replie'); y0 = e.clientY; } });
    p.addEventListener('pointerup', () => { if (!bouge && y0 != null) definirVolet(etat.volet === 'ouvert' ? 'replie' : 'ouvert'); y0 = null; });
    p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); definirVolet(etat.volet === 'ouvert' ? 'replie' : 'ouvert'); } });
  })();
  definirVolet(etat.volet);

  // =====================================================================================================
  // Tension, bandeau, énergie
  // =====================================================================================================
  function horloge(el, min, grand) {
    const P = (a, r) => [50 + r * Math.sin(a * Math.PI / 180), 50 - r * Math.cos(a * Math.PI / 180)];
    const aMin = 360 - min * 6, aH = 360 - min * 0.5;
    const ticks = d3.range(60).map(i => {
      const a = i * 6, long = i % 5 === 0, [x1, y1] = P(a, 44), [x2, y2] = P(a, long ? 36 : 41);
      if (!grand && !long) return '';
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${a >= 270 || a === 0 ? 'rouge' : ''}" stroke-width="${long ? 2 : 1}"/>`;
    }).join('');
    const [ax, ay] = P(270, 46), [bx, by] = P(359.9, 46), [mx, my] = P(aMin, 40), [hx, hy] = P(aH, 25);
    el.innerHTML = `<circle class="cadran" cx="50" cy="50" r="48"/><path class="quart" d="M50 50 L${ax} ${ay} A46 46 0 0 1 ${bx} ${by} Z"/>${ticks}
      <line class="aig-h" x1="50" y1="50" x2="${hx}" y2="${hy}"/><line class="aig-m" x1="50" y1="50" x2="${mx}" y2="${my}"/><circle class="axe" cx="50" cy="50" r="3.5"/>`;
  }
  let palierVu = null;
  function rendreTension() {
    const t = sc().tension, P = data.tension.paliers, i = C.palier(t, P), min = C.minutes(t, P);
    horloge($('#miniClock'), min, false);
    $('#tensionVal').textContent = `${Math.round(t)}`;
    const pb = $('#tensionPalier');
    pb.textContent = `Palier ${i + 1} · ${P[i].nom}`;
    $('#tensionBtn').dataset.palier = i;
    document.body.dataset.palier = i;
    $('#tensionBtn').setAttribute('aria-label', `Tension mondiale ${Math.round(t)} sur 100, palier ${i + 1}, ${P[i].nom}. Voir le détail`);
    $('#tensionDetail').innerHTML = `<p class="cartouche">Horloge de la Confédération${etat.replay !== null ? ' · archive du ' + esc(sc().date) : ''}</p>
      <div class="t-top"><svg id="bigClock" class="horloge" viewBox="0 0 100 100" aria-hidden="true"></svg>
        <div><h2 id="tensionTitre">Palier ${i + 1} · ${esc(P[i].nom)}</h2><p class="heure">${C.heure(min)}</p><p class="texte">Tension mondiale à <strong>${Math.round(t)}</strong> sur 100, soit ${String(Math.round(min * 10) / 10).replace('.', ',')} minute${min >= 2 ? 's' : ''} avant minuit.</p></div></div>
      <div class="t-jauge" role="img" aria-label="Tension ${Math.round(t)} sur 100"><div class="cur" style="left:calc(${t}% - 1px)"></div>${P.map(p => `<span class="tick" style="left:${p.min}%">${p.min}</span>`).join('')}</div>
      <ol class="paliers">${P.map((p, j) => `<li class="pal ${j < i ? 'passe' : j === i ? 'actuel' : ''}" ${j === i ? 'aria-current="step"' : ''}><span class="num">${j + 1}</span><span class="nm">${esc(p.nom)}</span><span class="seuil">à partir de ${p.min}</span></li>`).join('')}</ol>`;
    horloge($('#bigClock'), min, true);
    // Passage de palier : tout l'écran bascule un instant
    if (palierVu !== null && i !== palierVu && APP.basculePalier) APP.basculePalier(i, i > palierVu);
    palierVu = i;
    const voile = $('#voile');
    voile.style.setProperty('--dist', sc().distorsion.toFixed(2));
    voile.style.setProperty('--tension', (t / 100).toFixed(2));
  }
  $('#tensionBtn').addEventListener('click', () => $('#tensionDlg').showModal());
  document.querySelectorAll('.dlg .fermer').forEach(b => { b.innerHTML = IC.close; b.addEventListener('click', () => b.closest('dialog').close()); });
  document.querySelectorAll('dialog.dlg').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  function rendreBandeau() {
    const s = sc(), p = s.pertes, btn = $('#pertesBtn'), corps = s.tuesParCorps;
    const chiffre = (n, lib, cls) => `<span class="chiffre ${cls}"><strong>${C.court(n)}</strong> ${lib}</span>`;
    btn.innerHTML = `<span class="r-titre">Pertes</span>` + (p ? chiffre(p.confederation.tues, 'confédérés', 'cc') + chiffre(p.cultistes.tues, 'cultistes', 'cult') + (p.civils.deces ? chiffre(p.civils.deces, 'civils', 'civ') : '') : '<span class="pale">non archivées</span>');
    btn.setAttribute('aria-label', p ? `Pertes mondiales : ${C.num(p.confederation.tues)} confédérés tués, ${C.num(p.cultistes.tues)} cultistes tués. Voir le détail` : 'Pertes non archivées à cette date');
    const ligne = (lib, v) => `<tr><th scope="row">${lib}</th><td class="num">${C.num(v)}</td></tr>`;
    const secteurs = data.secteurs.filter(x => x.geographique !== false);
    $('#pertesDetail').innerHTML = `<p class="cartouche">${etat.replay !== null ? `Archive du ${esc(s.date)}` : `Au ${esc(data.meta.dateRP)}, d'après les rapports des districts`}</p><h2 id="pertesTitre">Pertes mondiales</h2>
      ${p ? `<div class="p-cols">
        <table class="p-table cc"><caption>${esc(data.factions.confederation.court)}</caption>${ligne('Tués', p.confederation.tues)}${ligne('Blessés', p.confederation.blesses)}${ligne('Disparus', p.confederation.disparus)}</table>
        <table class="p-table cult"><caption>${esc(data.factions.cultistes.court)}</caption>${ligne('Tués', p.cultistes.tues)}${ligne('Blessés', p.cultistes.blesses)}${ligne('Disparus', p.cultistes.disparus)}</table>
        <table class="p-table civ"><caption>Civils</caption>${ligne('Décès', p.civils.deces)}${ligne('Disparus', p.civils.disparus)}</table></div>
        ${corps ? `<table class="p-table large"><caption>Tués confédérés par corps</caption>${C.CORPS.filter(([c]) => corps[c]).map(([c, lib]) => ligne(lib, corps[c])).join('')}</table>` : ''}
        ${etat.replay === null ? `<table class="p-table large"><caption>Tués par secteur</caption><thead><tr><th scope="col">Secteur</th><th scope="col" class="num">Confédérés</th><th scope="col" class="num">Cultistes</th></tr></thead>
          ${secteurs.map(x => { const a = C.agrege(x.districts).pertes; return `<tr><th scope="row">${esc(x.nom)}</th><td class="num">${C.fmt(a.confederation.tues)}</td><td class="num">${C.fmt(a.cultistes.tues)}</td></tr>`; }).join('')}</table>` : ''}`
      : '<p class="texte">Les pertes n\'étaient pas encore consignées dans la chronologie à cette date.</p>'}`;
    // Transmissions : communiqués jusqu'à la date affichée, du plus récent au plus ancien
    const lim = s.dv;
    const coms = (data.communiques || []).map((c, i) => ({ c, i })).filter(o => CARTE.dateVal(o.c.date) <= lim).sort((a, b) => CARTE.dateVal(b.c.date) - CARTE.dateVal(a.c.date) || b.i - a.i).map(o => o.c);
    const item = c => `<span class="t-item ${c.camp === 'cult' ? 'interception' : ''}"><span class="t-date">${esc(dateCourte(c.date))}</span><span class="t-source">${esc(c.camp === 'cult' ? 'Interception' : c.source || 'Diffusion')}</span><q>${esc(c.texte)}</q></span>`;
    const blocT = coms.map(item).join(''), defil = $('#cDefil');
    defil.innerHTML = coms.length ? `<span class="t-groupe">${blocT}</span><span class="t-groupe" aria-hidden="true">${blocT}</span>` : '<span class="t-item pale">Aucune transmission à cette date.</span>';
    defil.classList.toggle('anime', coms.length > 0);
    defil.style.setProperty('--duree', Math.max(24, coms.reduce((n, c) => n + (c.texte || '').length + 22, 0) / 5.5) + 's');
    document.querySelector('.transmissions').hidden = !(data.communiques || []).length;
  }
  $('#pertesBtn').addEventListener('click', () => $('#pertesDlg').showModal());
  $('#energieBtn').addEventListener('click', () => $('#energieDlg').showModal());

  function rendreEnergie() {
    const e = sc().energie, btn = $('#energieBtn');
    btn.hidden = !data.meta.energie;
    if (!data.meta.energie) return;
    if (!e) {
      btn.innerHTML = '<span class="r-titre">Énergie</span><span class="pale">non archivée</span>';
      btn.setAttribute('aria-label', 'Production énergétique non archivée à cette date');
      $('#energieDetail').innerHTML = '<h2 id="energieTitre">Énergie mondiale</h2><p class="texte">La production énergétique n\'était pas encore consignée dans la chronologie à cette date.</p>';
      return;
    }
    const u = ' ' + (e.unite || 'TW'), f = v => String(+v || 0).replace('.', ',');
    const prod = Math.max(+e.production || 0, 0.001), det = +e.detruite || 0, dev = +e.detournee || 0, dispo = Math.max(0, Math.round((prod - det - dev) * 10) / 10), conso = +e.consommation || 0;
    const pc = v => (Math.min(100, v / prod * 100)).toFixed(2) + '%';
    const barre = cls => `<span class="e-barre ${cls}" aria-hidden="true"><i class="e-dispo" style="width:${pc(dispo)}"></i><i class="e-detruite" style="width:${pc(det)}"></i><i class="e-detournee" style="width:${pc(dev)}"></i><i class="e-conso" style="left:calc(${pc(conso)} - 1px)"></i></span>`;
    btn.innerHTML = `<span class="r-titre">Énergie</span>${barre('')}<span class="chiffre"><strong>${f(dispo)}</strong> / ${f(conso)}${u}</span>`;
    btn.setAttribute('aria-label', `Énergie : ${f(dispo)}${u} disponibles pour ${f(conso)}${u} consommés. Voir le détail`);
    $('#energieDetail').innerHTML = `<p class="cartouche">${etat.replay !== null ? `Archive du ${esc(sc().date)}` : `Au ${esc(data.meta.dateRP)}`}</p><h2 id="energieTitre">Énergie mondiale</h2>
      ${barre('grande')}
      <ul class="e-legende"><li><i class="e-dispo"></i>Production disponible<strong>${f(dispo)}${u}</strong></li><li><i class="e-detruite"></i>Production détruite<strong>${f(det)}${u}</strong></li><li><i class="e-detournee"></i>Production détournée<strong>${f(dev)}${u}</strong></li><li><i class="e-conso"></i>Consommation<strong>${f(conso)}${u}</strong></li></ul>
      <p class="texte">La Confédération produit <strong>${f(prod)}${u}</strong>, dont ${Math.round(det / prod * 100)} % sont détruits et ${Math.round(dev / prod * 100)} % détournés. ${dispo < conso ? 'Ce qui reste ne couvre plus la consommation.' : `Il reste une marge de ${f(Math.round((dispo - conso) * 10) / 10)}${u}, ce qui n'est pas grand-chose.`}</p>`;
  }
  function rendreArchive() {
    const el = $('#archive');
    if (etat.replay === null) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<strong>Archive du ${esc(sc().date)}</strong><span>La carte telle qu'elle était à cette date, avec ses statuts, ses villes, sa tension et ses événements.</span><button type="button" id="retourDirect">Revenir au direct</button>`;
    $('#retourDirect').onclick = () => APP.allerA(null);
  }

  // En-tête
  $('#titre').textContent = data.meta.titre;
  $('#soustitre').textContent = data.meta.sousTitre || '';
  function rendreDate() {
    $('#daterp').textContent = sc().date;
    if (etat.replay !== null) $('#maj').textContent = 'archive';
    else if (data.meta.derniereMaj) { const dt = new Date(data.meta.derniereMaj); $('#maj').textContent = 'synchro ' + dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
    document.body.classList.toggle('en-archive', etat.replay !== null);
  }

  // =====================================================================================================
  // Chronologie : une graduation par tour, hauteur du cran selon la tension
  // =====================================================================================================
  const slider = $('#slider'), sLbl = $('#sliderLbl'), nH = data.historique.length;
  APP.nH = nH;
  if (!nH) document.querySelector('.dock').hidden = true;
  slider.max = nH; slider.value = nH;
  const P = data.tension.paliers;
  $('#friseCrans').innerHTML = data.historique.map((h, i) => `<span class="cran p${C.palier(h.tension, P)}" style="left:${(i / nH * 100).toFixed(2)}%"><i style="height:${(18 + h.tension * 0.62).toFixed(0)}%"></i><b>${esc(dateCourte(h.date))}</b></span>`).join('')
    + `<span class="cran direct p${C.palier(data.tension.valeur, P)}" style="left:100%"><i style="height:${(18 + data.tension.valeur * 0.62).toFixed(0)}%"></i><b>Direct</b></span>`;
  function rendreTout() {
    rendreDate(); rendreTension(); rendrePanel(); rendreFil(); rendreArchive(); rendreBandeau(); rendreEnergie();
    const v = etat.replay === null ? nH : etat.replay;
    slider.value = v;
    sLbl.innerHTML = etat.replay === null ? `<b>En direct</b><small>${esc(data.meta.dateRP)}</small>` : `<b>Archive</b><small>${esc(data.historique[v].date)}</small>`;
    sLbl.classList.toggle('direct', etat.replay === null);
    slider.setAttribute('aria-valuetext', etat.replay === null ? 'En direct, ' + data.meta.dateRP : 'Archive du ' + data.historique[v].date);
    document.querySelectorAll('.cran').forEach((c, i) => c.classList.toggle('actif', i === v));
    APP.surDate && APP.surDate();
  }
  APP.rendreTout = rendreTout;
  // Aller à une date (index de l'historique, ou null pour le direct)
  APP.allerA = (i) => {
    etat.replay = i == null || i >= nH ? null : Math.max(0, i);
    cacherTip();
    CARTE.definirScene(etat.replay);
    if (etat.ville && !villeParId(etat.ville)) etat.ville = null;
    rendreTout();
  };
  slider.addEventListener('input', () => { APP.arreterFilm && APP.arreterFilm(); APP.allerA(+slider.value >= nH ? null : +slider.value); });

  // Outils
  $('#oPlus').innerHTML = ICO.plus; $('#oMoins').innerHTML = ICO.moins; $('#oGlobe').innerHTML = ICO.globe; $('#oCalques').innerHTML = ICO.calques;
  $('#oBrief').innerHTML = ICO.brief; $('#oComparer').innerHTML = ICO.comparer; $('#oCourbes').innerHTML = ICO.courbes;
  document.querySelector('#btnRecherche .i').innerHTML = ICO.loupe;
  for (const b of document.querySelectorAll('.outils button')) b.title = b.getAttribute('aria-label');
  $('#oPlus').addEventListener('click', () => CARTE.zoomer(1.7));
  $('#oMoins').addEventListener('click', () => CARTE.zoomer(1 / 1.7));
  $('#oGlobe').addEventListener('click', () => {
    prefs.globe = CARTE.mode() === 'plan'; garder();
    if (prefs.globe && CARTE.aCadre()) { CARTE._.cam.prefGlobe = true; naviguer(); } else CARTE.globe(prefs.globe);
    $('#oGlobe').setAttribute('aria-pressed', prefs.globe);
  });
  document.querySelector('.sceau').addEventListener('click', e => { e.preventDefault(); naviguer(); });

  // Démarrage
  lireHash(false);
  rendreTout();
  surVue();
  if (etat.niveau === 'monde') CARTE.intro();
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(marges, 150); });

  // Rechargement automatique si une mise à jour est publiée
  setInterval(async () => {
    if (document.hidden) return;
    try { const d = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json()); if (d.meta.derniereMaj !== data.meta.derniereMaj) location.reload(); } catch (e) { /* hors ligne */ }
  }, 5 * 60 * 1000);
})();
