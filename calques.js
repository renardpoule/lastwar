// Calques de la carte, première partie : fond (espace, océan, terres, relief, frontières) et matière vivante
// (zones cultistes, brouillard, cicatrices nucléaires, bombardements, cordons). Les symboles sont dans symboles.js.
(() => {
  const I = CARTE._, RAD = I.RAD, G = GLYPHES;
  const mixc = (a, b, t) => d3.interpolateRgb(a, b)(t);
  const alpha = (c, a) => { const k = d3.color(c); k.opacity = a; return k + ''; };
  const COL = I.COL = {
    espace: '#07060e', ocean: '#0e1226', oceanClair: '#161c3a', grille: 'rgba(150,160,235,.075)',
    terre: '#2a2c54', terreDim: '#191a33', cote: 'rgba(158,168,255,.6)', coteHalo: 'rgba(110,120,230,.13)',
    conteste: '#c8923a', perdu: '#6f1d2c', reconquete: '#3aa6c8', quarantaine: '#e6d24a',
    bDist: 'rgba(205,210,255,.2)', bSect: 'rgba(222,226,255,.5)', sel: '#c4b5fd',
    fleuve: 'rgba(96,150,240,.5)', massif: 'rgba(196,202,255,.16)', desert: 'rgba(222,186,128,.14)',
    cc: '#7cb4ff', ccFonce: '#16204a', ccClair: '#b9d2ff', cult: '#ff5a5f', or: '#e9c46a', science: '#6fd3ff', anormal: '#e879f9',
    napalm: '#f5c13d', missiles: '#f07a2e', stab: '#6f9bff', fort: '#58d08a', renf: '#8df0b3', texte: '#eef0ff', halo: 'rgba(8,7,18,.88)',
    etat: { ok: '#8fe3b0', moyen: '#e6d24a', grave: '#f0a53a', critique: '#ff5a5f' }
  };

  // ---------- Motifs (tuiles dessinées en double résolution) ----------
  const DEF = {
    quarantaine: [10, (x, t) => { x.strokeStyle = 'rgba(230,210,74,.55)'; x.lineWidth = 1.6; x.beginPath(); for (const o of [-t, 0, t]) { x.moveTo(o, t); x.lineTo(o + t, 0); } x.stroke(); }],
    conteste: [8, (x, t) => { x.fillStyle = 'rgba(232,170,70,.5)'; for (const [a, b] of [[1.5, 1.5], [5.5, 5.5]]) { x.beginPath(); x.arc(a, b, 0.9, 0, 7); x.fill(); } }],
    napalm: [9, (x, t) => { x.strokeStyle = 'rgba(245,193,61,.6)'; x.lineWidth = 1.5; x.beginPath(); for (const o of [-t, 0, t]) { x.moveTo(o, 0); x.lineTo(o + t, t); } x.stroke(); }],
    missiles: [9, (x, t) => { x.strokeStyle = 'rgba(240,122,46,.6)'; x.lineWidth = 1.3; x.beginPath(); for (const o of [-t, 0, t]) { x.moveTo(o, t); x.lineTo(o + t, 0); } x.stroke(); }],
    reprise: [9, (x, t) => { x.strokeStyle = 'rgba(124,180,255,.34)'; x.lineWidth = 1.1; x.beginPath(); for (const o of [-t, 0, t]) { x.moveTo(o, t); x.lineTo(o + t, 0); } x.stroke(); }],
    massif: [12, (x, t) => { x.strokeStyle = 'rgba(200,206,255,.2)'; x.lineWidth = 1; x.lineCap = 'round'; x.beginPath(); for (const [a, b] of [[2, 4], [8, 10]]) { x.moveTo(a - 1.6, b + 1.4); x.lineTo(a, b - 1.4); x.lineTo(a + 1.6, b + 1.4); } x.stroke(); }],
    desert: [10, (x, t) => { x.fillStyle = 'rgba(226,190,130,.3)'; for (const [a, b] of [[2, 2], [7, 4], [4, 8]]) x.fillRect(a, b, 0.9, 0.9); }],
    brume: [64, (x, t) => { const r = G.graine('brume'); for (let i = 0; i < 700; i++) { const v = r(); x.fillStyle = v > 0.5 ? `rgba(255,255,255,${(r() * 0.16).toFixed(3)})` : `rgba(0,0,0,${(r() * 0.3).toFixed(3)})`; x.fillRect(r() * t, r() * t, 1 + r() * 1.4, 1 + r() * 0.8); } }]
  };
  const motifs = {};
  function motif(nom, dx = 0, dy = 0) {
    if (!motifs[nom]) {
      const [t, f] = DEF[nom], c = document.createElement('canvas'), x = c.getContext('2d');
      c.width = c.height = t * 2; x.scale(2, 2); f(x, t);
      motifs[nom] = I.cx.base.createPattern(c, 'repeat');
    }
    const k = I.cam.mode === 'plan' ? I.cam.t.k : 1;
    motifs[nom].setTransform(new DOMMatrix().scaleSelf(0.5 / k).translateSelf(dx, dy));
    return motifs[nom];
  }
  I.motif = motif;
  // Point dans l'espace du contexte "vue" (plan : coordonnées du planisphère ; globe : écran)
  const Pv = I.Pv = c => { const p = I.P(c); if (!p) return null; const t = I.cam.t; return I.cam.mode === 'plan' ? [(p[0] - t.x) / t.k, (p[1] - t.y) / t.k] : p; };
  // Rayon (dans l'espace "vue") d'un cercle de r degrés autour de c
  const rayonV = I.rayonV = (c, r) => { const a = Pv(c), b = Pv([c[0], c[1] + (c[1] > 0 ? -r : r)]); return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0; };

  // ---------- Relief (Natural Earth) : anneaux remis dans le sens attendu par d3 ----------
  function preparerRelief() {
    const R = I.relief;
    if (!R || R._pret) return R;
    const poly = liste => ({ type: 'MultiPolygon', coordinates: liste.map(o => { let g = { type: 'Polygon', coordinates: [o.c] }; if (d3.geoArea(g) > 2 * Math.PI) g = { type: 'Polygon', coordinates: [o.c.slice().reverse()] }; return g.coordinates; }) });
    const exclus = /Pendjab|Caatinga|Steppe de la Faim/;
    R.gDeserts = poly(R.deserts.filter(o => !exclus.test(o.n)));
    R.gMassifs = poly(R.massifs.filter(o => Math.abs(d3.geoCentroid({ type: 'LineString', coordinates: o.c })[1]) < 72));
    R.gLacs = poly(R.lacs);
    R.gFleuves = [[0, 2], [3, 4], [5, 9]].map(([a, b]) => ({ type: 'MultiLineString', coordinates: R.fleuves.filter(f => f.r >= a && f.r <= b).map(f => f.c) }));
    R._pret = true;
    return R;
  }

  // ---------- Soleil : la nuit suit l'heure réelle et la saison de la date du RP ----------
  function antisolaire(sc) {
    const d = I.dateJs(sc.date), now = new Date();
    const N = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
    const decl = -23.44 * Math.cos(2 * Math.PI * (N + 10) / 365);
    const lon = -(now.getUTCHours() + now.getUTCMinutes() / 60 - 12) * 15;
    return [((lon + 180 + 540) % 360) - 180, -decl];
  }

  // ---------- Couleur d'un district selon son statut ----------
  const teintes = new Map();
  function teinteStatut(st, dim) {
    const cle = st.statut + '|' + Math.round((st.influence || 0) / 5) + '|' + (dim ? 1 : 0);
    if (teintes.has(cle)) return teintes.get(cle);
    const baseC = dim ? COL.terreDim : COL.terre, inf = Math.min(1, (st.influence || 0) / 100);
    let c = baseC;
    if (st.statut === 'perdu') c = mixc(baseC, COL.perdu, 0.62);
    else if (st.statut === 'conteste') c = mixc(baseC, COL.conteste, 0.1 + inf * 0.22);
    else if (st.statut === 'reconquete') c = mixc(baseC, COL.reconquete, 0.22);
    else if (st.statut === 'quarantaine') c = mixc(baseC, '#3b3a2a', 0.5);
    else c = inf < 0.08 ? baseC : mixc(baseC, COL.conteste, inf * 0.12);
    teintes.set(cle, c);
    return c;
  }
  function couleurDistrict(d, sc, sel) {
    const dim = !!sel && d._secteur !== sel, a = teinteStatut(sc.statut(d), dim);
    if (I.mix && sc === I.sceneA) return mixc(a, teinteStatut(I.mix.b.statut(d), dim), I.mix.u);
    return a;
  }

  // Terres : tracé fusionné sur le planisphère ; ailleurs, assemblage des districts déjà projetés (pas de second passage)
  I.terres = () => I.cam.mode === 'plan' ? I.forme('terres', I.monde.terres)
    : I.formeCalc('terres*', () => { const p = new Path2D(); for (const d of I.districts) if (d._geo) p.addPath(I.forme('d:' + d.id, I.g(d, '_geo'))); return p; });

  const etoiles = (() => { const r = G.graine('ciel'); return d3.range(170).map(() => [r(), r(), 0.3 + r() * 0.9, 0.15 + r() * 0.55]); })();

  function fond(ctx) {
    const { W, H } = I.dim(), cam = I.cam;
    I.ecran(ctx);
    ctx.fillStyle = COL.espace; ctx.fillRect(0, 0, W, H);
    if (cam.mode !== 'plan') {
      for (const [x, y, r, a] of etoiles) { ctx.fillStyle = `rgba(215,220,255,${a})`; ctx.fillRect(x * W, y * H, r, r); }
    }
    if (cam.mode === 'globe') {
      const R = cam.R * cam.kg, [x, y] = cam.c;
      let g = ctx.createRadialGradient(x, y, R * 0.96, x, y, R * 1.22);
      g.addColorStop(0, 'rgba(124,118,255,.34)'); g.addColorStop(0.35, 'rgba(110,100,240,.12)'); g.addColorStop(1, 'rgba(110,100,240,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 1.22, 0, 7); ctx.fill();
      g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
      g.addColorStop(0, COL.oceanClair); g.addColorStop(0.7, COL.ocean); g.addColorStop(1, '#090b1a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    } else {
      I.vue(ctx);
      ctx.fillStyle = COL.ocean; ctx.fill(I.forme('sphere', { type: 'Sphere' }));
    }
    I.vue(ctx);
    ctx.strokeStyle = COL.grille; ctx.lineWidth = I.px(0.6); ctx.stroke(I.forme('grat', () => d3.geoGraticule10()));
  }

  function monde(ctx, sc) {
    const cam = I.cam, nav = I.nav, detail = cam.mode === 'plan' || !I.mobile, z = I.zl();
    const px = I.px, plan = cam.mode === 'plan', terres = I.terres(), fd = d => I.forme('d:' + d.id, I.g(d, '_geo'));
    // Sur le globe, la côte vient du maillage des rivages (les terres y sont l'assemblage des districts)
    const cote = plan ? terres : I.forme('cotes', I.g(I.monde, 'cotes'));
    I.vue(ctx);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
    if (plan || !I.mobile) { ctx.strokeStyle = COL.coteHalo; ctx.lineWidth = px(6); ctx.stroke(cote); }
    ctx.fillStyle = COL.terre; ctx.fill(terres);
    const sSel = nav.niveau !== 'monde' && I.secteurParId[nav.secteur], sel = sSel && sSel._geo ? nav.secteur : null;
    for (const d of I.districts) {
      if (!d._geo) continue;
      const c = couleurDistrict(d, sc, sel);
      if (c === COL.terre) continue;
      ctx.fillStyle = c; ctx.fill(fd(d));
      if (!plan) { ctx.strokeStyle = c; ctx.lineWidth = 0.7; ctx.stroke(fd(d)); }
    }
    // Îles ajoutées à la carte (Ganzir, HCP)
    for (const s of I.data.sites || []) if (s.ile) {
      const f = I.forme('ile:' + s.id, () => I.tache({ id: s.id, centre: s.coord, rayon: s.rayon || 1 }));
      ctx.fillStyle = COL.terre; ctx.fill(f); ctx.strokeStyle = COL.cote; ctx.lineWidth = px(0.9); ctx.stroke(f);
    }
    // Relief : déserts pointillés, massifs en chevrons, lacs et fleuves (les plus petits n'apparaissent qu'en zoomant)
    const R = detail && preparerRelief();
    if (R) {
      ctx.save(); ctx.clip(terres);
      ctx.fillStyle = motif('desert'); ctx.fill(I.forme('deserts', R.gDeserts));
      ctx.fillStyle = 'rgba(8,8,22,.13)'; ctx.fill(I.forme('massifs', R.gMassifs));
      ctx.fillStyle = motif('massif'); ctx.fill(I.forme('massifs', R.gMassifs));
      ctx.restore();
      ctx.fillStyle = COL.ocean; ctx.fill(I.forme('lacs', R.gLacs));
      ctx.strokeStyle = COL.fleuve;
      ctx.lineWidth = px(1.1); ctx.stroke(I.forme('fl0', R.gFleuves[0]));
      if (z >= 1.7) { ctx.lineWidth = px(0.8); ctx.stroke(I.forme('fl1', R.gFleuves[1])); }
      if (z >= 3.5) { ctx.lineWidth = px(0.6); ctx.stroke(I.forme('fl2', R.gFleuves[2])); }
    }
    // Quarantaine : hachures jaunes
    if (I.couches.civil) for (const d of I.districts) if (d._geo && sc.enQuarantaine(d) && !(sel && d._secteur !== sel)) { ctx.fillStyle = motif('quarantaine'); ctx.fill(I.forme('d:' + d.id, I.g(d, '_geo'))); }
    // Nuit et pénombre
    const cleN = 'nuit:' + sc.date + ':' + Math.floor(Date.now() / 6e5), as = antisolaire(sc);
    ctx.fillStyle = 'rgba(3,3,14,.2)'; ctx.fill(I.forme(cleN + 'a', () => d3.geoCircle().center(as).radius(90).precision(3)()));
    ctx.fillStyle = 'rgba(3,3,14,.14)'; ctx.fill(I.forme(cleN + 'b', () => d3.geoCircle().center(as).radius(81).precision(3)()));
    // Frontières
    ctx.strokeStyle = COL.bDist; ctx.lineWidth = px(0.7); ctx.setLineDash([px(3), px(3)]); ctx.stroke(I.forme('bDist', I.g(I.monde, 'bDist')));
    ctx.setLineDash([]);
    ctx.strokeStyle = COL.bSect; ctx.lineWidth = px(1.15); ctx.stroke(I.forme('bSect', I.g(I.monde, 'bSect')));
    ctx.strokeStyle = COL.cote; ctx.lineWidth = px(0.9); ctx.stroke(cote);
    // Sélection : contour du secteur ou du district ouvert
    const cible = nav.niveau === 'district' ? I.parId[nav.district] : nav.niveau === 'secteur' ? sSel : null;
    if (cible && cible._geo) {
      const f = I.forme('sel:' + cible.id, I.g(cible, '_geo'));
      ctx.strokeStyle = alpha(COL.sel, 0.16); ctx.lineWidth = px(4); ctx.stroke(f);
      ctx.strokeStyle = alpha(COL.sel, 0.85); ctx.lineWidth = px(1.2); ctx.stroke(f);
    }
    if (cam.mode === 'globe') {
      // Limbe : ombre sur le bord de la sphère
      I.ecran(ctx);
      const Rg = cam.R * cam.kg, [x, y] = cam.c, g = ctx.createRadialGradient(x, y, Rg * 0.72, x, y, Rg);
      g.addColorStop(0, 'rgba(4,4,14,0)'); g.addColorStop(1, 'rgba(4,4,14,.5)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, Rg, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(160,165,255,.4)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // Rideau de comparaison : la moitié droite montre une autre date
  function avecRideau(ctx, dessiner) {
    const { W, H, dpr } = I.dim();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W * dpr, H * dpr);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    dessiner(I.sceneA, false);
    if (!I.rideau) return;
    ctx.save();
    I.ecran(ctx); ctx.beginPath(); ctx.rect(I.rideau.x, 0, W - I.rideau.x, H); ctx.clip();
    ctx.clearRect(0, 0, W, H);
    dessiner(I.rideau.sc, true);
    ctx.restore();
  }
  I.avecRideau = avecRideau;

  function base() {
    const ctx = I.cx.base;
    avecRideau(ctx, sc => { fond(ctx); monde(ctx, sc); });
  }

  // =====================================================================================================
  // Matière vivante
  // =====================================================================================================
  // Zones à dessiner : celles de la scène, ou un mélange avec la scène suivante pendant le film
  function zonesDe(sc) {
    if (!I.mix || sc !== I.sceneA) return sc.zones.map(z => ({ z, a: 1 }));
    const B = I.mix.b.zones, u = I.mix.u, out = [], vus = new Set();
    for (const z of sc.zones) {
      vus.add(z.id);
      const zb = B.find(x => x.id === z.id);
      if (!zb) out.push({ z, a: 1 - u });
      else if (!z.contour && !zb.contour) out.push({ z: { ...zb, rayon: z.rayon + (zb.rayon - z.rayon) * u, centre: [z.centre[0] + (zb.centre[0] - z.centre[0]) * u, z.centre[1] + (zb.centre[1] - z.centre[1]) * u], pleine: u > 0.5 ? zb.pleine : z.pleine, cordon: u > 0.5 ? zb.cordon : z.cordon }, a: 1 });
      else out.push({ z: u > 0.5 ? zb : z, a: 1 });
    }
    for (const zb of B) if (!vus.has(zb.id)) out.push({ z: zb.contour ? { ...zb, _ech: 0.3 + 0.7 * u } : { ...zb, rayon: zb.rayon * (0.25 + 0.75 * u) }, a: u });
    return out;
  }
  I.zonesDe = zonesDe;
  const matiereDe = z => /nargal/i.test(z.dieu || '') ? 'veines' : /izala/i.test(z.dieu || '') ? 'fractures' : 'ondes';
  const centreZone = z => z.contour ? [d3.mean(z.contour, p => p[0]), d3.mean(z.contour, p => p[1])] : z.centre;
  const rayonZone = z => { if (!z.contour) return +z.rayon || 1; const c = centreZone(z), cos = Math.max(0.2, Math.cos(c[1] * RAD)); return d3.max(z.contour, p => Math.hypot((p[0] - c[0]) * cos, p[1] - c[1])); };

  // Veines de Nargal : branches qui partent du cœur et se ramifient (tracées en degrés, stables par zone)
  const textures = new Map();
  function veines(z) {
    const cle = 'v:' + z.id + ':' + (z.contour ? z.contour.length : Math.round((+z.rayon || 1) * 2));
    if (textures.has(cle)) return textures.get(cle);
    const r = G.graine(z.id + 'veines'), c = centreZone(z), R = rayonZone(z) * 1.25, cos = Math.max(0.2, Math.cos(c[1] * RAD)), lignes = [];
    const pousse = (x, y, ang, lg, prof) => {
      const pts = [[x, y]], pas = R / 11;
      let d = 0;
      while (d < lg) {
        ang += (r() - 0.5) * 0.9; x += Math.cos(ang) * pas / cos; y += Math.sin(ang) * pas; d += pas; pts.push([x, y]);
        if (prof < 2 && r() < 0.24) pousse(x, y, ang + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.6), (lg - d) * 0.7, prof + 1);
      }
      lignes.push({ pts, prof });
    };
    const n = 8 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) pousse(c[0], c[1], i / n * 2 * Math.PI + r() * 0.5, R, 0);
    textures.set(cle, lignes);
    return lignes;
  }
  // Fractures d'Izala : éclats triangulés autour du cœur
  function fractures(z) {
    const cle = 'f:' + z.id + ':' + (z.contour ? z.contour.length : Math.round((+z.rayon || 1) * 2));
    if (textures.has(cle)) return textures.get(cle);
    const r = G.graine(z.id + 'fractures'), c = centreZone(z), R = rayonZone(z) * 1.3, cos = Math.max(0.2, Math.cos(c[1] * RAD)), pts = [[c[0], c[1]]];
    const n = Math.round(Math.min(46, 16 + R * 5));
    for (let i = 0; i < n; i++) { const a = r() * 2 * Math.PI, d = R * Math.sqrt(0.04 + r() * 0.96); pts.push([c[0] + d * Math.cos(a) / cos, c[1] + d * Math.sin(a)]); }
    const del = d3.Delaunay.from(pts), tris = [];
    for (let i = 0; i < del.triangles.length; i += 3) tris.push([del.triangles[i], del.triangles[i + 1], del.triangles[i + 2], r()]);
    const o = { pts, tris };
    textures.set(cle, o);
    return o;
  }

  function texture(ctx, z, clair, t) {
    const m = matiereDe(z), px = 1;
    I.ecran(ctx);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (m === 'veines') {
      const L = veines(z);
      for (const passe of [0, 1]) {
        ctx.setLineDash(passe ? [5, 15] : []); ctx.lineDashOffset = passe ? -t * 9 : 0;
        for (const l of L) {
          ctx.strokeStyle = passe ? alpha(clair, 0.75) : alpha(clair, 0.3 - l.prof * 0.06);
          ctx.lineWidth = passe ? 1.3 - l.prof * 0.3 : 2.1 - l.prof * 0.55;
          ctx.beginPath(); let trace = false;
          for (const c of l.pts) { const p = I.P(c); if (!p) { trace = false; continue; } if (trace) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); trace = true; }
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    } else if (m === 'fractures') {
      const F = fractures(z), P = F.pts.map(c => I.P(c));
      for (const [a, b, c, v] of F.tris) {
        if (!P[a] || !P[b] || !P[c]) continue;
        // Chaque éclat a sa propre lueur, qui glisse lentement
        const lum = 0.5 + 0.5 * Math.sin(t * 0.7 + v * 12.6);
        ctx.fillStyle = v > 0.55 ? alpha(clair, 0.05 + 0.13 * lum) : `rgba(4,2,14,${(0.1 + 0.2 * lum * v).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); ctx.lineTo(P[c][0], P[c][1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = alpha(clair, 0.34); ctx.lineWidth = 0.7 * px; ctx.stroke();
      }
    } else {
      const c = centreZone(z), p = I.P(c), R = rayonV(c, rayonZone(z)) * (I.cam.mode === 'plan' ? I.cam.t.k : 1);
      if (p) for (let i = 0; i < 4; i++) {
        const u = ((t * 0.12 + i / 4) % 1);
        ctx.strokeStyle = alpha(clair, 0.4 * (1 - u)); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p[0], p[1], R * (0.15 + u * 1.1), 0, 7); ctx.stroke();
      }
    }
  }

  // Qui avance sur ce bord cette semaine : pointe d'une offensive toute proche, sinon tendance du district
  function pression(sc, z) {
    const tips = sc.axes.map(a => ({ camp: a.camp, pts: a.trace }));
    const d = I.parId[z.district], t = sc.direct && d ? d.tendance : null, defaut = t === 'hausse' ? 'cult' : t === 'baisse' ? 'cc' : null;
    const chocs = sc.evtsTour.filter(e => e.gravite === 'critique' && e.lieux).flatMap(e => e.lieux);
    const frappe = sc.frappes.some(f => f.zone === z.id || (f.centre && d3.geoDistance(f.centre, centreZone(z)) / RAD < rayonZone(z)));
    return c => {
      let camp = defaut, best = 4.2;
      for (const a of tips) for (const q of a.pts) { const dd = d3.geoDistance(c, q) / RAD; if (dd < best) { best = dd; camp = a.camp; } }
      let force = frappe ? 1 : 0;
      if (chocs.some(q => d3.geoDistance(c, q) / RAD < 3)) force++;
      return { camp, force };
    };
  }
  // Dents le long du bord d'une zone : tournées vers l'extérieur quand les cultistes avancent, vers l'intérieur
  // quand la Confédération reprend du terrain, plus hautes là où les combats sont les plus durs
  const pressions = new Map();
  function dents(ctx, sc, z, ring, clair) {
    const n = ring.length, cleP = sc.id + z.id + ':' + n;
    let pres = pressions.get(cleP);
    if (!pres) { const pr = pression(sc, z); pres = ring.map((c, i) => i % 3 === 1 ? pr(c) : null); for (let i = 0, der = pres.find(Boolean) || { camp: null, force: 0 }; i < n; i++) { if (pres[i]) der = pres[i]; else pres[i] = der; } pressions.set(cleP, pres); if (pressions.size > 80) pressions.delete(pressions.keys().next().value); }
    const P = ring.map(c => I.P(c));
    let aire = 0;
    for (let i = 1; i < n; i++) if (P[i] && P[i - 1]) aire += P[i - 1][0] * P[i][1] - P[i][0] * P[i - 1][1];
    const sens = aire > 0 ? 1 : -1; // signe qui fait pointer la normale vers l'extérieur
    I.ecran(ctx);
    let reste = 0, etat = null;
    for (let i = 1; i < n; i++) {
      const a = P[i - 1], b = P[i];
      if (!a || !b) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], lg = Math.hypot(dx, dy);
      if (lg < 0.01) continue;
      etat = pres[i];
      if (!etat.camp) { reste = 0; continue; }
      const pas = 11, ux = dx / lg, uy = dy / lg, nx = uy * sens, ny = -ux * sens, dir = etat.camp === 'cult' ? 1 : -1, h = (4.2 + etat.force * 1.8) * dir, w = 3.4 + etat.force * 0.6;
      ctx.fillStyle = etat.camp === 'cult' ? clair : COL.cc;
      let s = pas - reste;
      while (s <= lg) {
        const x = a[0] + ux * s, y = a[1] + uy * s;
        ctx.beginPath(); ctx.moveTo(x - ux * w, y - uy * w); ctx.lineTo(x + nx * h, y + ny * h); ctx.lineTo(x + ux * w, y + uy * w); ctx.closePath(); ctx.fill();
        s += pas;
      }
      reste = (reste + lg) % pas;
    }
  }

  function zones(ctx, sc, t) {
    const viv = I.reduit() ? { t: 0, amp: 0 } : { t: t * (0.5 + sc.tension / 100 * 1.4), amp: 0.007 + 0.007 * sc.tension / 100 };
    const liste = zonesDe(sc).map(o => {
      const z = o.z, pleine = !!z.pleine, hz = I.haloDe(z);
      return { ...o, z, coeur: I.tache(pleine ? { ...hz, halo: false } : z, viv), halo: pleine ? null : I.tache(hz, viv) };
    });
    const px = I.px, z0 = I.zl();
    const groupes = d3.group(liste, o => o.z.couleur + '|' + (o.a < 1 ? o.z.id : ''));
    for (const [, gr] of groupes) {
      const coul = gr[0].z.couleur || COL.cult, clair = mixc(coul, '#ffffff', 0.38), sombre = mixc(coul, '#0a0814', 0.74);
      const fc = new Path2D(), fh = new Path2D();
      for (const o of gr) { fc.addPath(I.formeLibre(o.coeur)); if (o.halo) fh.addPath(I.formeLibre(o.halo)); }
      ctx.globalAlpha = gr[0].a;
      I.vue(ctx);
      // Bordure contestée : terrain disputé autour de la bulle
      ctx.fillStyle = alpha(coul, 0.1); ctx.fill(fh);
      ctx.fillStyle = motif('conteste'); ctx.fill(fh);
      ctx.strokeStyle = alpha(COL.conteste, 0.5); ctx.lineWidth = px(0.9); ctx.setLineDash([px(4), px(3)]); ctx.stroke(fh); ctx.setLineDash([]);
      // Bord : trait clair dont seule la moitié extérieure dépasse du cœur opaque
      ctx.strokeStyle = 'rgba(4,3,12,.55)'; ctx.lineWidth = px(6); ctx.stroke(fc);
      ctx.strokeStyle = clair; ctx.lineWidth = px(2.6); ctx.stroke(fc);
      ctx.fillStyle = sombre; ctx.fill(fc);
      // Intérieur : lueur du bord, matière du dieu, brume du brouillard de guerre
      ctx.save(); ctx.clip(fc);
      ctx.strokeStyle = alpha(coul, 0.2); ctx.lineWidth = px(22); ctx.stroke(fc);
      ctx.strokeStyle = alpha(coul, 0.25); ctx.lineWidth = px(9); ctx.stroke(fc);
      for (const o of gr) texture(ctx, o.z, clair, t);
      I.vue(ctx);
      const pas = Math.floor(t * 7);
      ctx.fillStyle = motif('brume', (pas * 37) % 64, (pas * 53) % 64); ctx.globalAlpha = gr[0].a * (0.55 + 0.45 * sc.distorsion); ctx.fill(fc);
      ctx.restore();
      ctx.globalAlpha = gr[0].a;
      // Sceau du chaos et nom du dieu sur les grandes bulles
      I.ecran(ctx);
      for (const o of gr) {
        const z = o.z;
        if (z.contour || (+z.rayon || 0) < 2) continue;
        const p = I.P(z.centre), R = rayonV(z.centre, z.rayon * 0.5) * (I.cam.mode === 'plan' ? I.cam.t.k : 1);
        if (!p || R < 9) continue;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(t * 0.03); ctx.scale(R, R);
        ctx.fillStyle = alpha(clair, 0.2); ctx.fill(G.F.chaos); ctx.restore();
        if (R > 26 && z.dieu) {
          ctx.font = `600 ${Math.max(9, Math.min(15, R * 0.2))}px ${I.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = alpha(clair, 0.62); ctx.fillText(espacer(z.dieu.toUpperCase()), p[0], p[1] + R * 1.25);
        }
      }
      // Front : dents du côté de celui qui avance
      if (I.couches.militaire && z0 >= 1.2 && gr[0].a === 1) for (const o of gr) dents(ctx, sc, o.z, o.coeur.coordinates[0], clair);
      ctx.globalAlpha = 1;
    }
    return liste;
  }
  const espacer = I.espacer = s => s.split('').join(' ');

  // Vent dominant à une latitude (alizés vers l'ouest sous les tropiques, vents d'ouest au-delà), en radians
  const vent = z => { const lat = z.centre[1], r = G.graine(z.id + 'vent')(); return (Math.abs(lat) < 30 ? Math.PI + (lat > 0 ? 0.25 : -0.25) : 0) + (r - 0.5) * 0.6; };
  function panache(z, f, L) {
    const [lon0, lat0] = z.centre, R = (+z.rayon || 1) * f, th = vent(z), cos = Math.max(0.2, Math.cos(lat0 * RAD)), ring = [];
    for (let i = 0; i < 48; i++) {
      const a = -i / 48 * 2 * Math.PI, d = Math.cos(a - th), r = R * (0.9 + L * Math.pow(Math.max(0, d), 3));
      ring.push([lon0 + r * Math.cos(a) / cos, Math.max(-89, Math.min(89, lat0 + r * Math.sin(a)))]);
    }
    ring.push(ring[0]);
    let g = { type: 'Polygon', coordinates: [ring] };
    if (d3.geoArea(g) > 2 * Math.PI) g = { type: 'Polygon', coordinates: [ring.slice().reverse()] };
    return g;
  }
  // Cicatrices nucléaires : panache de retombées sous le vent, anneau d'exclusion, cratère vitrifié, halo qui pâlit
  function cicatrices(ctx, sc) {
    const px = I.px, liste = sc.detruites.slice().sort((a, b) => (+b.rayon || 0) - (+a.rayon || 0)), z0 = I.zl();
    const avecFeu = new Set(liste.filter(z => z.type === 'feu').map(z => z.centre.join()));
    for (const z of liste) {
      const sem = sc.semainesDepuis(z.date || sc.date), chaud = Math.max(0.12, 1 - sem / 11), c = Pv(z.centre), R = rayonV(z.centre, +z.rayon || 1);
      if (!c || !R) continue;
      I.vue(ctx);
      const forme = I.forme('det:' + z.id, () => I.tache(z));
      if (z.type === 'feu') {
        const g = ctx.createRadialGradient(c[0], c[1], R * 0.35, c[0], c[1], R * 1.15);
        g.addColorStop(0, 'rgba(60,10,14,.0)'); g.addColorStop(0.45, 'rgba(70,14,16,.82)'); g.addColorStop(0.8, alpha(mixc('#3a1512', '#f07a2e', chaud), 0.7)); g.addColorStop(1, alpha('#f5a13d', 0.12 * chaud));
        ctx.fillStyle = g; ctx.fill(forme);
        ctx.strokeStyle = alpha('#f5c13d', 0.5); ctx.lineWidth = px(1); ctx.setLineDash([px(2), px(4)]);
        ctx.stroke(I.forme('det-x:' + z.id, () => I.tache({ ...z, id: z.id + '-x', rayon: (+z.rayon || 1) * 1.12 }))); ctx.setLineDash([]);
        continue;
      }
      // Retombées : deux lobes sous le vent
      ctx.fillStyle = alpha('#d9a441', 0.07 + 0.05 * chaud); ctx.fill(I.forme('pan1:' + z.id, () => panache(z, 1.25, 2.6)));
      ctx.fillStyle = alpha('#e0863a', 0.08 + 0.07 * chaud); ctx.fill(I.forme('pan2:' + z.id, () => panache(z, 1.1, 1.3)));
      if (!avecFeu.has(z.centre.join())) {
        ctx.strokeStyle = alpha('#f5c13d', 0.55); ctx.lineWidth = px(1); ctx.setLineDash([px(2), px(4)]);
        ctx.stroke(I.forme('det-x:' + z.id, () => I.tache({ ...z, id: z.id + '-x', rayon: (+z.rayon || 1) * 1.3 }))); ctx.setLineDash([]);
      }
      // Halo de chaleur, qui s'éteint au fil des semaines
      let g = ctx.createRadialGradient(c[0], c[1], R * 0.7, c[0], c[1], R * 1.5);
      g.addColorStop(0, alpha('#ff7a3a', 0.5 * chaud)); g.addColorStop(1, 'rgba(255,122,58,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], R * 1.5, 0, 7); ctx.fill();
      // Cratère : verre noir, cœur encore rouge les premières semaines, reflet froid sur le bord
      g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R * 1.05);
      g.addColorStop(0, mixc('#1c1a22', '#ffb054', chaud * 0.9)); g.addColorStop(0.16, mixc('#17151d', '#b3361c', chaud * 0.8)); g.addColorStop(0.5, '#110f17'); g.addColorStop(0.85, '#0a0910'); g.addColorStop(1, '#1b1d2b');
      ctx.fillStyle = g; ctx.fill(forme);
      ctx.strokeStyle = 'rgba(165,215,235,.32)'; ctx.lineWidth = px(1.1); ctx.stroke(forme);
      // Fissures du sol vitrifié
      const r = G.graine(z.id + 'fissures');
      ctx.strokeStyle = 'rgba(150,200,225,.2)'; ctx.lineWidth = px(0.7); ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        let a = r() * 6.283, d = R * 0.12; ctx.moveTo(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d);
        for (let j = 0; j < 4; j++) { a += (r() - 0.5) * 0.7; d += R * (0.12 + r() * 0.12); ctx.lineTo(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d); }
      }
      ctx.stroke();
      if (z0 >= 1.6) { ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(R * 0.36, R * 0.36); ctx.fillStyle = alpha('#f5c13d', 0.75); ctx.fill(G.F.trefle); ctx.restore(); }
    }
  }

  // Bombardements : anneau hachuré entre deux formes (autour d'un centre ou le long d'une zone tracée)
  function formesFrappe(sc, z) {
    const zr = z.zone && sc.zones.find(x => x.id === z.zone);
    if (zr && zr.contour) return [I.tache({ id: z.id, contour: zr.contour, marge: +z.marge || 0 }), z.margeInt != null ? I.tache({ id: z.id, contour: zr.contour, marge: +z.margeInt }) : null];
    return [I.tache({ id: z.graine || z.id, centre: z.centre, rayon: z.rayon || 2 }), z.rayonInt ? I.tache({ id: z.graineInt || z.graine || z.id, centre: z.centre, rayon: z.rayonInt }) : null];
  }
  I.formesFrappe = formesFrappe;
  function frappes(ctx, sc) {
    I.vue(ctx);
    for (const z of sc.frappes) {
      const [ext, int] = formesFrappe(sc, z), f = new Path2D();
      f.addPath(I.forme('fr:' + sc.id + z.id, ext)); if (int) f.addPath(I.forme('fri:' + sc.id + z.id, int));
      ctx.globalAlpha = 0.4; ctx.fillStyle = motif(z.type === 'napalm' ? 'napalm' : 'missiles'); ctx.fill(f, 'evenodd'); ctx.globalAlpha = 1;
      ctx.strokeStyle = alpha(z.type === 'napalm' ? COL.napalm : COL.missiles, 0.5); ctx.lineWidth = I.px(0.8); ctx.stroke(f);
    }
  }
  // Cordons de quarantaine : double fil sur poteaux autour de la zone contestée, effacé là où passe une percée
  function cordons(ctx, sc, liste) {
    const cs = liste.filter(o => o.z.cordon && !o.z.contour && o.a === 1);
    if (!cs.length) return;
    I.vue(ctx);
    const px = I.px, trou = new Path2D();
    trou.rect(-1e5, -1e5, 2e5, 2e5);
    for (const o of liste) if (o.z.contour) trou.addPath(I.formeLibre(I.tache({ ...o.z, marge: 0.35 })));
    ctx.save(); ctx.clip(trou, 'evenodd');
    for (const o of cs) {
      const f = I.forme('cordon:' + sc.id + o.z.id + o.z.rayon, () => I.ringCordon(o.z));
      ctx.strokeStyle = 'rgba(8,7,16,.8)'; ctx.lineWidth = px(5.5); ctx.stroke(f);
      ctx.strokeStyle = COL.quarantaine; ctx.lineWidth = px(3.4); ctx.stroke(f);
      ctx.strokeStyle = '#12101c'; ctx.lineWidth = px(1.7); ctx.stroke(f);
      ctx.strokeStyle = COL.quarantaine; ctx.lineWidth = px(5.5); ctx.setLineDash([px(1.3), px(8)]); ctx.stroke(f); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function vie() {
    const ctx = I.cx.vie, t = I.temps(), { W, H } = I.dim();
    I.zonesVisibles = false;
    avecRideau(ctx, sc => {
      ctx.globalCompositeOperation = 'source-over';
      const liste = I.couches.anormal ? zones(ctx, sc, t) : zonesDe(sc);
      // Une zone à l'écran : la matière continue de respirer
      for (const o of liste) { const p = I.P(centreZone(o.z)); if (p && p[0] > -200 && p[0] < W + 200 && p[1] > -200 && p[1] < H + 200) I.zonesVisibles = true; }
      // Terres reprises par la Confédération : la matière de la zone y laisse place à un sol hachuré de bleu
      I.vue(ctx);
      if (sc.reprises.length) {
        ctx.globalCompositeOperation = 'source-atop';
        for (const x of sc.reprises) {
          const f = I.forme('rep:' + x.id, () => I.tache(x));
          ctx.fillStyle = '#232b58'; ctx.fill(f);
          ctx.fillStyle = motif('reprise'); ctx.fill(f);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (I.couches.anormal) cicatrices(ctx, sc);
      if (I.couches.militaire) { frappes(ctx, sc); cordons(ctx, sc, liste); }
      // Tout ce qui précède ne tient que sur les terres
      I.vue(ctx);
      ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = '#000'; ctx.fill(I.terres());
      ctx.globalCompositeOperation = 'source-over';
      if (I.couches.militaire) {
        // Zones de contestation : terrain disputé, cerné d'un anneau qui bat
        for (const k of sc.contestations) {
          const c = Pv(k.centre), R = rayonV(k.centre, +k.rayon || 1);
          if (!c) continue;
          const u = I.reduit() ? 0.5 : (t * 0.5) % 1;
          ctx.fillStyle = 'rgba(240,165,58,.16)'; ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, 7); ctx.fill();
          ctx.strokeStyle = COL.etat.grave; ctx.lineWidth = I.px(1.3); ctx.setLineDash([I.px(3), I.px(3)]); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = alpha('#f0a53a', 0.7 * (1 - u)); ctx.lineWidth = I.px(1.2); ctx.beginPath(); ctx.arc(c[0], c[1], R * (1 + u * 0.9), 0, 7); ctx.stroke();
          I.zonesVisibles = true;
        }
      }
    });
  }

  I.mono = '"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace';
  I.sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  I.dessin = { base, vie, sym: () => {}, fx: () => {} };
  Object.assign(I, { centreZone, rayonZone, mixc, alpha });
})();
