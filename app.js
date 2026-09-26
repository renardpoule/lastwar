// Carte du front — affichage public
(async function () {
  const $ = s => document.querySelector(s);
  const esc = C.esc, I = C.ICONES;

  let data, topo, districts, parId, secteurParId;
  const etat = { niveau: 'monde', secteur: null, district: null, replay: null, filtre: 'tous' };
  const RANG_GRAV = { mineur: 0, majeur: 1, critique: 2 };

  $('#map').innerHTML = '<div class="chargement">Chargement de la carte…</div>';
  try {
    [data, topo] = await Promise.all([
      fetch('data.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json()),
      // Contours pré-simplifiés (4× moins de points que la version 50m d'origine)
      fetch('countries.json').then(r => r.json())
    ]);
  } catch (e) {
    $('#map').innerHTML = '<div class="chargement">Impossible de lire les données de la carte. Rechargez la page.</div>';
    console.error(e);
    return;
  }
  $('#map').innerHTML = '';

  districts = C.tousDistricts(data);
  parId = Object.fromEntries(districts.map(d => [d.id, d]));
  secteurParId = Object.fromEntries(data.secteurs.map(s => [s.id, s]));

  // ---------- Géométrie : pays → districts → secteurs ----------
  const geoms = topo.objects.countries.geometries;
  const districtDuPays = new Map();
  for (const d of districts) for (const p of d.pays || []) districtDuPays.set(p, d);
  const distDe = g => districtDuPays.get(g.properties.name);
  const sectDe = g => (distDe(g) || {})._secteur;
  for (const d of districts) {
    const gs = geoms.filter(g => distDe(g) === d);
    d._geo = gs.length ? topojson.merge(topo, gs) : null;
  }
  for (const s of data.secteurs) {
    const gs = geoms.filter(g => sectDe(g) === s.id);
    s._geo = gs.length ? topojson.merge(topo, gs) : null;
  }
  const meshPays = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && distDe(a) === distDe(b));
  const meshDist = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && distDe(a) !== distDe(b) && sectDe(a) === sectDe(b));
  const meshSect = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && sectDe(a) !== sectDe(b));

  // ---------- Construction SVG ----------
  const svg = d3.select('#map').append('svg').attr('role', 'img').attr('aria-label', 'Carte des secteurs et districts');
  svg.append('defs').html(`
    <pattern id="hachures" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="1.6" height="5" style="fill:var(--st-quarantaine)" fill-opacity=".6"/>
    </pattern>`);
  const gZoom = svg.append('g');
  const L = {};
  for (const n of ['fond', 'dist', 'hatch', 'bords', 'sel', 'mark', 'lab']) L[n] = gZoom.append('g');

  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath(projection);
  let W = 0, H = 0, k = 1;

  const zoom = d3.zoom().scaleExtent([1, 16]).on('zoom', e => {
    gZoom.attr('transform', e.transform);
    if (e.transform.k !== k) { k = e.transform.k; echelleLabels(); }
  });
  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('click', e => { if (e.target.tagName === 'svg' || e.target.classList.contains('sphere')) remonter(); });

  function construire() {
    const box = $('#map').getBoundingClientRect();
    W = box.width; H = box.height;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const haut = W < 700 ? 60 : 64, bas = 64;
    projection.fitExtent([[10, haut], [W - 10, H - bas]], {
      type: 'MultiPoint', coordinates: [[-180, 0], [180, 0], [0, 84], [0, -57], [-170, 70], [170, 70], [-170, -57], [170, -57]]
    });

    L.fond.selectAll('*').remove();
    L.fond.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
    L.fond.append('path').attr('class', 'ocean-grid').attr('d', path(d3.geoGraticule10()));

    const avecGeo = districts.filter(d => d._geo);
    L.dist.selectAll('path').data(avecGeo, d => d.id).join('path')
      .attr('d', d => path(d._geo))
      .on('mousemove', survol).on('mouseleave', finSurvol).on('click', clicDistrict);

    L.bords.selectAll('*').remove();
    L.bords.append('path').attr('class', 'b-pays').attr('d', path(meshPays));
    L.bords.append('path').attr('class', 'b-district').attr('d', path(meshDist));
    L.bords.append('path').attr('class', 'b-secteur').attr('d', path(meshSect));

    rendre(false);
  }

  // Point d'ancrage (label / marqueur) d'un district ou secteur
  function ancre(o) {
    if (o.label) return projection(o.label);
    return o._geo ? path.centroid(o._geo) : null;
  }

  // Cadre en pixels d'un secteur ou district
  function cadre(o) {
    if (o.cadre) {
      const [[w, s], [e, n]] = o.cadre, pts = [];
      for (let i = 0; i <= 10; i++) {
        const lon = w + (e - w) * i / 10, lat = s + (n - s) * i / 10;
        pts.push(projection([lon, s]), projection([lon, n]), projection([w, lat]), projection([e, lat]));
      }
      return [[d3.min(pts, p => p[0]), d3.min(pts, p => p[1])], [d3.max(pts, p => p[0]), d3.max(pts, p => p[1])]];
    }
    return o._geo ? path.bounds(o._geo) : null;
  }

  function zoomSur(b, anime = true) {
    let t = d3.zoomIdentity;
    if (b) {
      const [[x0, y0], [x1, y1]] = b;
      const haut = 64, bas = 64, dispoH = H - haut - bas;
      const kk = Math.max(1, Math.min(16, 0.88 / Math.max((x1 - x0) / W, (y1 - y0) / dispoH)));
      t = d3.zoomIdentity.translate(W / 2, haut + dispoH / 2).scale(kk).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    }
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (anime && !reduit ? svg.transition().duration(700).ease(d3.easeCubicInOut) : svg).call(zoom.transform, t);
  }

  function cadreVue() {
    if (etat.niveau === 'monde') return null;
    const s = secteurParId[etat.secteur];
    if (etat.niveau === 'district') {
      const d = parId[etat.district];
      const b = d.cadre ? cadre(d) : (d._geo ? path.bounds(d._geo) : null);
      if (b && (b[1][0] - b[0][0]) < W * 0.6) return b;
    }
    return s._geo || s.cadre ? cadre(s) : null;
  }

  // ---------- État affiché (direct ou archive) ----------
  function statutDe(d) {
    if (etat.replay !== null) {
      const s = data.historique[etat.replay].districts[d.id];
      return s || { statut: 'controle', influence: 0 };
    }
    return { statut: d.statut, influence: d.influence };
  }
  const tensionAff = () => etat.replay !== null ? data.historique[etat.replay].tension : data.tension.valeur;
  const evenementsAff = () => etat.replay !== null ? data.evenements.slice(0, data.historique[etat.replay].evenements) : data.evenements;

  function influenceMoy(list) {
    let num = 0, den = 0;
    for (const d of list) {
      const pop = C.parse(d.civils && d.civils.population).n || 1;
      num += statutDe(d).influence * pop; den += pop;
    }
    return den ? num / den : 0;
  }

  const badgeStatut = s => `<span class="ds-badge statut ${esc(s)}">${esc(data.statuts[s] || s)}</span>`;

  // ---------- Rendu carte ----------
  function rendre(anime = true) {
    const sel = etat.niveau === 'monde' ? null : etat.secteur;
    const selSurCarte = sel && secteurParId[sel]._geo;
    L.dist.selectAll('path')
      .attr('class', d => `district ${statutDe(d).statut}`
        + (selSurCarte && d._secteur !== sel ? ' dim' : '')
        + (etat.niveau === 'district' && d.id === etat.district ? ' sel' : ''));

    // Hachures uniquement sur les districts en quarantaine visibles
    const quarantaine = districts.filter(d => d._geo && statutDe(d).statut === 'quarantaine' && !(selSurCarte && d._secteur !== sel));
    L.hatch.selectAll('path').data(quarantaine, d => d.id).join('path').attr('class', 'hatch-over').attr('d', d => path(d._geo));

    // Contour de sélection
    const cible = etat.niveau === 'district' ? parId[etat.district] : etat.niveau === 'secteur' ? secteurParId[etat.secteur] : null;
    L.sel.selectAll('path').data(cible && cible._geo ? [cible] : []).join('path').attr('class', 'contour-sel').attr('d', o => path(o._geo));

    // Labels
    let labs;
    if (etat.niveau === 'monde' || !selSurCarte) {
      labs = data.secteurs.filter(s => s._geo).map(s => ({ id: s.id, l1: s.nom, p: ancre(s), taille: 15 }));
    } else {
      labs = secteurParId[etat.secteur].districts.filter(d => d._geo).map(d => {
        const m = d.nom.match(/^(District)\s+(.*)$/i);
        return { id: d.id, l0: m ? m[1] : null, l1: m ? m[2] : d.nom, p: ancre(d), taille: 12 };
      });
    }
    L.lab.selectAll('text').data(labs.filter(l => l.p), l => l.id).join('text')
      .attr('class', 'label').attr('x', l => l.p[0]).attr('y', l => l.p[1])
      .each(function (l) {
        const t = d3.select(this).text('');
        if (l.l0) t.append('tspan').attr('class', 'l0').attr('x', l.p[0]).attr('dy', '-0.5em').text(l.l0);
        t.append('tspan').attr('class', 'l1').attr('x', l.p[0]).attr('dy', l.l0 ? '1.15em' : '0.35em').text(l.l1);
      });

    // Marqueurs des événements récents (statiques : aucune animation continue)
    const pts = new Map();
    for (const ev of evenementsAff().slice(-6)) {
      const o = ev.portee.type === 'district' ? parId[ev.portee.id] : ev.portee.type === 'secteur' ? secteurParId[ev.portee.id] : null;
      if (!o) continue;
      const p = ancre(o);
      if (!p) continue;
      const off = ev.portee.type === 'secteur' ? -24 : 22;
      const cle = ev.portee.type + ev.portee.id;
      const prev = pts.get(cle);
      if (!prev || RANG_GRAV[ev.gravite] >= RANG_GRAV[prev.ev.gravite]) pts.set(cle, { cle, ev, p, off });
    }
    L.mark.selectAll('g.marker').data([...pts.values()], m => m.cle).join(en => {
      const g = en.append('g');
      g.append('circle').attr('class', 'ring');
      g.append('circle').attr('class', 'dot');
      g.append('title');
      return g;
    })
      .attr('class', m => 'marker ' + m.ev.gravite)
      .on('click', (e, m) => { e.stopPropagation(); allerPortee(m.ev.portee); })
      .each(function (m) { d3.select(this).select('title').text(`${m.ev.date} : ${m.ev.titre}`); });

    echelleLabels();
    zoomSur(cadreVue(), anime);
    rendreTension();
    rendrePanel();
    rendreFil();
    rendreAlerte();
    rendreArchive();
  }

  function echelleLabels() {
    L.lab.selectAll('text').style('font-size', l => (l.taille / k) + 'px').style('stroke-width', (3.2 / k) + 'px');
    L.lab.selectAll('.l0').style('font-size', (12 * 0.62 / k) + 'px');
    L.mark.selectAll('g.marker').attr('transform', m => `translate(${m.p[0]},${m.p[1] + m.off / k})`);
    L.mark.selectAll('.ring').attr('r', 7 / k);
    L.mark.selectAll('.dot').attr('r', 4 / k);
  }

  // ---------- Survol / clics ----------
  const tip = $('#tip');
  let survolCle = null;
  function survol(e, d) {
    const monde = etat.niveau === 'monde';
    const autreSecteur = !monde && d._secteur !== etat.secteur;
    const cle = (monde || autreSecteur) ? 's:' + d._secteur : 'd:' + d.id;
    if (cle !== survolCle) {
      survolCle = cle;
      L.dist.selectAll('path').classed('hover', x => (monde || autreSecteur) ? x._secteur === d._secteur : x.id === d.id);
      if (monde || autreSecteur) {
        const s = secteurParId[d._secteur];
        const touches = s.districts.filter(x => statutDe(x).statut !== 'controle').length;
        tip.innerHTML = `<strong>Secteur ${esc(s.nom)}</strong>${touches} districts touchés sur ${s.districts.length}<br>Influence cultiste : ${Math.round(influenceMoy(s.districts))} %`;
      } else {
        const s = statutDe(d);
        tip.innerHTML = `<strong>${esc(d.nom)}</strong>${badgeStatut(s.statut)}<br>Influence cultiste : ${s.influence} %`;
      }
    }
    tip.hidden = false;
    const zb = $('.mapzone').getBoundingClientRect();
    let x = e.clientX - zb.left + 14, y = e.clientY - zb.top + 14;
    if (x + tip.offsetWidth > zb.width - 8) x = e.clientX - zb.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > zb.height - 70) y = e.clientY - zb.top - tip.offsetHeight - 14;
    tip.style.transform = `translate(${x}px,${y}px)`;
  }
  function finSurvol() {
    survolCle = null;
    L.dist.selectAll('path.hover').classed('hover', false);
    tip.hidden = true;
  }
  function clicDistrict(e, d) {
    e.stopPropagation();
    tip.hidden = true;
    if (etat.niveau === 'monde' || d._secteur !== etat.secteur) naviguer(d._secteur);
    else naviguer(d._secteur, d.id);
  }
  function remonter() {
    if (etat.niveau === 'district') naviguer(etat.secteur);
    else if (etat.niveau === 'secteur') naviguer();
  }
  function allerPortee(p) {
    if (p.type === 'district' && parId[p.id]) naviguer(parId[p.id]._secteur, p.id);
    else if (p.type === 'secteur' && secteurParId[p.id]) naviguer(p.id);
    else naviguer();
  }

  // Navigation via l'URL (#europe/eu-est) : les liens sont partageables sur Discord
  function naviguer(secteur, district) {
    const h = secteur ? '#' + secteur + (district ? '/' + district : '') : '#';
    if (location.hash === h || (h === '#' && !location.hash)) lireHash();
    else location.hash = h;
  }
  function lireHash() {
    const [s, d] = decodeURIComponent(location.hash.slice(1)).split('/');
    if (s && secteurParId[s]) {
      etat.secteur = s;
      if (d && parId[d] && parId[d]._secteur === s) { etat.niveau = 'district'; etat.district = d; }
      else { etat.niveau = 'secteur'; etat.district = null; }
    } else { etat.niveau = 'monde'; etat.secteur = null; etat.district = null; }
    rendre();
    $('#panel').scrollTop = 0;
  }
  window.addEventListener('hashchange', lireHash);

  // ---------- Fil d'Ariane ----------
  function rendreFil() {
    const crumbs = [{ nav: '', nom: 'Monde' }];
    if (etat.secteur) crumbs.push({ nav: etat.secteur, nom: secteurParId[etat.secteur].nom });
    if (etat.district) crumbs.push({ nav: etat.secteur + '/' + etat.district, nom: parId[etat.district].nom });
    $('#fil').innerHTML = '<ol>' + crumbs.map((c, i) => {
      const dernier = i === crumbs.length - 1;
      const el = dernier
        ? `<span aria-current="page">${esc(c.nom)}</span>`
        : `<button class="ds-btn ds-btn-ghost ds-btn-sm" type="button" data-nav="${esc(c.nav)}">${esc(c.nom)}</button>`;
      return (i ? '<li class="sep" aria-hidden="true">/</li>' : '') + `<li>${el}</li>`;
    }).join('') + '</ol>';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-nav]');
    if (!b) return;
    const [s, d] = b.dataset.nav.split('/');
    naviguer(s || undefined, d || undefined);
  });

  // ---------- Panneau latéral ----------
  function balance(inf) {
    const i = Math.round(inf);
    return `<div class="balance"><div class="piste" role="img" aria-label="Confédération ${100 - i} %, influence cultiste ${i} %">
        <span class="c" style="width:${100 - i}%"></span><span class="x" style="width:${i}%"></span></div>
      <div class="legende-b"><span>Confédération <strong>${100 - i} %</strong></span><span>Influence cultiste <strong>${i} %</strong></span></div></div>`;
  }

  function stat(v, lbl, cls = '') {
    return `<div class="stat ${cls}"><span class="v">${C.fmt(v)}</span><span class="lbl">${lbl}</span></div>`;
  }
  function blocCivils(a) {
    const c = a.civils;
    return `<section class="bloc"><h3 class="ds-section-title">Population civile</h3><div class="stats">
      ${stat(c.population, 'Population', 'big')}${stat(c.impliques, 'Civils impliqués')}${stat(c.deplaces, 'Déplacés')}
      ${stat(c.disparus, 'Disparus')}${stat(c.deces, 'Décès', 'rouge')}</div></section>`;
  }

  // Un bloc entièrement à zéro (secteurs organisationnels) n'apprend rien : on le masque
  const vide = vals => vals.every(v => !v.n && !v.cls);
  function blocs(a) {
    const civils = vide(Object.values(a.civils)) ? '' : blocCivils(a);
    const forces = a.forces.confederation.unites.length || a.forces.cultistes.unites.length ? blocForces(a) : '';
    const pertes = vide(C.FACTIONS.flatMap(f => Object.values(a.pertes[f]))) ? '' : blocPertes(a);
    return civils + forces + pertes;
  }

  function blocForces(a) {
    const f = a.forces;
    const carte = cle => {
      const fa = f[cle];
      const max = Math.max(1, ...fa.unites.map(u => u.v.n));
      const lignes = fa.unites.length ? fa.unites.map(u => `
        <div class="unite"><span>${esc(u.nom)}</span><span class="n">${C.fmt(u.v)}</span>
        <span class="ub"><i style="width:${(u.v.n / max * 100).toFixed(1)}%"></i></span></div>`).join('')
        : '<div class="vide">Aucune force signalée.</div>';
      return `<details class="faction ${cle}" ${fa.unites.length ? 'open' : ''}>
        <summary><span class="pastille" aria-hidden="true"></span><span class="nom">${esc(data.factions[cle].court)}</span><span class="tot">${C.fmt(fa.total, fa.total.n >= 1e7)}</span></summary>
        <div class="unites">${lignes}</div></details>`;
    };
    const a1 = f.confederation.total.n, a2 = f.cultistes.total.n;
    let rapport = '';
    if (a1 && a2) {
      const r = a1 >= a2 ? `${(a1 / a2).toFixed(1).replace('.', ',')} contre 1 pour la Confédération` : `${(a2 / a1).toFixed(1).replace('.', ',')} contre 1 pour les Cultistes`;
      rapport = `<p class="rapport">Rapport de force : <strong>${r}</strong></p>`;
    }
    return `<section class="bloc"><h3 class="ds-section-title">Effectifs engagés</h3>${carte('confederation')}${carte('cultistes')}${rapport}</section>`;
  }

  function blocPertes(a) {
    const ligne = cle => `<tr><td>${esc(data.factions[cle].court)}</td>${C.PERTES.map(([k2]) => `<td class="num">${C.fmt(a.pertes[cle][k2])}</td>`).join('')}</tr>`;
    return `<section class="bloc"><h3 class="ds-section-title">Pertes militaires</h3><div class="tableau"><table class="ds-table">
      <thead><tr><th scope="col">Faction</th>${C.PERTES.map(([, l]) => `<th scope="col" class="num">${l}</th>`).join('')}</tr></thead>
      <tbody>${ligne('confederation')}${ligne('cultistes')}</tbody></table></div></section>`;
  }

  function nomPortee(p) {
    if (p.type === 'district' && parId[p.id]) return parId[p.id].nom;
    if (p.type === 'secteur' && secteurParId[p.id]) return 'Secteur ' + secteurParId[p.id].nom;
    return 'Mondial';
  }

  function blocEvenements(filtreFn, titre) {
    let evs = evenementsAff().filter(filtreFn).slice().reverse();
    const filtres = { tous: 'Tous', majeur: 'Majeurs et critiques', critique: 'Critiques' };
    if (etat.filtre === 'majeur') evs = evs.filter(e => e.gravite !== 'mineur');
    if (etat.filtre === 'critique') evs = evs.filter(e => e.gravite === 'critique');
    // Regroupe les événements par date : on cherche d'abord « quand », puis « quoi »
    let dernierJour = null;
    const html = evs.length ? evs.map(ev => {
      const entete = ev.date !== dernierJour ? `<h4 class="ev-jour">${esc(ev.date)}</h4>` : '';
      dernierJour = ev.date;
      return entete + `
      <article class="ev ${ev.gravite}">
        <div class="meta"><span class="ds-badge grav ${ev.gravite}">${esc(C.GRAVITES[ev.gravite])}</span>
          <button class="ds-btn ds-btn-ghost ds-btn-sm portee" type="button" data-portee='${esc(JSON.stringify(ev.portee))}'>${I.location}${esc(nomPortee(ev.portee))}</button></div>
        <h4>${esc(ev.titre)}</h4>
        <p>${esc(ev.description)}</p>
        ${ev.consequences && ev.consequences.length ? `<ul>${ev.consequences.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        ${ev.tension ? `<span class="ds-badge dt ${ev.tension > 0 ? 'up' : 'down'}">Tension ${ev.tension > 0 ? '+' : '−'}${Math.abs(ev.tension)}</span>` : ''}
      </article>`;
    }).join('') : '<p class="vide">Aucun événement pour ce filtre.</p>';
    return `<section class="bloc"><h3 class="ds-section-title">${titre}</h3>
      <div class="filtres" role="group" aria-label="Filtrer par gravité">${Object.entries(filtres).map(([k2, l]) => `<button class="ds-chip" type="button" data-filtre="${k2}" aria-pressed="${etat.filtre === k2}">${l}</button>`).join('')}</div>
      ${html}</section>`;
  }

  function itemListe(o, navCle, sousDistricts) {
    const inf = sousDistricts ? influenceMoy(sousDistricts) : statutDe(o).influence;
    let droite;
    if (sousDistricts) {
      const touches = sousDistricts.filter(x => statutDe(x).statut !== 'controle').length;
      droite = o.geographique === false
        ? '<span class="ds-badge statut horscarte">Hors carte</span>'
        : `<span class="meta-d">${touches} touché${touches > 1 ? 's' : ''} sur ${sousDistricts.length}</span>`;
    } else {
      droite = badgeStatut(statutDe(o).statut);
    }
    return `<button class="item" type="button" data-nav="${esc(navCle)}"><span class="t">${esc(o.nom)}${o._sous ? `<small>${esc(o._sous)}</small>` : ''}</span>${droite}
      <span class="mini" aria-hidden="true"><i style="width:${Math.round(inf)}%"></i></span></button>`;
  }

  // Districts où la Confédération ne tient plus, du plus menacé au moins menacé
  function blocFronts() {
    const fronts = districts.filter(d => statutDe(d).statut !== 'controle')
      .sort((a, b) => statutDe(b).influence - statutDe(a).influence);
    if (!fronts.length) return '';
    return `<section class="bloc"><h3 class="ds-section-title">Fronts actifs</h3><div class="liste">${fronts.map(d => itemListe({ ...d, _sous: 'Secteur ' + secteurParId[d._secteur].nom }, d._secteur + '/' + d.id)).join('')}</div></section>`;
  }

  function rendrePanel() {
    let html;
    if (etat.niveau === 'monde') {
      const compte = {};
      districts.forEach(d => { const s = statutDe(d).statut; compte[s] = (compte[s] || 0) + 1; });
      html = `<div class="p-head"><h2 class="ds-display">Situation mondiale</h2>
        <div class="statuts">${Object.keys(data.statuts).filter(s => compte[s]).map(s => `<span class="ds-badge statut ${s}">${compte[s]} ${esc(data.statuts[s]).toLowerCase()}</span>`).join('')}</div>
        ${balance(influenceMoy(districts))}</div>
        ${blocFronts()}
        <section class="bloc"><h3 class="ds-section-title">Secteurs géographiques</h3><div class="liste">${data.secteurs.filter(s => s.geographique !== false).map(s => itemListe(s, s.id, s.districts)).join('')}</div></section>
        ${data.secteurs.some(s => s.geographique === false) ? `<section class="bloc"><h3 class="ds-section-title">Secteurs organisationnels</h3><div class="liste">${data.secteurs.filter(s => s.geographique === false).map(s => itemListe(s, s.id, s.districts)).join('')}</div></section>` : ''}
        ${blocs(C.agrege(districts))}
        ${blocEvenements(() => true, 'Événements')}`;
    } else if (etat.niveau === 'secteur') {
      const s = secteurParId[etat.secteur];
      const a = C.agrege(s.districts);
      const ids = new Set(s.districts.map(d => d.id));
      html = `<div class="p-head"><h2 class="ds-display">${esc(s.nom)}</h2>
        <p class="ds-supporting">${s.geographique === false ? 'Secteur organisationnel, hors carte' : 'Secteur géographique'}, ${s.districts.length} district${s.districts.length > 1 ? 's' : ''}</p>
        ${balance(influenceMoy(s.districts))}</div>
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}
        <section class="bloc"><h3 class="ds-section-title">Districts</h3><div class="liste">${s.districts.map(d => itemListe(d, s.id + '/' + d.id)).join('') || '<p class="vide">Aucun district.</p>'}</div></section>
        ${blocs(a)}
        ${blocEvenements(e => (e.portee.type === 'secteur' && e.portee.id === s.id) || (e.portee.type === 'district' && ids.has(e.portee.id)), 'Événements du secteur')}`;
    } else {
      const d = parId[etat.district], s = secteurParId[d._secteur], st = statutDe(d);
      const a = C.agrege([d]);
      const fl = { hausse: '▲', baisse: '▼', stable: '■' };
      html = `<div class="p-head"><h2 class="ds-display">${esc(d.nom)}</h2>
        <p class="ds-supporting">Secteur ${esc(s.nom)}</p>
        <div class="statuts">${badgeStatut(st.statut)}
        ${etat.replay === null && d.tendance ? `<span class="tendance ${d.tendance}"><span aria-hidden="true">${fl[d.tendance]}</span> ${esc(C.TENDANCES[d.tendance])}</span>` : ''}</div>
        ${balance(st.influence)}</div>
        ${d.note ? `<p class="note">${esc(d.note)}</p>` : ''}
        ${blocs(a)}
        ${blocEvenements(e => (e.portee.type === 'district' && e.portee.id === d.id) || (e.portee.type === 'secteur' && e.portee.id === s.id), 'Événements récents')}`;
    }
    $('#panel').innerHTML = html;
  }
  $('#panel').addEventListener('click', e => {
    const f = e.target.closest('[data-filtre]');
    if (f) { etat.filtre = f.dataset.filtre; rendrePanel(); return; }
    const p = e.target.closest('[data-portee]');
    if (p) allerPortee(JSON.parse(p.dataset.portee));
  });

  // ---------- Tension mondiale ----------
  function horloge(el, min, grand) {
    const P = (a, r) => [50 + r * Math.sin(a * Math.PI / 180), 50 - r * Math.cos(a * Math.PI / 180)];
    const aMin = 360 - min * 6, aH = 360 - min * 0.5;
    const ticks = d3.range(60).map(i => {
      const a = i * 6, long = i % 5 === 0, [x1, y1] = P(a, 44), [x2, y2] = P(a, long ? 37 : 41);
      if (!grand && !long) return '';
      const rouge = a >= 270 || a === 0;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:var(${rouge ? '--st-perdu' : '--border'})" stroke-width="${long ? 2 : 1}"/>`;
    }).join('');
    const [ax, ay] = P(270, 46), [bx, by] = P(359.9, 46);
    const [mx, my] = P(aMin, 40), [hx, hy] = P(aH, 26);
    el.innerHTML = `
      <circle cx="50" cy="50" r="48" style="fill:var(--ocean);stroke:var(--border)" stroke-width="2"/>
      <path d="M50 50 L${ax} ${ay} A46 46 0 0 1 ${bx} ${by} Z" style="fill:var(--st-perdu)" fill-opacity=".16"/>
      ${ticks}
      <line x1="50" y1="50" x2="${hx}" y2="${hy}" style="stroke:var(--foreground)" stroke-width="4" stroke-linecap="round"/>
      <line x1="50" y1="50" x2="${mx}" y2="${my}" style="stroke:var(--st-perdu)" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="50" cy="50" r="3.5" style="fill:var(--st-perdu)"/>`;
  }

  function rendreTension() {
    const t = tensionAff(), P = data.tension.paliers;
    const i = C.palier(t, P), min = C.minutes(t, P);
    horloge($('#miniClock'), min, false);
    $('#tensionVal').textContent = `${Math.round(t)} / 100`;
    const pb = $('#tensionPalier');
    pb.textContent = `Palier ${i + 1} · ${P[i].nom}`;
    pb.className = 'ds-badge ' + (i >= P.length - 2 ? 'ds-badge-danger' : 'grav majeur');
    $('#tensionBtn').setAttribute('aria-label', `Tension mondiale ${Math.round(t)} sur 100, palier ${i + 1}, ${P[i].nom}. Voir le détail`);

    $('#tensionDetail').innerHTML = `
      <div class="t-top"><svg id="bigClock" viewBox="0 0 100 100" aria-hidden="true"></svg>
        <div><h2 id="tensionTitre" class="ds-display">Palier ${i + 1} · ${esc(P[i].nom)}</h2>
        <p class="heure">${C.heure(min)}</p>
        <p class="ds-supporting">${min > 0 ? `${min.toFixed(1).replace('.', ',')} minutes avant minuit` : 'Minuit atteint'}, tension ${Math.round(t)} sur 100${etat.replay !== null ? ' (archive)' : ''}</p></div></div>
      <div class="t-jauge" role="img" aria-label="Tension ${Math.round(t)} sur 100"><div class="cur" style="left:calc(${t}% - 1px)"></div>
        ${P.map(p => `<span class="tick" style="left:${p.min}%">${p.min}</span>`).join('')}</div>
      <ol class="paliers">${P.map((p, j) => `
        <li class="pal ${j < i ? 'passe' : j === i ? 'actuel' : ''}" ${j === i ? 'aria-current="step"' : ''}>
          <span class="num">${j + 1}</span>
          <span class="nm">${esc(p.nom)}</span>
          <span class="seuil">À partir de ${p.min}, ${p.minutes} min</span>
          <span class="ar">${esc(p.armes)}</span></li>`).join('')}</ol>`;
    horloge($('#bigClock'), min, true);
  }
  $('#tensionBtn').addEventListener('click', () => $('#tensionDlg').showModal());
  document.querySelector('.dlg .fermer').innerHTML = I.close;

  // ---------- Alerte / archive / en-tête ----------
  function rendreAlerte() {
    const el = $('#alerte');
    const dernier = data.evenements[data.evenements.length - 1];
    if (etat.replay !== null || !dernier || dernier.gravite !== 'critique') { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<button type="button" class="alerte-in">${I.warning}<span class="ds-badge">Alerte</span>
      <span><strong>${esc(dernier.titre)}</strong>, ${esc(nomPortee(dernier.portee))}</span><span class="quand">${esc(dernier.date)}</span></button>`;
    el.firstElementChild.onclick = () => allerPortee(dernier.portee);
  }
  function rendreArchive() {
    const el = $('#archive');
    if (etat.replay === null) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<strong>Archive du ${esc(data.historique[etat.replay].date)}</strong><span>Carte, statuts et tension à cette date. Les chiffres détaillés sont ceux d'aujourd'hui.</span>`;
  }

  $('#titre').textContent = data.meta.titre;
  $('#soustitre').textContent = data.meta.sousTitre || '';
  $('#daterp').textContent = data.meta.dateRP;
  if (data.meta.derniereMaj) {
    const dt = new Date(data.meta.derniereMaj);
    $('#maj').textContent = 'Mis à jour le ' + dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- Chronologie ----------
  const slider = $('#slider'), sLbl = $('#sliderLbl'), play = $('#play');
  const nH = data.historique.length;
  if (!nH) $('.timeline').hidden = true;
  slider.max = nH; slider.value = nH;
  function majSlider() {
    const v = +slider.value;
    etat.replay = v >= nH ? null : v;
    sLbl.textContent = etat.replay === null ? 'En direct' : data.historique[v].date;
    sLbl.classList.toggle('live', etat.replay === null);
    slider.setAttribute('aria-valuetext', sLbl.textContent);
    rendre(false);
  }
  slider.addEventListener('input', () => { arreterLecture(); majSlider(); });
  let lecture = null;
  function majPlay() {
    play.innerHTML = lecture ? I.pause : I.play;
    play.setAttribute('aria-label', lecture ? 'Mettre la chronologie en pause' : 'Rejouer le conflit');
  }
  function arreterLecture() { clearInterval(lecture); lecture = null; majPlay(); }
  play.addEventListener('click', () => {
    if (lecture) return arreterLecture();
    slider.value = 0; majSlider();
    lecture = setInterval(() => {
      slider.value = +slider.value + 1; majSlider();
      if (+slider.value >= nH) arreterLecture();
    }, 1400);
    majPlay();
  });
  majPlay();
  sLbl.classList.add('live');

  // ---------- Démarrage ----------
  construire();
  lireHash();
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(construire, 200); });

  // Rechargement automatique si une mise à jour est publiée
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const d = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json());
      if (d.meta.derniereMaj !== data.meta.derniereMaj) location.reload();
    } catch (e) { /* hors ligne */ }
  }, 5 * 60 * 1000);
})();
