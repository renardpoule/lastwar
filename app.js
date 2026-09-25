// Carte du front — affichage public
(async function () {
  const $ = s => document.querySelector(s);
  const esc = C.esc;

  let data, topo, districts, parId, secteurParId;
  const etat = { niveau: 'monde', secteur: null, district: null, replay: null, filtre: 'tous' };

  const COUL_STATUT = {
    controle: '#3f8f6b', conteste: '#e3a33b', reconquete: '#3f93cf', quarantaine: '#e2cf3a', perdu: '#d8284f'
  };
  const COUL_GRAV = { mineur: '#5d8fb8', majeur: '#e3a33b', critique: '#ff3b5c' };
  const RANG_GRAV = { mineur: 0, majeur: 1, critique: 2 };

  $('#map').innerHTML = '<div class="chargement">CONNEXION AU RÉSEAU TACTIQUE…</div>';
  try {
    [data, topo] = await Promise.all([
      fetch('data.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json()),
      fetch('countries-50m.json').then(r => r.json())
    ]);
  } catch (e) {
    $('#map').innerHTML = '<div class="chargement">ÉCHEC DE CONNEXION — data.json illisible</div>';
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
  const meshPays = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
  const meshDist = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && distDe(a) !== distDe(b));
  const meshSect = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && sectDe(a) !== sectDe(b));
  const meshCote = topojson.mesh(topo, topo.objects.countries, (a, b) => a === b);

  // ---------- Construction SVG ----------
  const svg = d3.select('#map').append('svg');
  const defs = svg.append('defs');
  defs.html(`
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="hachures" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="1.6" height="5" fill="#e2cf3a" fill-opacity=".55"/>
    </pattern>`);
  const gZoom = svg.append('g');
  const L = {};
  for (const n of ['fond', 'dist', 'corr', 'hatch', 'bords', 'sel', 'mark', 'lab']) L[n] = gZoom.append('g');

  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath(projection);
  let W = 0, H = 0, k = 1;

  const zoom = d3.zoom().scaleExtent([1, 16]).on('zoom', e => {
    gZoom.attr('transform', e.transform);
    k = e.transform.k;
    echelleLabels();
  });
  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('click', e => { if (e.target.tagName === 'svg' || e.target.classList.contains('sphere')) remonter(); });

  function construire() {
    const box = $('#map').getBoundingClientRect();
    W = box.width; H = box.height;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const haut = W < 700 ? 52 : 56, bas = 56;
    projection.fitExtent([[10, haut], [W - 10, H - bas]], {
      type: 'MultiPoint', coordinates: [[-180, 0], [180, 0], [0, 84], [0, -57], [-170, 70], [170, 70], [-170, -57], [170, -57]]
    });

    L.fond.selectAll('*').remove();
    L.fond.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
    L.fond.append('path').attr('class', 'ocean-grid').attr('d', path(d3.geoGraticule10()));

    const avecGeo = districts.filter(d => d._geo);
    L.dist.selectAll('path').data(avecGeo, d => d.id).join('path')
      .attr('class', 'district cliquable').attr('d', d => path(d._geo))
      .on('mousemove', survol).on('mouseleave', finSurvol).on('click', clicDistrict);
    L.corr.selectAll('path').data(avecGeo, d => d.id).join('path')
      .attr('class', 'corruption').attr('d', d => path(d._geo));
    L.hatch.selectAll('path').data(avecGeo, d => d.id).join('path')
      .attr('class', 'hatch-over').attr('d', d => path(d._geo));

    L.bords.selectAll('*').remove();
    L.bords.append('path').attr('class', 'b-pays').attr('d', path(meshPays));
    L.bords.append('path').attr('class', 'b-pays').attr('d', path(meshCote)).style('stroke', '#39424e').style('stroke-opacity', .9);
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
      const haut = 60, bas = 60, dispoH = H - haut - bas;
      const kk = Math.max(1, Math.min(16, 0.88 / Math.max((x1 - x0) / W, (y1 - y0) / dispoH)));
      t = d3.zoomIdentity.translate(W / 2, haut + dispoH / 2).scale(kk).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    }
    (anime ? svg.transition().duration(850).ease(d3.easeCubicInOut) : svg).call(zoom.transform, t);
  }

  function cadreVue() {
    if (etat.niveau === 'monde') return null;
    const s = secteurParId[etat.secteur];
    if (etat.niveau === 'district') {
      const d = parId[etat.district];
      const b = d.cadre ? cadre(d) : (d._geo ? path.bounds(d._geo) : null);
      if (b && (b[1][0] - b[0][0]) < W * 0.6) return b;
    }
    return cadre(s);
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

  // ---------- Rendu carte ----------
  function rendre(anime = true) {
    const sel = etat.niveau === 'monde' ? null : etat.secteur;
    L.dist.selectAll('path')
      .attr('fill', d => {
        const s = statutDe(d);
        return d3.color(COUL_STATUT[s.statut] || '#555').darker(s.statut === 'perdu' ? 1.6 : 2);
      })
      .classed('dim', d => sel && d._secteur !== sel)
      .classed('sel', d => etat.niveau === 'district' && d.id === etat.district);
    L.corr.selectAll('path').each(function (d) {
      const inf = statutDe(d).influence / 100;
      const o1 = inf * 0.45, o2 = Math.min(0.75, inf * 0.75);
      d3.select(this).style('--o1', o1).style('--o2', o2).style('opacity', o1)
        .classed('pulse', inf >= 0.3)
        .style('display', sel && d._secteur !== sel ? 'none' : null);
    });
    L.hatch.selectAll('path').style('display', d => statutDe(d).statut === 'quarantaine' && !(sel && d._secteur !== sel) ? null : 'none');

    // Contour de sélection
    const cible = etat.niveau === 'district' ? parId[etat.district] : etat.niveau === 'secteur' ? secteurParId[etat.secteur] : null;
    L.sel.selectAll('path').data(cible && cible._geo ? [cible] : []).join('path').attr('class', 'contour-sel').attr('d', o => path(o._geo));

    // Labels
    let labs;
    if (etat.niveau === 'monde') {
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
      })
      .datum(l => l);

    // Marqueurs d'événements récents
    const recents = evenementsAff().slice(-6);
    const pts = new Map();
    for (const ev of recents) {
      const o = ev.portee.type === 'district' ? parId[ev.portee.id] : ev.portee.type === 'secteur' ? secteurParId[ev.portee.id] : null;
      if (!o) continue;
      const p = ancre(o);
      if (!p) continue;
      const off = ev.portee.type === 'secteur' ? -24 : 22;
      const cle = ev.portee.type + ev.portee.id;
      const prev = pts.get(cle);
      if (!prev || RANG_GRAV[ev.gravite] >= RANG_GRAV[prev.ev.gravite]) pts.set(cle, { cle, ev, p, off });
    }
    L.mark.selectAll('g.marker').data([...pts.values()], m => m.cle).join(
      en => {
        const g = en.append('g').attr('class', 'marker').style('cursor', 'pointer');
        g.append('circle').attr('class', 'ring');
        g.append('circle').attr('class', 'dot');
        g.append('title');
        return g;
      })
      .on('click', (e, m) => { e.stopPropagation(); allerPortee(m.ev.portee); })
      .each(function (m) {
        const g = d3.select(this), c = COUL_GRAV[m.ev.gravite];
        g.select('.ring').attr('stroke', c);
        g.select('.dot').attr('fill', c);
        g.select('title').text(`${m.ev.date} — ${m.ev.titre}`);
      });

    echelleLabels();
    const b = cadreVue();
    zoomSur(b, anime);
    rendreTension();
    rendrePanel();
    rendreFil();
    rendreAlerte();
    rendreArchive();
  }

  function echelleLabels() {
    L.lab.selectAll('text').style('font-size', l => (l.taille / k) + 'px').style('stroke-width', (3.2 / k) + 'px');
    L.lab.selectAll('.l0').style('font-size', l => (l.taille * 0.62 / k) + 'px').attr('class', 'l0').style('fill', '#9aa5b3');
    L.mark.selectAll('g.marker').attr('transform', m => `translate(${m.p[0]},${m.p[1] + m.off / k})`);
    L.mark.selectAll('.ring').attr('r', 7 / k);
    L.mark.selectAll('.dot').attr('r', 4 / k);
  }

  // ---------- Survol / clics ----------
  const tip = $('#tip');
  function survol(e, d) {
    const monde = etat.niveau === 'monde';
    const autreSecteur = !monde && d._secteur !== etat.secteur;
    L.dist.selectAll('path').classed('hover', x => (monde || autreSecteur) ? x._secteur === d._secteur : x.id === d.id);
    let html;
    if (monde || autreSecteur) {
      const s = secteurParId[d._secteur];
      const touches = s.districts.filter(x => statutDe(x).statut !== 'controle').length;
      html = `<b>Secteur ${esc(s.nom)}</b>Influence cultiste : ${Math.round(influenceMoy(s.districts))} %<br>${touches} / ${s.districts.length} districts touchés`;
    } else {
      const s = statutDe(d);
      html = `<b>${esc(d.nom)}</b><span class="chip ${s.statut}">${esc(data.statuts[s.statut])}</span><br>Influence cultiste : ${s.influence} %`;
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const zb = $('.mapzone').getBoundingClientRect();
    let x = e.clientX - zb.left + 14, y = e.clientY - zb.top + 14;
    if (x + tip.offsetWidth > zb.width - 8) x = e.clientX - zb.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > zb.height - 60) y = e.clientY - zb.top - tip.offsetHeight - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function finSurvol() {
    L.dist.selectAll('path').classed('hover', false);
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

  // Navigation via l'URL (#europe/eu-est) — les liens sont partageables sur Discord
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
    if (window.innerWidth <= 900 && etat.niveau !== 'monde') { /* reste sur la carte en mobile */ }
    $('#panel').scrollTop = 0;
  }
  window.addEventListener('hashchange', lireHash);

  // ---------- Fil d'Ariane ----------
  function rendreFil() {
    const parts = [`<button data-nav="" class="${etat.niveau === 'monde' ? 'cur' : ''}">Monde</button>`];
    if (etat.secteur) parts.push('<span class="sep">›</span>', `<button data-nav="${etat.secteur}" class="${etat.niveau === 'secteur' ? 'cur' : ''}">${esc(secteurParId[etat.secteur].nom)}</button>`);
    if (etat.district) parts.push('<span class="sep">›</span>', `<button class="cur" data-nav="${etat.secteur}/${etat.district}">${esc(parId[etat.district].nom)}</button>`);
    $('#fil').innerHTML = parts.join('');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-nav]');
    if (!b) return;
    const [s, d] = b.dataset.nav.split('/');
    naviguer(s || undefined, d || undefined);
  });

  // ---------- Panneau latéral ----------
  function barre(inf) {
    const i = Math.round(inf);
    return `<div class="bar"><div class="track"><div class="fill" style="width:${i}%"></div></div>
      <div class="legend"><span class="c">Confédération ${100 - i} %</span><span class="x">Influence cultiste ${i} %</span></div></div>`;
  }

  function blocCivils(a) {
    const c = a.civils;
    return `<section class="bloc"><h3>Population civile</h3><div class="stats">
      <div class="stat big"><span class="lbl">Population</span><span class="v">${C.fmt(c.population)}</span></div>
      <div class="stat"><span class="lbl">Civils impliqués</span><span class="v">${C.fmt(c.impliques)}</span></div>
      <div class="stat"><span class="lbl">Déplacés</span><span class="v">${C.fmt(c.deplaces)}</span></div>
      <div class="stat"><span class="lbl">Disparus</span><span class="v">${C.fmt(c.disparus)}</span></div>
      <div class="stat rouge"><span class="lbl">Décès</span><span class="v">${C.fmt(c.deces)}</span></div>
    </div></section>`;
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
        <summary><span class="nom">${esc(data.factions[cle].court)}</span><span class="tot">${C.fmt(fa.total)}</span></summary>
        <div class="unites">${lignes}</div></details>`;
    };
    const a1 = f.confederation.total.n, a2 = f.cultistes.total.n;
    let rapport = '';
    if (a1 && a2) {
      const r = a1 >= a2 ? `${(a1 / a2).toFixed(1).replace('.', ',')} : 1 en faveur de la Confédération` : `1 : ${(a2 / a1).toFixed(1).replace('.', ',')} en faveur des Cultistes`;
      rapport = `<p class="muted small" style="margin:10px 0 0">Rapport de force : <strong style="color:var(--text)">${rapport = r}</strong></p>`;
    }
    return `<section class="bloc"><h3>Effectifs engagés</h3>${carte('confederation')}${carte('cultistes')}${rapport}</section>`;
  }

  function blocPertes(a) {
    const ligne = cle => `<tr><td>${esc(data.factions[cle].court)}</td>${C.PERTES.map(([k2]) => `<td>${C.fmt(a.pertes[cle][k2])}</td>`).join('')}</tr>`;
    return `<section class="bloc"><h3>Pertes militaires</h3><table class="pertes">
      <tr><th>Faction</th>${C.PERTES.map(([, l]) => `<th>${l}</th>`).join('')}</tr>
      ${ligne('confederation')}${ligne('cultistes')}</table></section>`;
  }

  function nomPortee(p) {
    if (p.type === 'district' && parId[p.id]) return parId[p.id].nom + ' · ' + secteurParId[parId[p.id]._secteur].nom;
    if (p.type === 'secteur' && secteurParId[p.id]) return 'Secteur ' + secteurParId[p.id].nom;
    return 'Mondial';
  }

  function blocEvenements(filtreFn, titre) {
    let evs = evenementsAff().filter(filtreFn).slice().reverse();
    const filtres = { tous: 'Tous', majeur: 'Majeurs +', critique: 'Critiques' };
    if (etat.filtre === 'majeur') evs = evs.filter(e => e.gravite !== 'mineur');
    if (etat.filtre === 'critique') evs = evs.filter(e => e.gravite === 'critique');
    const html = evs.length ? evs.map(ev => `
      <article class="ev ${ev.gravite}">
        <div class="meta"><span class="grav">${esc(C.GRAVITES[ev.gravite])}</span><span class="date">${esc(ev.date)}</span>
          <button class="portee" data-portee='${esc(JSON.stringify(ev.portee))}'>${esc(nomPortee(ev.portee))}</button></div>
        <h4>${esc(ev.titre)}</h4>
        <p>${esc(ev.description)}</p>
        ${ev.consequences && ev.consequences.length ? `<ul>${ev.consequences.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        ${ev.tension ? `<span class="dt ${ev.tension > 0 ? 'up' : 'down'}">Tension ${ev.tension > 0 ? '+' : ''}${ev.tension}</span>` : ''}
      </article>`).join('') : '<div class="vide">Aucun événement.</div>';
    return `<section class="bloc"><h3>${titre}</h3>
      <div class="filtres">${Object.entries(filtres).map(([k2, l]) => `<button data-filtre="${k2}" class="${etat.filtre === k2 ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${html}</section>`;
  }

  function itemListe(o, navCle, sousDistricts) {
    const inf = sousDistricts ? influenceMoy(sousDistricts) : statutDe(o).influence;
    let droite;
    if (sousDistricts) {
      const touches = sousDistricts.filter(x => statutDe(x).statut !== 'controle').length;
      droite = o.geographique === false ? '<span class="chip horscarte">Hors carte</span>' : `<span class="muted small">${touches}/${sousDistricts.length} touchés</span>`;
    } else {
      const s = statutDe(o);
      droite = `<span class="chip ${s.statut}">${esc(data.statuts[s.statut])}</span>`;
    }
    return `<button class="item" data-nav="${navCle}"><span class="t">${esc(o.nom)}</span>${droite}
      <span class="mini"><i style="width:${Math.round(inf)}%"></i></span></button>`;
  }

  function rendrePanel() {
    let html;
    if (etat.niveau === 'monde') {
      const compte = {};
      districts.forEach(d => { const s = statutDe(d).statut; compte[s] = (compte[s] || 0) + 1; });
      html = `<div class="p-head"><span class="lbl">Vue globale · ${districts.length} districts</span><h2>${esc(data.meta.titre)}</h2>
        <div class="row compte">${Object.keys(data.statuts).filter(s => compte[s]).map(s => `<span class="chip ${s}">${compte[s]} · ${esc(data.statuts[s])}</span>`).join('')}</div>
        ${barre(influenceMoy(districts))}</div>
        <section class="bloc"><h3>Secteurs</h3><div class="liste">${data.secteurs.map(s => itemListe(s, s.id, s.districts)).join('')}</div></section>
        ${blocCivils(C.agrege(districts))}${blocForces(C.agrege(districts))}${blocPertes(C.agrege(districts))}
        ${blocEvenements(() => true, 'Événements mondiaux')}`;
    } else if (etat.niveau === 'secteur') {
      const s = secteurParId[etat.secteur];
      const a = C.agrege(s.districts);
      const ids = new Set(s.districts.map(d => d.id));
      html = `<div class="p-head"><span class="lbl">Secteur${s.geographique === false ? ' · hors carte' : ''}</span><h2>${esc(s.nom)}</h2>${barre(influenceMoy(s.districts))}</div>
        ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
        <section class="bloc"><h3>Districts</h3><div class="liste">${s.districts.map(d => itemListe(d, s.id + '/' + d.id)).join('') || '<div class="vide">Aucun district.</div>'}</div></section>
        ${blocCivils(a)}${blocForces(a)}${blocPertes(a)}
        ${blocEvenements(e => (e.portee.type === 'secteur' && e.portee.id === s.id) || (e.portee.type === 'district' && ids.has(e.portee.id)), 'Événements du secteur')}`;
    } else {
      const d = parId[etat.district], s = secteurParId[d._secteur], st = statutDe(d);
      const a = C.agrege([d]);
      html = `<div class="p-head"><span class="lbl">Secteur ${esc(s.nom)} · District</span><h2>${esc(d.nom)}</h2>
        <div class="row"><span class="chip ${st.statut}">${esc(data.statuts[st.statut])}</span>
        ${etat.replay === null && d.tendance ? `<span class="tendance ${d.tendance}">${d.tendance === 'hausse' ? '▲' : d.tendance === 'baisse' ? '▼' : '■'} ${esc(C.TENDANCES[d.tendance])}</span>` : ''}</div>
        ${barre(st.influence)}</div>
        ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
        ${blocCivils(a)}${blocForces(a)}${blocPertes(a)}
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
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${a >= 270 || a === 0 ? '#d8284f' : '#4a5563'}" stroke-width="${long ? 2 : 1}"/>`;
    }).join('');
    const [ax, ay] = P(270, 46), [bx, by] = P(359.9, 46);
    const [mx, my] = P(aMin, 40), [hx, hy] = P(aH, 26);
    el.innerHTML = `<svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="48" fill="#0b0e12" stroke="#2c3440" stroke-width="2"/>
      <path d="M50 50 L${ax} ${ay} A46 46 0 0 1 ${bx} ${by} Z" fill="#d8284f" fill-opacity=".14"/>
      ${ticks}
      <line x1="50" y1="50" x2="${hx}" y2="${hy}" stroke="#dde1e7" stroke-width="4" stroke-linecap="round"/>
      <line x1="50" y1="50" x2="${mx}" y2="${my}" stroke="#ff3b5c" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="50" cy="50" r="3.5" fill="#ff3b5c"/>
    </svg>`.replace(/^<svg[^>]*>|<\/svg>$/g, '');
    el.setAttribute('viewBox', '0 0 100 100');
  }

  function rendreTension() {
    const t = tensionAff(), P = data.tension.paliers;
    const i = C.palier(t, P), min = C.minutes(t, P);
    const coul = d3.interpolateRgb('#e3a33b', '#ff3b5c')(i / Math.max(1, P.length - 1));
    horloge($('#miniClock'), min, false);
    $('#tensionVal').textContent = `${Math.round(t)} / 100`;
    $('#tensionPalier').textContent = `${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][i] || i + 1} · ${P[i].nom}`;
    $('#tensionPalier').style.color = coul;

    const romain = n => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][n] || n + 1;
    $('#tensionDetail').innerHTML = `
      <div class="t-top"><svg id="bigClock"></svg>
        <div><span class="lbl">Tension mondiale${etat.replay !== null ? ' · archive' : ''}</span>
        <h2 style="color:${coul}">Palier ${romain(i)} · ${esc(P[i].nom)}</h2>
        <div class="heure">${C.heure(min)}</div>
        <p class="muted small" style="margin:4px 0 0">${min > 0 ? `${min.toFixed(1).replace('.', ',')} minutes avant minuit` : 'Minuit atteint'} · Tension ${Math.round(t)} / 100</p></div></div>
      <div class="t-jauge"><div class="cur" style="left:calc(${t}% - 1px)"></div>
        ${P.map(p => `<span class="tick" style="left:${p.min}%">${p.min}</span>`).join('')}</div>
      <div class="paliers">${P.map((p, j) => `
        <div class="pal ${j < i ? 'passe' : j === i ? 'actuel' : ''}">
          <span class="num">${romain(j)}</span>
          <span class="nm">${esc(p.nom)} ${j === i ? '<span class="badge">· ACTUEL</span>' : ''}</span>
          <span class="seuil">≥ ${p.min} · ${p.minutes} min</span>
          <span class="ar">${esc(p.armes)}</span></div>`).join('')}</div>`;
    horloge($('#bigClock'), min, true);
  }
  $('#tensionBtn').addEventListener('click', () => $('#tensionDlg').showModal());

  // ---------- Alerte / archive / en-tête ----------
  function rendreAlerte() {
    const el = $('#alerte');
    const dernier = data.evenements[data.evenements.length - 1];
    if (etat.replay !== null || !dernier || dernier.gravite !== 'critique') { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<span class="tag">ALERTE</span><span><strong>${esc(dernier.titre)}</strong> — ${esc(nomPortee(dernier.portee))}</span><span class="quand">${esc(dernier.date)}</span>`;
    el.onclick = () => allerPortee(dernier.portee);
  }
  function rendreArchive() {
    const el = $('#archive');
    if (etat.replay === null) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<b>ARCHIVE — ${esc(data.historique[etat.replay].date)}</b><br>Carte, statuts et tension à cette date. Les chiffres détaillés sont ceux d'aujourd'hui.`;
  }

  $('#titre').textContent = data.meta.titre;
  $('#soustitre').textContent = data.meta.sousTitre || '';
  $('#daterp').textContent = data.meta.dateRP;
  if (data.meta.derniereMaj) {
    const dt = new Date(data.meta.derniereMaj);
    $('#maj').textContent = 'Mis à jour le ' + dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- Chronologie ----------
  const slider = $('#slider'), sLbl = $('#sliderLbl');
  const nH = data.historique.length;
  if (!nH) $('.timeline').hidden = true;
  slider.max = nH; slider.value = nH;
  function majSlider() {
    const v = +slider.value;
    etat.replay = v >= nH ? null : v;
    sLbl.textContent = etat.replay === null ? 'EN DIRECT' : data.historique[v].date;
    sLbl.classList.toggle('live', etat.replay === null);
    rendre(false);
  }
  slider.addEventListener('input', () => { arreterLecture(); majSlider(); });
  let lecture = null;
  function arreterLecture() { clearInterval(lecture); lecture = null; $('#play').textContent = '▶'; }
  $('#play').addEventListener('click', () => {
    if (lecture) return arreterLecture();
    $('#play').textContent = '❚❚';
    slider.value = 0; majSlider();
    lecture = setInterval(() => {
      slider.value = +slider.value + 1; majSlider();
      if (+slider.value >= nH) arreterLecture();
    }, 1400);
  });
  sLbl.classList.add('live');

  // ---------- Démarrage ----------
  construire();
  lireHash();
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(construire, 200); });

  // Rechargement automatique si une mise à jour est publiée
  setInterval(async () => {
    try {
      const d = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json());
      if (d.meta.derniereMaj !== data.meta.derniereMaj) location.reload();
    } catch (e) { /* hors ligne */ }
  }, 5 * 60 * 1000);
})();
