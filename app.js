// Carte du front — affichage public
(async function () {
  const $ = s => document.querySelector(s);
  const esc = C.esc, I = C.ICONES;

  let data, topo, districts, parId, secteurParId;
  const etat = { niveau: 'monde', secteur: null, district: null, ville: null, replay: null, filtre: 'tous', onglet: 'apercu' };
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
  const terres = topojson.merge(topo, geoms);
  const meshDist = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && distDe(a) !== distDe(b) && sectDe(a) === sectDe(b));
  const meshSect = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && sectDe(a) !== sectDe(b));

  // ---------- Construction SVG ----------
  const svg = d3.select('#map').append('svg').attr('role', 'img').attr('aria-label', 'Carte des secteurs et districts');
  svg.append('defs').html(`
    <pattern id="hachures" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="1.6" height="5" style="fill:var(--st-quarantaine)" fill-opacity=".6"/>
    </pattern>
    <radialGradient id="brulure"><stop offset="0" style="stop-color:var(--detruit-coeur)"/><stop offset=".6" style="stop-color:var(--detruit)"/><stop offset="1" style="stop-color:var(--detruit)" stop-opacity=".55"/></radialGradient>
    <clipPath id="clipTerres"><path id="clipTerresPath"/></clipPath>`);
  const gZoom = svg.append('g');
  const L = {};
  for (const n of ['fond', 'dist', 'zones', 'sceaux', 'hatch', 'detruites', 'bords', 'sel', 'fronts', 'sites', 'villes', 'unites', 'mark', 'lab', 'orbites']) L[n] = gZoom.append('g');

  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath(projection);
  let W = 0, H = 0, k = 1, ech = 1;

  const zoom = d3.zoom().scaleExtent([1, 16]).on('zoom', e => {
    gZoom.attr('transform', e.transform);
    if (e.transform.k !== k) { k = e.transform.k; echelleLabels(); }
  });
  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('click', e => { if (e.target.tagName === 'svg' || e.target.classList.contains('sphere')) remonter(); });

  function construire() {
    const box = $('#map').getBoundingClientRect();
    W = box.width; H = box.height;
    ech = W < 600 ? 0.62 : 1; // symboles plus petits sur téléphone
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const haut = W < 700 ? 60 : 64, bas = 64;
    projection.fitExtent([[10, haut], [W - 10, H - bas]], {
      type: 'MultiPoint', coordinates: [[-180, 0], [180, 0], [0, 84], [0, -57], [-170, 70], [170, 70], [-170, -57], [170, -57]]
    });

    L.fond.selectAll('*').remove();
    L.fond.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
    L.fond.append('path').attr('class', 'ocean-grid').attr('d', path(d3.geoGraticule10()));
    // On se déplace dans la carte sans pouvoir la sortir du cadre
    zoom.translateExtent([[0, 0], [W, H]]).extent([[0, 0], [W, H]]);

    const avecGeo = districts.filter(d => d._geo);
    L.dist.selectAll('path').data(avecGeo, d => d.id).join('path')
      .attr('d', d => path(d._geo))
      .on('mousemove', survol).on('mouseleave', finSurvol).on('click', clicDistrict);

    L.bords.selectAll('*').remove();
    svg.select('#clipTerresPath').attr('d', path(terres));

    // Sites marqués d'une étoile (Ganzir, Gotland…) ; Ganzir est une île ajoutée à la carte
    const sites = (data.sites || []).map(x => ({ ...x, p: projection(x.coord) }));
    L.sites.selectAll('*').remove();
    L.sites.selectAll('path.ile').data(sites.filter(x => x.ile)).join('path').attr('class', 'ile')
      .attr('d', x => path(tache({ id: x.id, centre: x.coord, rayon: x.rayon || 1 })));
    const g = L.sites.selectAll('g.site').data(sites).join('g').attr('class', 'site')
      .on('mousemove', survolSite).on('mouseleave', finSurvol)
      .on('click', (e, x) => { e.stopPropagation(); const [sc, di] = (x.lien || '').split('/'); naviguer(sc || undefined, di || undefined); });
    g.filter(x => x.icone !== 'labo').append('g').attr('class', 'embleme').html(EMBLEME);
    // Intérêt scientifique : erlenmeyer (icône MingCute "flask-line") sur une pastille
    const labo = g.filter(x => x.icone === 'labo');
    labo.append('circle').attr('class', 'pastille-labo').attr('r', 10);
    labo.append('path').attr('class', 'labo').attr('transform', 'translate(-7.2,-7.2) scale(0.6)').attr('d', FLASK);
    g.append('text').attr('class', 'label nom-site').attr('x', 13).attr('dy', '0.35em').text(x => x.nom);
    // Zones détruites (frappes, rasages) : taches brûlées découpées sur les terres
    L.detruites.attr('clip-path', 'url(#clipTerres)');
    L.detruites.selectAll('path').data(data.detruites || [], z => z.id).join('path').attr('class', 'detruite')
      .attr('d', z => path(tache(z)))
      .on('mousemove', survolDetruite).on('mouseleave', finSurvol)
      .on('click', (e, z) => { e.stopPropagation(); if (parId[z.district]) naviguer(parId[z.district]._secteur, z.district); });

    // Villes "Too young to die"
    const villes = (data.villes || []).filter(v => parId[v.district]).map(v => ({ ...v, p: projection(v.coord) }));
    const gv = L.villes.selectAll('g.ville').data(villes, v => v.id).join(en => {
      const x = en.append('g');
      x.append('circle').attr('class', 'v-halo').attr('r', 9);
      x.each(function (v) {
        if (v.capitale) d3.select(this).append('g').attr('class', 'embleme').html(etoileBrisee(19));
        else d3.select(this).append('circle').attr('class', 'v-point').attr('r', 4.5);
      });
      x.append('text').attr('class', 'label nom-ville').attr('x', v => v.capitale ? 12 : 8).attr('dy', '0.35em');
      return x;
    }).on('mousemove', survolVille).on('mouseleave', finSurvol)
      .on('click', (e, v) => { e.stopPropagation(); tip.hidden = true; naviguer(parId[v.district]._secteur, v.district, v.id); });
    gv.attr('class', v => 'ville ' + VILLES.niveau(v.etat)[1]).select('text').text(v => v.nom);

    // Orbites des satellites (trace au sol) et marqueurs mobiles
    const sats = (data.satellites || []);
    L.orbites.selectAll('path.orbite').data(sats.filter(x => !x.geo), x => x.id).join('path')
      .attr('class', x => 'orbite' + (x.etoile ? ' importante' : '')).attr('d', x => path(traceOrbite(x)));
    const gs = L.orbites.selectAll('g.sat').data(sats, x => x.id).join(en => {
      const x = en.append('g');
      x.each(function (o) {
        const el = d3.select(this);
        if (o.etoile) el.append('g').attr('class', 'embleme petit').html(EMBLEME);
        else el.append('path').attr('class', 'sat-corps').attr('d', SATELLITE);
        el.append('text').attr('class', 'label nom-sat').attr('x', o.etoile ? 15 : 10).attr('dy', '0.35em').text(o.nom);
      });
      return x;
    }).attr('class', x => 'sat' + (x.etoile ? ' importante' : '') + (x.geo ? ' geo' : ''))
      .on('mousemove', survolSat).on('mouseleave', finSurvol);
    majSatellites();

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
      t = zoom.constrain()(t, zoom.extent()(), zoom.translateExtent());
    }
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (anime && !reduit ? svg.transition().duration(700).ease(d3.easeCubicInOut) : svg).call(zoom.transform, t);
  }

  function cadreVue() {
    if (etat.niveau === 'monde') return null;
    const v = etat.ville && villeParId(etat.ville);
    if (v) { const [x, y] = projection(v.coord); const r = W * 0.07; return [[x - r, y - r * 0.6], [x + r, y + r * 0.6]]; }
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
    return { statut: d.statut, influence: d.influence, quarantaine: !!d.quarantaine };
  }
  const tensionAff = () => etat.replay !== null ? data.historique[etat.replay].tension : data.tension.valeur;
  const zonesAff = () => (etat.replay !== null && data.historique[etat.replay].zones) || data.zones || [];
  // Dates du RP ("11 sept. 2075") comparables entre elles
  const MOIS = { janv: 1, févr: 2, fevr: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, août: 8, aout: 8, sept: 9, oct: 10, nov: 11, déc: 12, dec: 12 };
  const dateVal = t => { const m = /(\d+)\s+([a-zéû]+)\.?\s+(\d{4})/i.exec(t || ''); return m ? +m[3] * 1e4 + (MOIS[m[2].toLowerCase()] || 0) * 100 + +m[1] : Infinity; };
  const dateAff = () => etat.replay !== null ? data.historique[etat.replay].date : data.meta.dateRP;
  const detruitesAff = () => (data.detruites || []).filter(z => !z.date || dateVal(z.date) <= dateVal(dateAff()));
  // État des villes : celui de l'archive pendant la relecture, sinon l'état actuel
  const villesAff = () => {
    const h = etat.replay !== null && data.historique[etat.replay].villes;
    return (data.villes || []).map(v => h && h[v.id] != null ? { ...v, etat: h[v.id] } : v);
  };
  const enQuarantaine = st => st.statut === 'quarantaine' || !!st.quarantaine;
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
      .attr('class', d => 'district'
        + (selSurCarte && d._secteur !== sel ? ' dim' : '')
        + (etat.niveau === 'district' && d.id === etat.district ? ' sel' : ''));

    // Hachures uniquement sur les districts en quarantaine visibles
    const quarantaine = districts.filter(d => d._geo && enQuarantaine(statutDe(d)) && !(selSurCarte && d._secteur !== sel));
    L.hatch.selectAll('path').data(quarantaine, d => d.id).join('path').attr('class', 'hatch-over').attr('d', d => path(d._geo));

    // Bordure contestée autour de chaque zone cultiste (étroite : ~1/3 du rayon, entre 0,4° et 2°)
    const zs = zonesAff();
    const halos = zs.map(z => ({ ...z, id: z.id + '-c', rayon: (+z.rayon || 1) + Math.max(0.4, Math.min(2, (+z.rayon || 1) * 0.35)), halo: true }));
    L.zones.attr('clip-path', 'url(#clipTerres)');
    const gH = L.zones.selectAll('g.halos').data([0]).join('g').attr('class', 'halos');
    const gZ = L.zones.selectAll('g.coeurs').data([0]).join('g').attr('class', 'coeurs');
    gH.selectAll('path').data(halos, z => z.id).join('path')
      .attr('class', 'zone-contestee').attr('d', z => path(tache(z)))
      .on('mousemove', survolZone).on('mouseleave', finSurvol).on('click', (e, z) => { e.stopPropagation(); if (parId[z.district]) naviguer(parId[z.district]._secteur, z.district); });
    gZ.selectAll('path').data(zs, z => z.id).join('path')
      .attr('class', 'zone').attr('d', z => path(tache(z))).style('fill', z => z.couleur)
      .on('mousemove', survolZone).on('mouseleave', finSurvol).on('click', (e, z) => { e.stopPropagation(); if (parId[z.district]) naviguer(parId[z.district]._secteur, z.district); });
    // Symbole du chaos, semi-transparent, sur les zones cultistes principales
    const sceaux = zs.filter(z => (+z.rayon || 0) >= 2).map(z => {
      const c = projection(z.centre), b = projection([z.centre[0] + z.rayon * 0.8, z.centre[1]]);
      return { id: z.id, c, r: Math.hypot(b[0] - c[0], b[1] - c[1]) };
    });
    L.sceaux.selectAll('path').data(sceaux, x => x.id).join('path').attr('class', 'sceau-chaos')
      .attr('d', CHAOS).attr('transform', x => `translate(${x.c[0]},${x.c[1]}) scale(${x.r})`);
    rendreUnites();
    const etats = new Map(villesAff().map(v => [v.id, v.etat]));
    L.villes.selectAll('g.ville').attr('class', v => 'ville ' + VILLES.niveau(etats.get(v.id) ?? v.etat)[1]);
    const dVis = new Set(detruitesAff().map(z => z.id));
    L.detruites.selectAll('path').attr('display', z => dVis.has(z.id) ? null : 'none');
    L.villes.selectAll('g.ville').classed('sel', v => v.id === etat.ville).classed('sans-nom', etat.niveau === 'monde');
    rendreLegende();
    appliquerDistorsion();

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

  // Tache organique autour d'un centre (forme stable : dérivée de l'identifiant de la zone)
  function tache(z) {
    let h = 0;
    for (const c of z.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const a = (h % 628) / 100, b = ((h >> 8) % 628) / 100, c2 = ((h >> 16) % 628) / 100;
    const [lon0, lat0] = z.centre, R = +z.rayon || 1, cos = Math.max(0.2, Math.cos(lat0 * Math.PI / 180));
    const ring = [];
    for (let i = 0; i < 64; i++) {
      const t = -i / 64 * 2 * Math.PI;
      const r = R * (1 + 0.2 * Math.sin(3 * t + a) + 0.12 * Math.sin(5 * t + b) + 0.06 * Math.sin(9 * t + c2));
      ring.push([lon0 + r * Math.cos(t) / cos, Math.max(-89, Math.min(89, lat0 + r * Math.sin(t)))]);
    }
    ring.push(ring[0]);
    let poly = { type: 'Polygon', coordinates: [ring] };
    if (d3.geoArea(poly) > 2 * Math.PI) poly = { type: 'Polygon', coordinates: [ring.slice().reverse()] };
    return poly;
  }

  // Étoile du chaos (8 flèches), dessinée dans un cercle de rayon 1
  const CHAOS = (() => {
    const w = 0.06, forme = [[0, -w], [0.74, -w], [0.6, -0.2], [1, 0], [0.6, 0.2], [0.74, w], [0, w]];
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
      d += forme.map(([x, y], j) => (j ? 'L' : 'M') + (x * ca - y * sa).toFixed(3) + ',' + (x * sa + y * ca).toFixed(3)).join('') + 'Z';
    }
    return d + 'M0.14,0A0.14,0.14 0 1 1 -0.14,0A0.14,0.14 0 1 1 0.14,0Z';
  })();

  // ---------- Distorsion (façon The Fire Rises) ----------
  // Intensité 0–100 réglée dans l'administration, enregistrée à chaque point de chronologie.
  const zoneCarte = document.querySelector('.mapzone'), calqueD = document.getElementById('distorsion');
  const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)'), mouvementReduitSat = mouvementReduit;
  let intensite = 0, minuterieGlitch = null;
  (function bruit() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), img = x.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    calqueD.querySelector('.d-bruit').style.backgroundImage = `url(${c.toDataURL()})`;
  })();
  function appliquerDistorsion() {
    const v = etat.replay !== null && data.historique[etat.replay].distorsion != null
      ? data.historique[etat.replay].distorsion : (data.meta.distorsion || 0);
    const n = Math.max(0, Math.min(100, +v || 0)) / 100;
    if (n === intensite) return;
    intensite = n;
    zoneCarte.style.setProperty('--dist', n);
    calqueD.hidden = n === 0;
    clearTimeout(minuterieGlitch);
    if (n > 0 && !mouvementReduit.matches) planifierGlitch();
  }
  function planifierGlitch() {
    // Plus l'intensité est forte, plus les coupures sont fréquentes (≈ 9 s à 1 s)
    const attente = 9000 * (1 - intensite) + 900 + Math.random() * 2500 * (1 - intensite);
    minuterieGlitch = setTimeout(() => {
      if (!document.hidden) {
        const dx = (Math.random() * 2 - 1) * 10 * intensite;
        zoneCarte.style.setProperty('--gx', dx.toFixed(1) + 'px');
        zoneCarte.style.setProperty('--gy', (Math.random() * 90).toFixed(0) + '%');
        zoneCarte.style.setProperty('--gh', (4 + Math.random() * 18 * intensite).toFixed(0) + '%');
        zoneCarte.classList.add('glitch');
        if (intensite > 0.5) zoneCarte.classList.add('glitch-fort');
        setTimeout(() => zoneCarte.classList.remove('glitch', 'glitch-fort'), 90 + Math.random() * 160 * intensite);
      }
      planifierGlitch();
    }, attente);
  }

  const FLASK = 'M8 3h8m-6 0h4v6.631a1 1 0 0 0 .173.563l5.227 7.68c.903 1.329-.048 3.126-1.654 3.126H6.254c-1.606 0-2.557-1.797-1.654-3.125l5.227-7.681A1 1 0 0 0 10 9.63z';
  function etoile(R, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + (rr * Math.cos(a)).toFixed(2) + ',' + (rr * Math.sin(a)).toFixed(2);
    }
    return d + 'Z';
  }
  // Étoile brisée des lieux de grande importance (dessin d'origine 830 × 830, étoile centrée sur 415,415)
  const ETOILE_D = 'M415,110L483,320H438L415,248L392,320H347Z'
    + 'M110,348H720L217,718L292,487ZM237,390L342,470L299,605L590,390Z'
    + 'M546,511L615,720L437,591L472,565L533,608L510,537Z';
  const etoileBrisee = taille => `<path class="em-trait" fill-rule="evenodd" transform="scale(${(taille / 610).toFixed(4)}) translate(-415,-415)" d="${ETOILE_D}"/>`;
  const EMBLEME = etoileBrisee(26);

  // ---------- Satellites ----------
  const SATELLITE = 'M-3.5,-3.5h7v7h-7zM-12,-2.5h7.5v5h-7.5zM4.5,-2.5h7.5v5h-7.5zM-4.5,0h9M0,-3.5v-3';
  const RAD = Math.PI / 180;
  function posOrbite(s, u) {
    const i = s.inclinaison * RAD;
    const lat = Math.asin(Math.sin(i) * Math.sin(u)) / RAD;
    const lon = s.noeud + Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u)) / RAD;
    return [((lon + 540) % 360) - 180, lat];
  }
  function traceOrbite(s) {
    const pts = [];
    for (let a = 0; a <= 360; a += 3) pts.push(posOrbite(s, a * RAD));
    return { type: 'LineString', coordinates: pts };
  }
  const t0 = performance.now();
  function majSatellites() {
    const t = (performance.now() - t0) / 1000;
    L.orbites.selectAll('g.sat').attr('transform', function (s) {
      const c = s.geo ? s.coord : posOrbite(s, 2 * Math.PI * (t / (s.periode || 90) + (s.phase || 0)));
      const p = projection(c);
      s._c = c;
      return `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) scale(${ech / k})`;
    });
  }
  // 10 images par seconde suffisent pour un mouvement lent ; arrêt si l'onglet est masqué
  let dernierSat = 0;
  (function boucleSat(ts) {
    if (!document.hidden && !mouvementReduitSat.matches && ts - dernierSat > 100) { dernierSat = ts; if (W) majSatellites(); }
    requestAnimationFrame(boucleSat);
  })(0);
  function survolSat(e, s) {
    const cle = 'o:' + s.id;
    if (cle !== survolCle) { survolCle = cle; tip.innerHTML = `<strong>${esc(s.nom)}</strong>${esc(s.info || '')}<br><span class="ds-supporting">${s.geo ? 'Orbite géostationnaire' : `Orbite inclinée à ${s.inclinaison}°`}</span>`; }
    placerTip(e);
  }

  // ---------- Villes et zones détruites (survol) ----------
  function survolVille(e, v) {
    const cle = 'v:' + v.id;
    if (cle !== survolCle) {
      survolCle = cle;
      v = villeParId(v.id) || v;
      const [lib] = VILLES.niveau(v.etat);
      tip.innerHTML = `<strong>${esc(v.nom)}</strong>État : ${v.etat} % (${esc(lib.toLowerCase())})<br>Garnison : ${C.fmt(C.somme(v.garnison.map(u => u.effectif)), true)}<br><span class="ds-supporting">Cliquer pour la fiche</span>`;
    }
    placerTip(e);
  }
  function survolDetruite(e, z) {
    const cle = 'x:' + z.id;
    if (cle !== survolCle) { survolCle = cle; tip.innerHTML = `<strong>Zone détruite</strong>${esc(z.nom)}${z.date ? ', ' + esc(z.date) : ''}<br>${esc(z.info || '')}`; }
    placerTip(e);
  }

  // ---------- Plan de guerre : unités et axes d'attaque ----------
  // Taille proportionnelle au logarithme de l'effectif, pile de pions pour les grandes formations
  const TYPES_UNITE = {
    reg: { re: /^forces régulières/i, nom: 'Forces régulières', ref: 1e6, echelon: 'XXX', piles: [3e6, 8e6] },
    fs: { re: /^forces spéciales/i, nom: 'Forces spéciales', ref: 5000, echelon: 'X', piles: [1e4] },
    ph: { re: /^division phoenix/i, nom: 'Division Phoenix', ref: 1500, echelon: 'XX', piles: [3000] },
    cult: { nom: 'Cultistes', ref: 1e6, echelon: '', piles: [5e6, 2e7] }
  };
  const INTERIEUR = {
    reg: '<path class="u-trait" d="M-11,-7L11,7M-11,7L11,-7"/>',
    // Forces spéciales : dague de commando ; Phoenix : oiseau de feu ailes déployées
    fs: '<path class="u-dague" d="M0,-6.4L1.4,-3.4V1.6H-1.4V-3.4ZM-4.2,1.6H4.2V3H-4.2ZM-0.8,3H0.8V5.2H-0.8ZM0,5L1.3,6.3L0,7.3L-1.3,6.3Z"/>',
    ph: '<path class="u-phenix" d="M0,-6.2L1.1,-4.8L0.9,-3.2L3.6,-3.4L6.6,-5.4L9.4,-6.2L8.2,-4.1L8.6,-3.1L6.4,-2.7L6.6,-1.5L4.2,-1.2L1.6,0.2L2.2,2.4L3.4,5.4L1.3,3.7L0,6.2L-1.3,3.7L-3.4,5.4L-2.2,2.4L-1.6,0.2L-4.2,-1.2L-6.6,-1.5L-6.4,-2.7L-8.6,-3.1L-8.2,-4.1L-9.4,-6.2L-6.6,-5.4L-3.6,-3.4L-0.9,-3.2L-1.1,-4.8Z"/>',
    cult: ''
  };
  const couleurZoneDe = d => {
    const z = zonesAff().find(x => x.district === d.id) || zonesAff().filter(x => (+x.rayon || 0) >= 2)
      .map(x => ({ x, dist: d3.geoDistance(x.centre, projection.invert(ancre(d))) })).sort((a, b) => a.dist - b.dist)[0]?.x;
    return z ? z.couleur : null;
  };
  function unitesDe(d) {
    const out = [];
    for (const [cle, T] of Object.entries(TYPES_UNITE)) {
      if (cle === 'cult') continue;
      const u = (d.forces.confederation || []).find(x => T.re.test(x.nom));
      const n = u ? C.parse(u.effectif).n : 0;
      if (n > 0) out.push({ type: cle, n, v: u.effectif });
    }
    const cult = (d.forces.cultistes || []).filter(u => !/survivants/i.test(u.nom));
    if (cult.length) {
      const tot = C.somme(cult.map(u => u.effectif));
      out.push({ type: 'cult', n: tot.n, v: tot, inconnu: !tot.n, couleur: couleurZoneDe(d) });
    }
    return out;
  }
  // Points d'implantation possibles dans un district : grille régulière gardée si elle tombe sur ses terres
  function pointsDe(d) {
    if (d._pts) return d._pts;
    // Seulement les grandes masses de terre : pas de pions perdus sur de petites îles
    const polys = d._geo.type === 'MultiPolygon' ? d._geo.coordinates : [d._geo.coordinates];
    const aires = polys.map(c => d3.geoArea({ type: 'Polygon', coordinates: c })), max = Math.max(...aires);
    const geo = { type: 'MultiPolygon', coordinates: polys.filter((c, i) => aires[i] >= max * 0.2) };
    let [[x0, y0], [x1, y1]] = d3.geoBounds(geo);
    if (x1 < x0) x1 += 360;
    const pts = [], n = 18;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      let lon = x0 + (x1 - x0) * (i + 0.5) / (n + 1), lat = y0 + (y1 - y0) * (j + 0.5) / (n + 1);
      if (lon > 180) lon -= 360;
      if (lat > 75 || lat < -60) continue; // pas d'unités sur la banquise
      if (d3.geoContains(geo, [lon, lat])) pts.push([lon, lat]);
    }
    return (d._pts = pts);
  }
  // Une grosse formation se répartit en plusieurs pions (corps, brigades) sur le terrain
  const MORCEAUX = { reg: [1.5e6, 4e6, 8e6], fs: [6000], ph: [], cult: [3e6, 1.2e7] };
  function rendreUnites() {
    const sel = etat.niveau === 'monde' ? null : etat.secteur;
    // Pas d'effectifs archivés : les pions ne s'affichent qu'en direct
    const visibles = etat.replay !== null ? [] : districts.filter(d => d._geo && (sel ? d._secteur === sel : ech === 1 && statutDe(d).statut !== 'controle'));
    const foyers = zonesAff().filter(z => (+z.rayon || 0) >= 2);
    const pions = [];
    for (const d of visibles) {
      const a = ancre(d);
      if (!a) continue;
      const centre = projection.invert(a), us = unitesDe(d);
      const cands = pointsDe(d).length ? pointsDe(d) : [centre];
      // Bulles de propagation qui concernent le district : les siennes, sinon le grand foyer voisin
      const bulles = zonesAff().filter(z => z.district === d.id).sort((x, y) => (+y.rayon || 0) - (+x.rayon || 0));
      const voisin = bulles.length ? null
        : foyers.map(z => ({ z, dist: d3.geoDistance(z.centre, centre) })).filter(o => o.dist < 0.75).sort((x, y) => x.dist - y.dist)[0]?.z;
      const autour = bulles.length ? bulles : voisin ? [voisin] : [];
      const decale = (c, r, th) => [c[0] + r * Math.cos(th) / Math.max(0.2, Math.cos(c[1] * RAD)), c[1] + r * Math.sin(th)];
      const surTerre = pt => d3.geoContains(d._geo, pt);
      // Positions candidates : dans les bulles (cultistes, Phoenix), en anneau autour (lignes confédérées),
      // ou près des villes et du centre pour un district calme (garnisons)
      const dedans = [], anneau = [];
      for (const z of bulles) {
        const R = +z.rayon || 1;
        dedans.push(z.centre);
        for (let a = 0; a < 8; a++) for (const f of [0.35, 0.6]) { const q = decale(z.centre, R * f, a * Math.PI / 4 + f); if (surTerre(q)) dedans.push(q); }
      }
      for (const z of autour) {
        const R = +z.rayon || 1;
        for (const f of [1.35, 1.7, 2.2, 3]) {
          const pts = [];
          for (let a = 0; a < 24; a++) { const q = decale(z.centre, R * f, a * Math.PI / 12); if (surTerre(q)) pts.push(q); }
          if (pts.length) { anneau.push(...pts); break; }
        }
      }
      const villesD = villesAff().filter(v => v.district === d.id).map(v => v.coord);
      const calme = [...villesD, ...cands];
      const pris = [centre];
      const choisir = (liste, poidsCentre) => {
        let best = -Infinity, pos = null;
        for (const c of liste) {
          const sc = Math.min(...pris.map(q => d3.geoDistance(c, q))) - poidsCentre * d3.geoDistance(c, centre);
          if (sc > best) { best = sc; pos = c; }
        }
        return pos;
      };
      const ordre = [...us.filter(u => u.type === 'cult'), ...us.filter(u => u.type === 'ph'), ...us.filter(u => u.type !== 'cult' && u.type !== 'ph')];
      for (const u of ordre) {
        const T = TYPES_UNITE[u.type];
        const nb = u.inconnu ? 1 : 1 + MORCEAUX[u.type].filter(x => u.n >= x).length;
        const part = u.n / nb;
        const t = u.inconnu ? 0.8 : Math.max(0.7, Math.min(1.55, 0.95 + 0.22 * Math.log10(part / T.ref)));
        for (let m = 0; m < nb; m++) {
          let pos;
          if (u.type === 'cult' && m === 0 && bulles.length) pos = bulles[0].centre;
          else if ((u.type === 'cult' || u.type === 'ph') && dedans.length) pos = choisir(dedans, 0);
          else if (u.type === 'cult' && anneau.length) pos = choisir(anneau, 0);
          else if (anneau.length) pos = choisir(anneau, 0.1);
          else if (u.type === 'cult') pos = choisir(cands.filter(c => villesD.every(v => d3.geoDistance(c, v) > 0.05)), 0.4);
          else pos = m < villesD.length && pris.every(q => d3.geoDistance(q, villesD[m]) > 0.01) ? villesD[m] : choisir(calme, 0.8);
          pos = pos || centre;
          pris.push(pos);
          pions.push({ ...u, n: part, v: nb > 1 ? '~' + Math.round(part) : u.v, total: nb > 1 ? u.v : null, nb, id: `${d.id}:${u.type}:${m}`, g: `${d.id}:${u.type}:${m}`, d, t,
            pile: u.inconnu ? 1 : 1 + T.piles.filter(x => part >= x).length, p: projection(pos), dx: 0, dy: 0, larg: 26 * t + 6 });
        }
      }
    }
    L.unites.selectAll('g.pion').data(pions, u => u.id).join('g')
      .attr('class', u => 'pion ' + u.type)
      .each(function (u) {
        const T = TYPES_UNITE[u.type];
        let h = '';
        for (let j = u.pile - 1; j >= 0; j--) {
          const o = j * 2.5;
          h += u.type === 'cult'
            ? `<path class="u-cadre" transform="translate(${o},${-o})" d="M0,-11L11,0L0,11L-11,0Z" style="fill:${u.couleur || 'var(--cult)'}"/>`
            : `<rect class="u-cadre" x="${-11 + o}" y="${-7 - o}" width="22" height="14" rx="1"/>`;
        }
        h += u.type === 'cult'
          ? (u.inconnu ? '<text class="u-txt" dy="0.35em">?</text>' : `<path class="u-sceau" d="${CHAOS}" transform="scale(6.5)"/>`)
          : INTERIEUR[u.type];
        if (T.echelon) h += `<text class="u-echelon" y="-10">${T.echelon}</text>`;
        h += `<text class="u-effectif" y="${u.type === 'cult' ? 20 : 17}">${u.inconnu ? '?' : C.court(u.n)}</text>`;
        this.innerHTML = h;
      })
      .on('mousemove', survolPion).on('mouseleave', finSurvol)
      .on('click', (e, u) => { e.stopPropagation(); naviguer(u.d._secteur, u.d.id); });
  }
  // Écarte les groupes d'unités qui se chevauchent à l'écran (quelques itérations suffisent)
  function ecarterPions() {
    const groupes = new Map();
    L.unites.selectAll('g.pion').each(u => {
      if (!groupes.has(u.g)) groupes.set(u.g, { x: u.p[0] * k, y: u.p[1] * k + u.dy * ech, w: ((u.larg || 30) + 6) * ech, h: 40 * ech, ox: 0, oy: 0, pions: [] });
      groupes.get(u.g).pions.push(u);
    });
    const gs = [...groupes.values()];
    for (let it = 0; it < 40; it++) {
      let bouge = false;
      for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
        const a = gs[i], b = gs[j];
        const dx = (b.x + b.ox) - (a.x + a.ox), dy = (b.y + b.oy) - (a.y + a.oy);
        const px = (a.w + b.w) / 2 - Math.abs(dx), py = (a.h + b.h) / 2 - Math.abs(dy);
        if (px <= 0 || py <= 0) continue;
        bouge = true;
        if (py < px) { const m = py / 2 + 0.5, sg = dy >= 0 ? 1 : -1; a.oy -= sg * m; b.oy += sg * m; }
        else { const m = px / 2 + 0.5, sg = dx >= 0 ? 1 : -1; a.ox -= sg * m; b.ox += sg * m; }
      }
      if (!bouge) break;
    }
    for (const g of gs) for (const u of g.pions) { u._ox = g.ox; u._oy = g.oy; }
  }
  function survolPion(e, u) {
    const cle = 'u:' + u.id;
    if (cle !== survolCle) {
      survolCle = cle;
      tip.innerHTML = `<strong>${esc(TYPES_UNITE[u.type].nom)}</strong>${esc(u.d.nom)}<br>Effectif : ${C.fmt(u.v)}${u.total ? `<br>${u.nb} groupements, ${C.fmt(u.total)} au total` : ''}`;
    }
    placerTip(e);
  }
  function survolSite(e, x) {
    const cle = 's:' + x.id;
    if (cle !== survolCle) { survolCle = cle; tip.innerHTML = `<strong>${esc(x.nom)}</strong>${esc(x.info || '')}`; }
    placerTip(e);
  }

  const nomZone = z => ['Cultistes', 'Entité'].includes(z.dieu) ? z.nom : 'Zone de ' + z.dieu;
  function rendreLegende() {
    const vus = new Map();
    for (const z of zonesAff()) { const n = nomZone(z); if (!vus.has(n)) vus.set(n, z.couleur); }
    const q = districts.some(d => enQuarantaine(statutDe(d)));
    $('#legende').innerHTML = '<li><i class="sw territoire"></i>Territoire confédéré</li>'
      + (vus.size ? '<li><i class="sw conteste"></i>Zone contestée</li>' : '')
      + [...vus].map(([n, c]) => `<li><i class="sw" style="background:${esc(c)}"></i>${esc(n)}</li>`).join('')
      + (q ? '<li><i class="sw quarantaine"></i>Quarantaine</li>' : '')
      + (detruitesAff().length ? '<li><i class="sw detruite"></i>Zone détruite</li>' : '')
      + ((data.sites || []).some(x => x.icone !== 'labo') ? '<li><svg class="sw-etoile" viewBox="-14 -14 28 28" aria-hidden="true">' + EMBLEME + '</svg>Site stratégique</li>' : '')
      + (villesAff().length ? '<li><i class="sw ville"></i>Ville "Too young to die"</li>' : '')
      + (villesAff().some(v => v.capitale) ? '<li><svg class="sw-etoile" viewBox="-14 -14 28 28" aria-hidden="true">' + etoileBrisee(24) + '</svg>Capitale de secteur</li>' : '')
      + (L.unites.selectAll('g.pion').size() ? '<li><svg class="sw-pion" viewBox="-12 -8 24 16" aria-hidden="true"><rect class="u-cadre" x="-11" y="-7" width="22" height="14" rx="1"/><path class="u-trait" d="M-11,-7L11,7M-11,7L11,-7"/></svg>Unité confédérée</li><li><svg class="sw-pion" viewBox="-12 -12 24 24" aria-hidden="true"><path class="u-cadre" d="M0,-11L11,0L0,11L-11,0Z" style="fill:var(--cult)"/></svg>Force cultiste</li>' : '')
      + ((data.sites || []).some(x => x.icone === 'labo') ? '<li><svg class="sw-labo" viewBox="0 0 24 24" aria-hidden="true"><path d="' + FLASK + '"/></svg>Intérêt scientifique</li>' : '');
  }

  function survolZone(e, z) {
    const cle = 'z:' + z.id;
    if (cle !== survolCle) {
      survolCle = cle;
      const d = parId[z.district];
      tip.innerHTML = z.halo
        ? `<strong>Zone contestée</strong>Autour : ${esc(z.nom)} (${esc(z.dieu)})${d ? `<br>${esc(d.nom)}` : ''}`
        : `<strong>${esc(z.nom)}</strong>${esc(z.dieu)}${d ? `<br>${esc(d.nom)}` : ''}`;
    }
    placerTip(e);
  }

  function echelleLabels() {
    svg.select('#hachures').attr('patternTransform', `rotate(45) scale(${1 / k})`);
    const el = ech < 1 ? 0.8 : 1;
    L.lab.selectAll('text').style('font-size', l => (l.taille * el / k) + 'px').style('stroke-width', (3.2 * el / k) + 'px');
    L.lab.selectAll('.l0').style('font-size', (12 * 0.62 * el / k) + 'px');
    L.sites.selectAll('g.site').attr('transform', x => `translate(${x.p[0]},${x.p[1]}) scale(${ech / k})`);
    L.villes.selectAll('g.ville').attr('transform', v => `translate(${v.p[0]},${v.p[1]}) scale(${ech / k})`);
    ecarterPions();
    L.unites.selectAll('g.pion').attr('transform', u => `translate(${u.p[0] + (u.dx * ech + (u._ox || 0)) / k},${u.p[1] + (u.dy * ech + (u._oy || 0)) / k}) scale(${u.t * ech / k})`);
    majSatellites();
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
        tip.innerHTML = `<strong>Secteur ${esc(s.nom)}</strong>${touches} district${touches > 1 ? 's' : ''} touché${touches > 1 ? 's' : ''} sur ${s.districts.length}<br>Influence cultiste : ${Math.round(influenceMoy(s.districts))} %`;
      } else {
        const s = statutDe(d);
        tip.innerHTML = `<strong>${esc(d.nom)}</strong>${badgeStatut(s.statut)}${enQuarantaine(s) && s.statut !== 'quarantaine' ? ' ' + badgeStatut('quarantaine') : ''}<br>Influence cultiste : ${s.influence} %`;
      }
    }
    placerTip(e);
  }
  function placerTip(e) {
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
  function naviguer(secteur, district, ville) {
    const h = secteur ? '#' + secteur + (district ? '/' + district + (ville ? '/' + ville : '') : '') : '#';
    if (location.hash === h || (h === '#' && !location.hash)) lireHash();
    else location.hash = h;
  }
  function lireHash() {
    const [s, d, v] = decodeURIComponent(location.hash.slice(1)).split('/');
    const ville = villesAff().find(x => x.id === v && x.district === d);
    etat.ville = ville ? ville.id : null;
    if (s && secteurParId[s]) {
      etat.secteur = s;
      if (d && parId[d] && parId[d]._secteur === s) { etat.niveau = 'district'; etat.district = d; }
      else { etat.niveau = 'secteur'; etat.district = null; }
    } else { etat.niveau = 'monde'; etat.secteur = null; etat.district = null; }
    rendre();
    $('#panel').scrollTop = 0;
    // Sur téléphone, la fiche d'une ville est sous la carte : on l'amène à l'écran
    if (etat.ville && window.matchMedia('(max-width: 900px)').matches) $('#panel').scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth' });
  }
  window.addEventListener('hashchange', lireHash);

  // ---------- Fil d'Ariane ----------
  function rendreFil() {
    const crumbs = [{ nav: '', nom: 'Monde' }];
    if (etat.secteur) crumbs.push({ nav: etat.secteur, nom: secteurParId[etat.secteur].nom });
    if (etat.district) crumbs.push({ nav: etat.secteur + '/' + etat.district, nom: parId[etat.district].nom });
    if (etat.ville) crumbs.push({ nav: '', nom: villeParId(etat.ville).nom });
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
    const [s, d, v] = b.dataset.nav.split('/');
    naviguer(s || undefined, d || undefined, v || undefined);
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


  function blocForces(a) {
    const f = a.forces;
    const carte = cle => {
      const fa = f[cle];
      const max = Math.max(1, ...fa.unites.map(u => u.v.n));
      const lignes = fa.unites.length ? fa.unites.map(u => `
        <div class="unite"><span>${esc(u.nom)}</span><span class="n">${C.fmt(u.v)}</span>
        <span class="ub"><i style="width:${(u.v.n / max * 100).toFixed(1)}%"></i></span></div>`).join('')
        : '<div class="vide">Aucune force engagée.</div>';
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
    // Regroupe les événements par date : on cherche d'abord "quand", puis "quoi"
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
      const st = statutDe(o);
      droite = '<span class="statuts">' + badgeStatut(st.statut) + (st.quarantaine && st.statut !== 'quarantaine' ? badgeStatut('quarantaine') : '') + '</span>';
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

  // ---------- Supériorité aérienne ----------
  const NIV_AIR = ['totale', 'nette', 'contestee', 'perdue'];
  const badgeAir = n => `<span class="ds-badge air ${esc(n)}">${esc((data.niveauxAir || {})[n] || n)}</span>`;
  function blocAirDistrict(d) {
    if (!d.air || !d.air.niveau) return '';
    return `<section class="bloc"><h3 class="ds-section-title">Supériorité aérienne</h3>
      <div class="air-ligne">${badgeAir(d.air.niveau)}${d.air.note ? `<p class="ds-supporting">${esc(d.air.note)}</p>` : ''}</div></section>`;
  }
  function blocAirListe(liste, detail) {
    const avec = liste.filter(d => d.air && d.air.niveau);
    if (!avec.length) return '';
    if (detail) {
      return `<section class="bloc"><h3 class="ds-section-title">Supériorité aérienne</h3><ul class="air-liste">${avec.map(d =>
        `<li><span>${esc(d.nom)}</span>${badgeAir(d.air.niveau)}</li>`).join('')}</ul></section>`;
    }
    const c = {}; avec.forEach(d => { c[d.air.niveau] = (c[d.air.niveau] || 0) + 1; });
    return `<section class="bloc"><h3 class="ds-section-title">Supériorité aérienne</h3><ul class="air-liste">${NIV_AIR.filter(n => c[n]).map(n =>
      `<li>${badgeAir(n)}<span>${c[n]} district${c[n] > 1 ? 's' : ''}</span></li>`).join('')}</ul></section>`;
  }

  const villeParId = id => villesAff().find(v => v.id === id);
  function panneauVille(v) {
    const d = parId[v.district], s = secteurParId[d._secteur];
    const [lib, cls] = VILLES.niveau(v.etat);
    const zone = zonesAff().find(z => z.district === d.id);
    const tot = C.somme(v.garnison.map(u => u.effectif));
    return `<div class="p-head"><h2 class="ds-display">${esc(v.nom)}</h2>
      <p class="ds-supporting">Too young to die · ${esc(d.nom)}, secteur ${esc(s.nom)}</p>
      <div class="etat-ville ${cls}"><div class="ev-chiffre"><strong>${v.etat} %</strong><span class="ds-badge etat ${cls}">${esc(lib)}</span></div>
        <div class="piste" role="img" aria-label="État de la ville : ${v.etat} %"><i style="width:${v.etat}%"></i></div></div></div>
      <figure class="illu-ville">${VILLES.dessiner(v, zone && zone.couleur)}<figcaption class="ds-supporting">Vue reconstituée à partir des derniers rapports, avec un signal qui se dégrade à mesure que la ville tombe, ce qui, pour certaines, ne laisse plus grand-chose à voir.</figcaption></figure>
      <section class="bloc"><h3 class="ds-section-title">Situation</h3><p class="texte-ville">${esc(v.description)}</p></section>
      <section class="bloc"><h3 class="ds-section-title">Garnison présente</h3>
        <div class="tableau"><table class="ds-table"><tbody>${v.garnison.map(u => `<tr><td>${esc(u.nom)}</td><td class="num">${C.fmt(u.effectif)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">Total</th><td class="num">${C.fmt(tot)}</td></tr></tfoot></table></div></section>
      <section class="bloc"><button class="ds-btn ds-btn-outline" type="button" data-nav="${esc(s.id + '/' + d.id)}">Voir le ${esc(d.nom)}</button></section>`;
  }

  function blocVilles(vs) {
    if (!vs.length) return '';
    return `<section class="bloc"><h3 class="ds-section-title">Villes "Too young to die"</h3><div class="liste">${vs.map(v => {
      const [lib, cls] = VILLES.niveau(v.etat), d = parId[v.district];
      return `<button class="item" type="button" data-nav="${esc(d._secteur + '/' + d.id + '/' + v.id)}"><span class="t">${esc(v.nom)}</span><span class="ds-badge etat ${cls}">${v.etat} % · ${esc(lib)}</span>
        <span class="mini ville" aria-hidden="true"><i style="width:${v.etat}%"></i></span></button>`;
    }).join('')}</div></section>`;
  }

  function rendrePanel() {
    let html;
    if (etat.ville && villeParId(etat.ville)) {
      $('#panel').innerHTML = panneauVille(villeParId(etat.ville));
      return;
    }
    const archive = etat.replay !== null;
    // Contenu réparti en onglets pour éviter un long défilement ; l'en-tête reste visible
    const forcesPop = a => {
      if (archive) return { forces: '', pop: '' };
      const civils = vide(Object.values(a.civils)) ? '' : blocCivils(a);
      const forces = a.forces.confederation.unites.length || a.forces.cultistes.unites.length ? blocForces(a) : '';
      const pertes = vide(C.FACTIONS.flatMap(f => Object.values(a.pertes[f]))) ? '' : blocPertes(a);
      return { forces: forces + pertes, pop: civils };
    };
    let tete, onglets;
    if (etat.niveau === 'monde') {
      const compte = {};
      let nq = 0;
      districts.forEach(d => { const st = statutDe(d); compte[st.statut] = (compte[st.statut] || 0) + 1; if (st.quarantaine && st.statut !== 'quarantaine') nq++; });
      tete = `<h2 class="ds-display">Situation mondiale</h2>
        <div class="statuts">${Object.keys(data.statuts).filter(s => compte[s]).map(s => `<span class="ds-badge statut ${s}">${compte[s]} ${esc(data.statuts[s]).toLowerCase()}</span>`).join('')}${nq ? `<span class="ds-badge statut quarantaine">dont ${nq} en quarantaine</span>` : ''}</div>
        ${balance(influenceMoy(districts))}`;
      const fp = forcesPop(C.agrege(districts));
      onglets = [
        ['apercu', 'Aperçu', blocFronts() + `<section class="bloc"><h3 class="ds-section-title">Secteurs géographiques</h3><div class="liste">${data.secteurs.filter(s => s.geographique !== false).map(s => itemListe(s, s.id, s.districts)).join('')}</div></section>`
          + (data.secteurs.some(s => s.geographique === false) ? `<section class="bloc"><h3 class="ds-section-title">Secteurs organisationnels</h3><div class="liste">${data.secteurs.filter(s => s.geographique === false).map(s => itemListe(s, s.id, s.districts)).join('')}</div></section>` : '')],
        ['villes', 'Villes', blocVilles(villesAff().slice().sort((a, b) => a.etat - b.etat))],
        ['forces', 'Forces', (archive ? '' : blocAirListe(districts, false)) + fp.forces],
        ['pop', 'Population', fp.pop],
        ['evt', 'Événements', blocEvenements(() => true, 'Événements')]
      ];
    } else if (etat.niveau === 'secteur') {
      const s = secteurParId[etat.secteur];
      const ids = new Set(s.districts.map(d => d.id));
      tete = `<h2 class="ds-display">${esc(s.nom)}</h2>
        <p class="ds-supporting">${s.geographique === false ? 'Secteur organisationnel, hors carte' : 'Secteur géographique'}, ${s.districts.length} district${s.districts.length > 1 ? 's' : ''}</p>
        ${balance(influenceMoy(s.districts))}`;
      const fp = forcesPop(C.agrege(s.districts));
      onglets = [
        ['apercu', 'Aperçu', (s.note && !archive ? `<p class="note">${esc(s.note)}</p>` : '')
          + `<section class="bloc"><h3 class="ds-section-title">Districts</h3><div class="liste">${s.districts.map(d => itemListe(d, s.id + '/' + d.id)).join('') || '<p class="vide">Aucun district.</p>'}</div></section>`],
        ['villes', 'Villes', blocVilles(villesAff().filter(v => ids.has(v.district)))],
        ['forces', 'Forces', (archive ? '' : blocAirListe(s.districts, true)) + fp.forces],
        ['pop', 'Population', fp.pop],
        ['evt', 'Événements', blocEvenements(e => (e.portee.type === 'secteur' && e.portee.id === s.id) || (e.portee.type === 'district' && ids.has(e.portee.id)), 'Événements du secteur')]
      ];
    } else {
      const d = parId[etat.district], s = secteurParId[d._secteur], st = statutDe(d);
      const fl = { hausse: '▲', baisse: '▼', stable: '■' };
      tete = `<h2 class="ds-display">${esc(d.nom)}</h2>
        <p class="ds-supporting">Secteur ${esc(s.nom)}</p>
        <div class="statuts">${badgeStatut(st.statut)}${st.quarantaine && st.statut !== 'quarantaine' ? badgeStatut('quarantaine') : ''}
        ${!archive && d.tendance ? `<span class="tendance ${d.tendance}"><span aria-hidden="true">${fl[d.tendance]}</span> ${esc(C.TENDANCES[d.tendance])}</span>` : ''}</div>
        ${balance(st.influence)}`;
      const fp = forcesPop(C.agrege([d]));
      onglets = [
        ['apercu', 'Aperçu', (d.note && !archive ? `<p class="note">${esc(d.note)}</p>` : '') + blocVilles(villesAff().filter(v => v.district === d.id))],
        ['forces', 'Forces', (archive ? '' : blocAirDistrict(d)) + fp.forces],
        ['pop', 'Population', fp.pop],
        ['evt', 'Événements', blocEvenements(e => (e.portee.type === 'district' && e.portee.id === d.id) || (e.portee.type === 'secteur' && e.portee.id === s.id), 'Événements récents')]
      ];
    }
    onglets = onglets.filter(o => o[2] && o[2].trim());
    const actif = onglets.find(o => o[0] === etat.onglet) || onglets[0];
    html = `<div class="p-head">${tete}</div>
      ${onglets.length > 1 ? `<div class="p-onglets"><div class="ds-tabs" role="tablist" aria-label="Rubriques">${onglets.map(o =>
        `<button class="ds-tab ${o === actif ? 'active' : ''}" type="button" role="tab" aria-selected="${o === actif}" data-onglet="${o[0]}">${o[1]}</button>`).join('')}</div></div>` : ''}
      <div class="p-corps" role="tabpanel">${actif ? actif[2] : ''}</div>`;
    $('#panel').innerHTML = html;
  }
  $('#panel').addEventListener('click', e => {
    const o = e.target.closest('[data-onglet]');
    if (o) { etat.onglet = o.dataset.onglet; rendrePanel(); $('#panel').scrollTop = 0; return; }
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
        ${etat.replay !== null ? '<p class="ds-supporting">Archive</p>' : ''}</div></div>
      <div class="t-jauge" role="img" aria-label="Tension ${Math.round(t)} sur 100"><div class="cur" style="left:calc(${t}% - 1px)"></div>
        ${P.map(p => `<span class="tick" style="left:${p.min}%">${p.min}</span>`).join('')}</div>
      <ol class="paliers">${P.map((p, j) => `
        <li class="pal ${j < i ? 'passe' : j === i ? 'actuel' : ''}" ${j === i ? 'aria-current="step"' : ''}>
          <span class="num">${j + 1}</span>
          <span class="nm">${esc(p.nom)}</span></li>`).join('')}</ol>`;
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
    el.innerHTML = `<strong>Archive du ${esc(data.historique[etat.replay].date)}</strong><span>La carte telle qu'elle était à cette date, avec ses statuts, ses villes, sa tension et ses événements.</span>`;
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

  // Légende : tiroir dépliable sur le bord droit de la carte
  $('#btnLegende').addEventListener('click', e => {
    const ouvert = $('#tiroirLegende').classList.toggle('ouvert');
    e.currentTarget.setAttribute('aria-expanded', ouvert);
  });

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
