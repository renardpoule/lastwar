// Moteur de la carte : géométrie, scènes (direct ou archive), projection globe ↔ planisphère, caméra, pointeur.
// Tout est peint sur quatre canvas empilés (base, vie, sym, fx) ; le dessin lui-même est dans calques.js.
const CARTE = (() => {
  const RAD = Math.PI / 180;
  const I = {
    RAD, sale: { base: true, vie: true, sym: true }, cibles: [], ciblesFx: [], traitsCibles: [],
    couches: { militaire: true, anormal: true, infrastructure: true, civil: true },
    nav: { niveau: 'monde', secteur: null, district: null, ville: null },
    marges: { g: 16, h: 16, d: 16, b: 16 }, rideau: null, hooks: {}, mix: null, survol: null, t0: performance.now()
  };
  const M = { _: I };
  const temps = I.temps = () => (performance.now() - I.t0) / 1000;
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)');
  I.reduit = () => reduit.matches;

  // ---------- Dates du RP ("11 sept. 2075") ----------
  const MOIS = { janv: 1, févr: 2, fevr: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, août: 8, aout: 8, sept: 9, oct: 10, nov: 11, déc: 12, dec: 12 };
  const dateParts = t => { const m = /(\d+)\s+([a-zéû]+)\.?\s+(\d{4})/i.exec(t || ''); return m ? [+m[3], MOIS[m[2].toLowerCase()] || 1, +m[1]] : null; };
  const dateVal = I.dateVal = t => { const p = dateParts(t); return p ? p[0] * 1e4 + p[1] * 100 + p[2] : Infinity; };
  const dateJs = I.dateJs = t => { const p = dateParts(t); return p ? new Date(Date.UTC(p[0], p[1] - 1, p[2])) : new Date(); };

  // ---------- Formes organiques (taches, contours) ----------
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const sensDirect = ring => { let poly = { type: 'Polygon', coordinates: [ring] }; if (d3.geoArea(poly) > 2 * Math.PI) poly = { type: 'Polygon', coordinates: [ring.slice().reverse()] }; return poly; };
  // Tache autour d'un centre : la forme ne dépend que de l'identifiant (les données s'appuient dessus)
  function tache(z, viv) {
    if (Array.isArray(z.contour)) return contourZone(z, viv);
    const h = hash(z.id), a = (h % 628) / 100, b = ((h >> 8) % 628) / 100, c2 = ((h >> 16) % 628) / 100;
    const [lon0, lat0] = z.centre, R = +z.rayon || 1, cos = Math.max(0.2, Math.cos(lat0 * RAD));
    const n = viv ? 120 : 64, ring = [];
    for (let i = 0; i < n; i++) {
      const t = -i / n * 2 * Math.PI;
      let r = 1 + 0.2 * Math.sin(3 * t + a) + 0.12 * Math.sin(5 * t + b) + 0.06 * Math.sin(9 * t + c2);
      // Bord vivant : morsures fines et respiration lente, sans toucher à la forme d'ensemble
      if (viv) r += 0.022 * Math.sin(19 * t + a * 3) * Math.sin(7 * t + b) + 0.016 * Math.sin(31 * t + c2 * 2) + viv.amp * Math.sin(viv.t + 4 * t + a) + viv.amp * 0.6 * Math.sin(viv.t * 1.7 - 7 * t + b);
      ring.push([lon0 + R * r * Math.cos(t) / cos, Math.max(-89, Math.min(89, lat0 + R * r * Math.sin(t)))]);
    }
    ring.push(ring[0]);
    return sensDirect(ring);
  }
  // Zone tracée à la main (percée), élargie de z.marge degrés ; version vivante : bord rééchantillonné et rongé
  function contourZone(z, viv) {
    const pts = z.contour, m = +z.marge || 0, ech = z._ech == null ? 1 : z._ech;
    const cx = d3.mean(pts, p => p[0]), cy = d3.mean(pts, p => p[1]), cos = Math.max(0.2, Math.cos(cy * RAD));
    let ring = pts.map(([x, y]) => {
      const dx = (x - cx) * cos, dy = y - cy, n = Math.hypot(dx, dy) || 1;
      return [cx + ((x - cx) * ech) + m * dx / n / cos, cy + (y - cy) * ech + m * dy / n];
    });
    if (viv) {
      const h = hash(z.id), a = (h % 628) / 100, b = ((h >> 8) % 628) / 100, out = [];
      let s = 0;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length], dx = (q[0] - p[0]) * cos, dy = q[1] - p[1], lg = Math.hypot(dx, dy) || 1e-6;
        const nx = dy / lg, ny = -dx / lg, pas = Math.max(1, Math.round(lg / 0.3));
        for (let j = 0; j < pas; j++) {
          const u = j / pas, d = 0.09 * Math.sin(s * 5.1 + a) * Math.sin(s * 2.3 + b) + 0.05 * Math.sin(s * 11 + b * 2) + viv.amp * 2.2 * Math.sin(viv.t + s * 1.3 + a);
          out.push([p[0] + (q[0] - p[0]) * u + nx * d / cos, p[1] + (q[1] - p[1]) * u + ny * d]);
          s += lg / pas;
        }
      }
      ring = out;
    }
    ring.push(ring[0]);
    return sensDirect(ring);
  }
  const haloDe = z => Array.isArray(z.contour)
    ? { ...z, id: z.id + '-c', marge: 0.6, halo: true }
    : { ...z, id: z.id + '-c', rayon: (+z.rayon || 1) + Math.max(0.4, Math.min(2, (+z.rayon || 1) * 0.35)), halo: true };
  function ringCordon(z) {
    const R = +z.rayon || 1, h = R + Math.max(0.4, Math.min(2, R * 0.35));
    return tache({ ...z, id: z.id + '-c', rayon: h * 1.06 + Math.max(0.5, R * 0.06) });
  }
  Object.assign(I, { tache, haloDe, ringCordon, hash });

  // ---------- Scènes : l'état de la carte à une date (direct = null, sinon index de l'historique) ----------
  const scenes = new Map();
  function scene(i) {
    if (i != null && (i < 0 || i >= I.data.historique.length)) i = null;
    const cle = i == null ? 'direct' : i;
    if (scenes.has(cle)) return scenes.get(cle);
    const data = I.data, h = i == null ? null : data.historique[i], H = data.historique;
    const date = h ? h.date : data.meta.dateRP, dv = dateVal(date);
    const jusqu = x => dateVal(x.date) <= dv && (!x.jusqu || dv <= dateVal(x.jusqu));
    const s = { i: i == null ? null : i, id: 'sc' + cle, date, dv, direct: i == null };
    s.statut = d => h ? (h.districts[d.id] || { statut: 'controle', influence: 0 }) : { statut: d.statut, influence: d.influence, quarantaine: !!d.quarantaine };
    s.zones = (h && h.zones) || data.zones || [];
    s.tension = h ? h.tension : data.tension.valeur;
    s.distorsion = Math.max(0, Math.min(100, +(h && h.distorsion != null ? h.distorsion : data.meta.distorsion) || 0)) / 100;
    s.villes = (data.villes || []).map(v => h && h.villes && h.villes[v.id] != null ? { ...v, etat: h.villes[v.id] } : v);
    s.frappes = (data.bombardements || []).filter(jusqu);
    s.contestations = (data.contestations || []).filter(jusqu);
    s.lignes = (data.lignes || []).filter(jusqu);
    s.reprises = (data.reprises || []).filter(x => dateVal(x.date) <= dv);
    s.detruites = (data.detruites || []).filter(z => !z.date || dateVal(z.date) <= dv);
    s.axes = (data.axes || []).filter(a => a.date === date);
    s.nEvts = h ? h.evenements : data.evenements.length;
    s.evts = data.evenements.slice(0, s.nEvts);
    // Événements du tour : ceux survenus depuis l'instantané précédent
    if (h) s.evtsTour = data.evenements.slice(i > 0 ? H[i - 1].evenements : 0, h.evenements);
    else { const der = H[H.length - 1]; s.evtsTour = data.evenements.slice(!der ? 0 : der.date === date ? (H.length > 1 ? H[H.length - 2].evenements : 0) : der.evenements); }
    s.forces = d => h ? ((h.forces || {})[d.id] || { confederation: [], cultistes: [] }) : (d.forces || { confederation: [], cultistes: [] });
    s.archiveForces = !h || !!h.forces;
    s.forcesEstimees = !!(h && h.forcesEstimees);
    s.pertes = h ? (h.pertes || null) : C.pertesMonde(data);
    s.energie = h ? h.energie : data.meta.energie;
    s.stabilite = h ? h.stabilite : data.meta.stabilite;
    s.tuesParCorps = h ? h.tuesParCorps : data.meta.tuesParCorps;
    s.enQuarantaine = d => { const st = s.statut(d); return st.statut === 'quarantaine' || !!st.quarantaine; };
    // Semaines écoulées depuis une date (cicatrices qui pâlissent)
    s.semainesDepuis = t => Math.max(0, (dateJs(date) - dateJs(t)) / 6048e5);
    // Géométrie des zones figée (sans respiration), pour les tests "dans le brouillard"
    let polys = null;
    s.dansZone = c => { polys = polys || s.zones.map(z => ({ z, g: tache(z) })); for (const o of polys) if (d3.geoContains(o.g, c)) return o.z; return null; };
    let rep = null;
    s.reprise = c => { rep = rep || s.reprises.map(x => ({ x, g: tache(x) })); return rep.some(o => d3.geoContains(o.g, c)); };
    // Dans le brouillard : sous une bulle, hors des terres reprises
    s.brouillard = c => { const z = s.dansZone(c); return z && !s.reprise(c) ? z : null; };
    scenes.set(cle, s);
    return s;
  }
  M.scene = scene; M.dateVal = dateVal;

  // ---------- Projections ----------
  const CADRE_MONDE = { type: 'MultiPoint', coordinates: [[-180, 0], [180, 0], [0, 84], [0, -57], [-170, 70], [170, 70], [-170, -57], [170, -57]] };
  const pPlan = d3.geoNaturalEarth1().precision(0.3);
  const pGlobe = d3.geoOrthographic().clipAngle(90).precision(0.4);
  const pMorph = (() => {
    const r0 = d3.geoOrthographicRaw, r1 = d3.geoNaturalEarth1Raw;
    const mut = d3.geoProjectionMutator(a => (x, y) => { const p = r0(x, y), q = r1(x, y); return [p[0] + a * (q[0] - p[0]), p[1] + a * (q[1] - p[1])]; });
    const p = mut(0).precision(0.5);
    p.alpha = a => mut(a);
    return p;
  })();
  const cam = I.cam = { mode: 'plan', rot: [30, -12, 0], kg: 1, t: { k: 1, x: 0, y: 0 }, a: 1, ver: 0, bouge: false, anim: null, prefGlobe: false, clip: Math.PI, centreGeo: [0, 0], R: 100, c: [0, 0] };
  let W = 0, H = 0, dpr = 1, bornes = [[0, 0], [1, 1]];
  const sauf = () => { const m = I.marges; return { x: m.g, y: m.h, w: Math.max(80, W - m.g - m.d), h: Math.max(80, H - m.h - m.b), cx: m.g + Math.max(80, W - m.g - m.d) / 2, cy: m.h + Math.max(80, H - m.h - m.b) / 2 }; };
  I.sauf = sauf;

  function majProj() {
    if (cam.mode === 'plan') { I.proj = pPlan; cam.clip = Math.PI; return; }
    cam.ver++;
    if (cam.mode === 'globe') {
      pGlobe.scale(cam.R * cam.kg).translate(cam.c).rotate(cam.rot);
      I.proj = pGlobe; cam.clip = Math.PI / 2 - 0.01; cam.centreGeo = [-cam.rot[0], -cam.rot[1]]; cam.a = 0;
    } else {
      const m = cam.morph, a = cam.a, th = (90 + 89.5 * Math.pow(a, 1.5)) * RAD;
      const rot = [m.rot[0] * (1 - a), m.rot[1] * (1 - a), 0];
      pMorph.alpha(a).rotate(rot).scale(Math.exp(Math.log(m.s0) * (1 - a) + Math.log(m.s1) * a))
        .translate([m.c0[0] + (m.c1[0] - m.c0[0]) * a, m.c0[1] + (m.c1[1] - m.c0[1]) * a])
        .preclip(s => d3.geoClipAntimeridian(d3.geoClipCircle(th)(s)));
      I.proj = pMorph; cam.clip = th - 0.01; cam.centreGeo = [-rot[0], -rot[1]];
    }
  }
  I.P = c => {
    if (cam.mode === 'plan') { const p = pPlan(c); return p && [p[0] * cam.t.k + cam.t.x, p[1] * cam.t.k + cam.t.y]; }
    if (d3.geoDistance(c, cam.centreGeo) > cam.clip) return null;
    return I.proj(c);
  };
  I.inv = p => {
    if (cam.mode === 'plan') return pPlan.invert([(p[0] - cam.t.x) / cam.t.k, (p[1] - cam.t.y) / cam.t.k]);
    if (cam.mode === 'globe') { if (Math.hypot(p[0] - cam.c[0], p[1] - cam.c[1]) >= cam.R * cam.kg) return null; return pGlobe.invert(p); }
    return null;
  };
  // Niveau de zoom ramené à l'échelle du planisphère (1 = monde entier)
  I.zl = () => cam.mode === 'plan' ? cam.t.k : cam.mode === 'globe' ? cam.R * cam.kg / pPlan.scale() : Math.exp(Math.log(cam.morph.s0) * (1 - cam.a) + Math.log(cam.morph.s1) * cam.a) / pPlan.scale();
  // Altitude : 0 stratégique, 1 opératif, 2 tactique
  I.palier = () => { const z = I.zl(); return z >= 6 ? 2 : (z >= 2.4 || I.nav.secteur) ? 1 : 0; };
  I.px = v => cam.mode === 'plan' ? v / cam.t.k : v;
  I.vue = ctx => { if (cam.mode === 'plan') ctx.setTransform(dpr * cam.t.k, 0, 0, dpr * cam.t.k, dpr * cam.t.x, dpr * cam.t.y); else ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  I.ecran = ctx => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  I.dim = () => ({ W, H, dpr });
  // Géométrie fine sur le planisphère, simplifiée sur le globe (reprojeté à chaque image)
  I.g = (o, cle) => o && (cam.mode === 'plan' ? o[cle] : (I.mobile && o[cle + 'M']) || o[cle + 'S']);

  // Cache des tracés : en planisphère la projection est fixe (le zoom passe par la transformation du canvas)
  const formes = new Map(); let verFormes = -1;
  const chemin = d3.geoPath();
  I.forme = (cle, geo) => {
    if (verFormes !== cam.ver) { formes.clear(); verFormes = cam.ver; }
    let p = formes.get(cle);
    if (!p) { p = new Path2D(); const g = typeof geo === 'function' ? geo() : geo; if (g) chemin.projection(I.proj).context(p)(g); formes.set(cle, p); }
    return p;
  };
  // Tracé composé (assemblé à partir d'autres tracés), gardé dans le même cache
  I.formeCalc = (cle, f) => { if (verFormes !== cam.ver) { formes.clear(); verFormes = cam.ver; } let p = formes.get(cle); if (!p) { p = f(); formes.set(cle, p); } return p; };
  I.formeLibre = geo => { const p = new Path2D(); chemin.projection(I.proj).context(p)(geo); return p; };
  I.oublier = prefixe => { for (const k of formes.keys()) if (k.startsWith(prefixe)) formes.delete(k); };

  // ---------- Dimensions ----------
  function ajuster(vueGardee) {
    const r = I.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const avant = vueGardee && vueGardee.c ? vueGardee : releverVue();
    W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const n of ['base', 'vie', 'sym', 'fx']) { const c = I.cv[n]; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const s = sauf();
    pPlan.fitExtent([[s.x, s.y], [s.x + s.w, s.y + s.h]], CADRE_MONDE);
    bornes = d3.geoPath(pPlan).bounds(CADRE_MONDE);
    cam.R = Math.max(60, Math.min(s.w, s.h) / 2 * 0.92); cam.c = [s.cx, s.cy];
    I.ech = W < 600 ? 0.78 : 1;
    cam.ver++; formes.clear();
    // La vue est replacée d'après son centre géographique : le planisphère vient d'être recalé sur la nouvelle zone utile
    if (avant && cam.mode === 'plan') {
      if (avant.monde) cam.t = contraindre({ k: 1, x: 0, y: 0 });
      else { const k = Math.max(1, avant.ech / pPlan.scale()), p = pPlan(avant.c); cam.t = contraindre({ k, x: s.cx - p[0] * k, y: s.cy - p[1] * k }); }
    }
    majProj(); invalider();
  }
  // Vue relevée indépendamment de la projection : centre géographique et échelle absolue
  const releverVue = () => { if (cam.mode !== 'plan' || !W) return null; const s = sauf(); return { c: pPlan.invert([(s.cx - cam.t.x) / cam.t.k, (s.cy - cam.t.y) / cam.t.k]), ech: pPlan.scale() * cam.t.k, monde: cam.t.k <= 1.001 }; };
  // Vue du planisphère : [x, y] au centre de la zone utile (coordonnées du plan) et largeur visible
  const vuePlan = (t = cam.t) => { const s = sauf(); return [(s.cx - t.x) / t.k, (s.cy - t.y) / t.k, s.w / t.k]; };
  const transformVue = v => { const s = sauf(), k = s.w / v[2]; return { k, x: s.cx - v[0] * k, y: s.cy - v[1] * k }; };
  function contraindre(t) {
    const s = sauf(), k = Math.max(1, Math.min(48, t.k));
    const x = Math.max(s.cx - k * bornes[1][0], Math.min(s.cx - k * bornes[0][0], t.x + (k - t.k) * 0));
    const y = Math.max(s.cy - k * bornes[1][1], Math.min(s.cy - k * bornes[0][1], t.y));
    return { k, x, y };
  }
  function transformPour(b, kMax = 48) {
    const s = sauf(), [[x0, y0], [x1, y1]] = b;
    const k = Math.max(1, Math.min(kMax, 0.86 / Math.max((x1 - x0) / s.w, (y1 - y0) / s.h)));
    return contraindre({ k, x: s.cx - k * (x0 + x1) / 2, y: s.cy - k * (y0 + y1) / 2 });
  }
  const invalider = I.invalider = (quoi) => { if (!quoi || quoi === 'tout') I.sale.base = I.sale.vie = I.sale.sym = true; else I.sale[quoi] = true; };

  // ---------- Mouvements de caméra ----------
  const ease = d3.easeCubicInOut;
  function arreter() { cam.anim = null; }
  function volerPlan(t1, ms, fin) {
    t1 = contraindre(t1);
    if (I.reduit() || ms === 0) { cam.t = t1; cam.anim = null; invalider(); fin && fin(); return; }
    const iz = d3.interpolateZoom(vuePlan(cam.t), vuePlan(t1));
    cam.anim = { ms: ms || Math.max(500, Math.min(1500, iz.duration * 0.75)), t0: performance.now(), pas: e => { cam.t = transformVue(iz(e)); }, fin: () => { cam.t = t1; fin && fin(); } };
  }
  function tournerGlobe(rot1, kg1, ms, fin) {
    const r0 = cam.rot.slice(), k0 = cam.kg;
    let dl = ((rot1[0] - r0[0] + 540) % 360) - 180;
    if (I.reduit() || ms === 0) { cam.rot = [r0[0] + dl, rot1[1], 0]; cam.kg = kg1; majProj(); invalider(); fin && fin(); return; }
    cam.anim = { ms: ms || 900, t0: performance.now(), pas: e => { cam.rot = [r0[0] + dl * e, r0[1] + (rot1[1] - r0[1]) * e, 0]; cam.kg = k0 + (kg1 - k0) * e; majProj(); }, fin };
  }
  // Dépliage du globe vers le planisphère (et l'inverse) : mélange des deux projections
  function morph(versPlan, t1, rotGlobe, kg, ms, fin) {
    const tp = pPlan.translate();
    cam.morph = { rot: [(((rotGlobe[0] + 540) % 360) - 180), rotGlobe[1]], s0: cam.R * kg, s1: pPlan.scale() * t1.k, c0: cam.c.slice(), c1: [tp[0] * t1.k + t1.x, tp[1] * t1.k + t1.y] };
    const finir = () => {
      if (versPlan) { cam.mode = 'plan'; cam.t = t1; cam.a = 1; } else { cam.mode = 'globe'; cam.rot = [cam.morph.rot[0], cam.morph.rot[1], 0]; cam.kg = kg; }
      cam.ver++; majProj(); invalider(); I.hooks.surVue && I.hooks.surVue(); fin && fin();
    };
    if (I.reduit() || ms === 0) { finir(); return; }
    cam.mode = 'morph'; cam.a = versPlan ? 0 : 1;
    cam.anim = { ms: ms || 1100, t0: performance.now(), pas: e => { cam.a = versPlan ? e : 1 - e; majProj(); }, fin: finir };
    majProj();
  }
  function animer(ts) {
    const an = cam.anim;
    if (!an) return false;
    const u = Math.min(1, (ts - an.t0) / an.ms);
    an.pas(ease(u));
    if (u >= 1) { cam.anim = null; an.fin && an.fin(); }
    invalider();
    return true;
  }

  // Cadre (en coordonnées du planisphère) d'un objet : cadre explicite [[O,S],[E,N]] ou emprise de sa géométrie
  const cheminPlan = d3.geoPath(pPlan);
  function cadre(o) {
    if (o.cadre) {
      const [[w, s], [e, n]] = o.cadre, pts = [];
      for (let i = 0; i <= 10; i++) { const lon = w + (e - w) * i / 10, lat = s + (n - s) * i / 10; pts.push(pPlan([lon, s]), pPlan([lon, n]), pPlan([w, lat]), pPlan([e, lat])); }
      return [[d3.min(pts, p => p[0]), d3.min(pts, p => p[1])], [d3.max(pts, p => p[0]), d3.max(pts, p => p[1])]];
    }
    return o._geo ? cheminPlan.bounds(o._geo) : null;
  }
  function cadreNav() {
    const n = I.nav, s0 = sauf();
    if (n.niveau === 'monde') return null;
    const v = n.ville && (I.data.villes || []).find(x => x.id === n.ville);
    if (v) { const [x, y] = pPlan(v.coord), r = s0.w * 0.045; return [[x - r, y - r * 0.6], [x + r, y + r * 0.6]]; }
    const s = I.secteurParId[n.secteur];
    if (n.niveau === 'district') {
      const d = I.parId[n.district], b = d && cadre(d);
      if (b && (b[1][0] - b[0][0]) < s0.w * 0.6) return b;
    }
    return s && (s._geo || s.cadre) ? cadre(s) : null;
  }
  // Recadre la carte sur la navigation courante (monde, secteur, district, ville)
  function cadrer(anime = true) {
    const b = cadreNav(), ms = anime ? undefined : 0;
    arreter();
    if (!b) {
      if (cam.prefGlobe) { if (cam.mode === 'plan') versGlobe(ms); }
      else if (cam.mode !== 'plan') morph(true, contraindre({ k: 1, x: 0, y: 0 }), cam.rot, cam.kg, ms);
      else volerPlan({ k: 1, x: 0, y: 0 }, ms);
      return;
    }
    const t1 = transformPour(b);
    if (cam.mode === 'plan') volerPlan(t1, ms); else morph(true, t1, cam.rot, cam.kg, ms);
  }
  function versGlobe(ms, fin) {
    const s = sauf(), c = pPlan.invert([(s.cx - cam.t.x) / cam.t.k, (s.cy - cam.t.y) / cam.t.k]) || [0, 0];
    const rot = [-c[0], Math.max(-60, Math.min(60, -c[1]))];
    morph(false, { ...cam.t }, rot, 1, ms, fin);
  }
  // Vol vers un point (film, briefing, recherche) : zoom donné sur le planisphère, simple rotation sur le globe
  M.volerVers = (c, k, ms, fin) => {
    arreter();
    if (cam.mode === 'globe') { tournerGlobe([-c[0], Math.max(-60, Math.min(60, -c[1])), 0], Math.max(1, Math.min(2.6, (k || 3) / 2.2)), ms, fin); return; }
    if (cam.mode !== 'plan') return;
    const s = sauf(), p = pPlan(c), kk = Math.max(1, Math.min(48, k || cam.t.k));
    volerPlan({ k: kk, x: s.cx - p[0] * kk, y: s.cy - p[1] * kk }, ms, fin);
  };
  M.cadrer = cadrer;
  M.zoomer = f => {
    arreter();
    if (cam.mode === 'globe') { const kg = cam.kg * f; if (kg > 3.1) return globeVersPlan(cam.c); tournerGlobe(cam.rot, Math.max(0.85, kg), 300); return; }
    if (cam.mode !== 'plan') return;
    const s = sauf(), k = Math.max(1, Math.min(48, cam.t.k * f));
    if (k <= 1.001 && f < 1 && cam.prefGlobe && !cadreNav()) return versGlobe();
    volerPlan({ k, x: s.cx - (s.cx - cam.t.x) * k / cam.t.k, y: s.cy - (s.cy - cam.t.y) * k / cam.t.k }, 300);
  };
  // Le globe trop zoomé se déplie autour du point visé
  function globeVersPlan(p) {
    const c = pGlobe.invert(p) || [-cam.rot[0], -cam.rot[1]], k = Math.max(1.6, cam.R * cam.kg / pPlan.scale() * 0.9), q = pPlan(c);
    morph(true, contraindre({ k, x: p[0] - q[0] * k, y: p[1] - q[1] * k }), cam.rot, cam.kg);
  }
  M.globe = (actif, anime = true) => {
    cam.prefGlobe = !!actif;
    if (cadreNav()) return;
    arreter();
    if (actif && cam.mode === 'plan') versGlobe(anime ? undefined : 0);
    else if (!actif && cam.mode !== 'plan') morph(true, contraindre({ k: 1, x: 0, y: 0 }), cam.rot, cam.kg, anime ? undefined : 0);
  };
  M.mode = () => cam.mode;
  // Vrai si la navigation courante cadre une région de la carte (secteur géographique, district, ville)
  M.aCadre = () => !!cadreNav();
  M.enMouvement = () => !!cam.anim;

  // ---------- Pointeur : glisser, molette, pincement, clic, survol ----------
  function brancherPointeur(c) {
    const pts = new Map();
    let depart = null, pince = null, dernierTap = 0;
    const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, pos(e));
      if (pts.size === 1) depart = { p: pos(e), t: performance.now(), bouge: false };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pince = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: cam.mode === 'plan' ? cam.t.k : cam.kg }; }
      arreter(); I.hooks.surGeste && I.hooks.surGeste();
    });
    c.addEventListener('pointermove', e => {
      const p = pos(e);
      if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') demanderSurvol(p); return; }
      const q = pts.get(e.pointerId), dx = p[0] - q[0], dy = p[1] - q[1];
      pts.set(e.pointerId, p);
      if (cam.mode === 'morph') return;
      if (pts.size === 2 && pince) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (cam.mode === 'plan') { const k = Math.max(1, Math.min(48, pince.k * d / pince.d)); cam.t = contraindre({ k, x: m[0] - (m[0] - cam.t.x - dx / 2) * k / cam.t.k, y: m[1] - (m[1] - cam.t.y - dy / 2) * k / cam.t.k }); }
        else { cam.kg = Math.max(0.85, Math.min(3.2, pince.k * d / pince.d)); majProj(); }
        cam.bouge = true; invalider(); if (depart) depart.bouge = true;
        return;
      }
      if (depart && !depart.bouge && Math.hypot(p[0] - depart.p[0], p[1] - depart.p[1]) < 5) return;
      if (depart) depart.bouge = true;
      if (cam.mode === 'plan') cam.t = contraindre({ k: cam.t.k, x: cam.t.x + dx, y: cam.t.y + dy });
      else { const s = 1 / (cam.R * cam.kg) / RAD; cam.rot = [cam.rot[0] + dx * s, Math.max(-75, Math.min(75, cam.rot[1] - dy * s)), 0]; majProj(); }
      cam.bouge = true; invalider();
      I.hooks.surSurvol && I.hooks.surSurvol(null);
    });
    const fin = e => {
      if (!pts.has(e.pointerId)) return;
      const p = pos(e);
      pts.delete(e.pointerId);
      if (pts.size < 2) pince = null;
      if (!pts.size) {
        if (cam.bouge) { cam.bouge = false; invalider(); }
        if (depart && !depart.bouge && e.type === 'pointerup' && performance.now() - depart.t < 600) {
          const now = performance.now();
          if (now - dernierTap < 320) { dernierTap = 0; if (cam.mode === 'globe') globeVersPlan(p); else zoomSur(p, 2.2, true); }
          else { dernierTap = now; I.hooks.surClic && I.hooks.surClic(toucher(p[0], p[1], e.pointerType === 'touch' ? 10 : 4), p, e); }
        }
        depart = null;
      }
    };
    c.addEventListener('pointerup', fin); c.addEventListener('pointercancel', fin);
    c.addEventListener('pointerleave', () => { I.hooks.surSurvol && I.hooks.surSurvol(null); });
    let finMolette = null;
    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (cam.mode === 'morph') return;
      arreter(); I.hooks.surGeste && I.hooks.surGeste();
      const p = pos(e), f = Math.pow(2, -e.deltaY * (e.deltaMode ? 0.05 : 0.0022));
      if (cam.mode === 'globe') {
        const kg = cam.kg * f;
        if (kg > 3.1 && f > 1) { globeVersPlan(p); return; }
        cam.kg = Math.max(0.85, Math.min(3.2, kg)); majProj();
      } else {
        if (cam.t.k <= 1.001 && f < 1 && cam.prefGlobe && !cadreNav()) { versGlobe(); return; }
        zoomSur(p, f, false);
      }
      cam.bouge = true; invalider();
      clearTimeout(finMolette); finMolette = setTimeout(() => { cam.bouge = false; invalider(); I.hooks.surVue && I.hooks.surVue(); }, 160);
    }, { passive: false });
    c.addEventListener('keydown', e => {
      const pas = 60, t = cam.t;
      const dep = { ArrowLeft: [pas, 0], ArrowRight: [-pas, 0], ArrowUp: [0, pas], ArrowDown: [0, -pas] }[e.key];
      if (dep) { e.preventDefault(); if (cam.mode === 'plan') volerPlan({ k: t.k, x: t.x + dep[0], y: t.y + dep[1] }, 200); else if (cam.mode === 'globe') tournerGlobe([cam.rot[0] + dep[0] / 6, Math.max(-75, Math.min(75, cam.rot[1] - dep[1] / 6)), 0], cam.kg, 200); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); M.zoomer(1.6); }
      else if (e.key === '-') { e.preventDefault(); M.zoomer(1 / 1.6); }
    });
  }
  function zoomSur(p, f, anime) {
    const k = Math.max(1, Math.min(48, cam.t.k * f));
    const t1 = contraindre({ k, x: p[0] - (p[0] - cam.t.x) * k / cam.t.k, y: p[1] - (p[1] - cam.t.y) * k / cam.t.k });
    if (anime) volerPlan(t1, 350); else cam.t = t1;
  }
  let survolDemande = null;
  function demanderSurvol(p) {
    const premier = !survolDemande;
    survolDemande = p;
    if (premier) requestAnimationFrame(() => {
      const q = survolDemande; survolDemande = null;
      if (cam.anim || cam.mode === 'morph') return;
      const t = toucher(q[0], q[1], 3);
      const cle = t ? t.type + ':' + (t.obj && (t.obj.id || t.obj.nom) || '') : '';
      if (cle !== (I.survol && I.survol.cle)) { I.survol = t ? { ...t, cle } : null; invalider('sym'); }
      I.hooks.surSurvol && I.hooks.surSurvol(t, q);
    });
  }

  // Ce qui se trouve sous un point de l'écran : symboles d'abord, puis tracés, puis surfaces
  function toucher(x, y, marge = 4) {
    for (const liste of [I.ciblesFx, I.cibles]) for (let i = liste.length - 1; i >= 0; i--) {
      const c = liste[i];
      if (c.w ? (Math.abs(x - c.x) <= c.w / 2 + marge && Math.abs(y - c.y) <= c.h / 2 + marge) : Math.hypot(x - c.x, y - c.y) <= c.r + marge) return { type: c.type, obj: c.obj, x: c.x, y: c.y, extra: c.extra };
    }
    for (let i = I.traitsCibles.length - 1; i >= 0; i--) {
      const tr = I.traitsCibles[i], pts = tr.pts;
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1], b = pts[j], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
        if (Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy) <= (tr.l || 5) + marge) return { type: tr.type, obj: tr.obj };
      }
    }
    const c = I.inv([x, y]);
    if (!c || isNaN(c[0])) return null;
    const sc = I.sceneA;
    if (I.couches.militaire) {
      for (const k of sc.contestations) if (d3.geoDistance(c, k.centre) / RAD < (+k.rayon || 1)) return { type: 'contestation', obj: k, c };
    }
    const surTerre = I.districts.find(d => d._geoS && d3.geoContains(d._geoS, c));
    if (surTerre) {
      for (const z of sc.detruites.slice().sort((a, b) => a.rayon - b.rayon)) if (d3.geoContains(tache(z), c)) return { type: 'detruite', obj: z, c, district: surTerre };
      if (!sc.reprise(c)) {
        const z = sc.dansZone(c);
        if (z) return { type: 'zone', obj: z, c, district: surTerre };
        for (const z2 of sc.zones) if (!z2.pleine && d3.geoContains(tache(haloDe(z2)), c)) return { type: 'zone', obj: { ...z2, halo: true }, c, district: surTerre };
      }
      return { type: 'district', obj: surTerre, c };
    }
    return { type: 'mer', c };
  }
  M.toucher = toucher;

  // ---------- Initialisation ----------
  M.init = ({ el, data, topo, relief, hooks, globe }) => {
    Object.assign(I, { el, data, topo, relief: relief || null, hooks: hooks || {} });
    cam.prefGlobe = !!globe;
    I.districts = C.tousDistricts(data);
    I.parId = Object.fromEntries(I.districts.map(d => [d.id, d]));
    I.secteurParId = Object.fromEntries(data.secteurs.map(s => [s.id, s]));
    // Topologie simplifiée pour le globe et les tests de survol
    let topoS = topo;
    try { const pre = topojson.presimplify(topo); topoS = topojson.simplify(pre, topojson.quantile(pre, 0.2)); } catch (e) { console.warn('Simplification indisponible', e); }
    const geoms = topo.objects.countries.geometries, geomsS = topoS.objects.countries.geometries;
    const dPays = new Map();
    for (const d of I.districts) for (const p of d.pays || []) dPays.set(p, d);
    const dist = g => dPays.get(g.properties.name), sect = g => (dist(g) || {})._secteur;
    const fusion = (f) => {
      const a = geoms.filter(f), b = geomsS.filter(f);
      return a.length ? [topojson.merge(topo, a), topojson.merge(topoS, b)] : [null, null];
    };
    // Pendant un mouvement du globe : sans les petites îles, pour reprojeter moins de points
    const allege = g => { if (!g) return null; const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates], gros = polys.filter(c => d3.geoArea({ type: 'Polygon', coordinates: c }) > 3e-5); return { type: 'MultiPolygon', coordinates: gros.length ? gros : polys.slice(0, 1) }; };
    for (const d of I.districts) { [d._geo, d._geoS] = fusion(g => dist(g) === d); d._geoM = allege(d._geoS); }
    for (const s of data.secteurs) [s._geo, s._geoS] = fusion(g => sect(g) === s.id);
    I.monde = {};
    [I.monde.terres, I.monde.terresS] = fusion(() => true);
    [I.monde.libres, I.monde.libresS] = fusion(g => !dist(g));
    const maille = (t, f) => topojson.mesh(t, t.objects.countries, f);
    const fd = (a, b) => a !== b && dist(a) !== dist(b) && sect(a) === sect(b), fs = (a, b) => a !== b && sect(a) !== sect(b), fc = (a, b) => a === b;
    Object.assign(I.monde, { bDist: maille(topo, fd), bDistS: maille(topoS, fd), bSect: maille(topo, fs), bSectS: maille(topoS, fs), cotes: maille(topo, fc), cotesS: maille(topoS, fc) });
    I.monde.cotesM = { type: 'MultiLineString', coordinates: I.monde.cotesS.coordinates.filter(l => l.length > 12) };
    // Canvas empilés
    I.cv = {}; I.cx = {};
    for (const n of ['base', 'vie', 'sym', 'fx']) {
      const c = document.createElement('canvas'); c.className = 'cv cv-' + n; c.setAttribute('aria-hidden', 'true');
      el.appendChild(c); I.cv[n] = c; I.cx[n] = c.getContext('2d');
    }
    const haut = I.cv.fx;
    haut.removeAttribute('aria-hidden'); haut.setAttribute('role', 'application'); haut.setAttribute('tabindex', '0');
    haut.setAttribute('aria-label', 'Carte du conflit. Glisser pour se déplacer, molette ou pincement pour zoomer, flèches et touches plus et moins au clavier.');
    brancherPointeur(haut);
    I.sceneA = scene(null); I.sceneB = null;
    cam.mode = cam.prefGlobe ? 'globe' : 'plan';
    ajuster();
    let rt; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(ajuster, 120); }).observe(el);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => invalider());
    requestAnimationFrame(boucle);
  };
  // La vue (centre et largeur visible) est relevée avec les anciennes marges, puis replacée dans la nouvelle zone utile
  M.definirMarges = m => { const v = releverVue(), enVol = !!cam.anim && cam.mode === 'plan'; I.marges = { ...I.marges, ...m }; if (W) { ajuster(v); if (enVol) cadrer(true); } };
  M.definirScene = (i, j, u) => {
    I.sceneA = scene(i);
    I.mix = j != null && u != null && u > 0 && u < 1 ? { b: scene(j), u } : null;
    invalider();
  };
  M.definirRideau = (x, i) => { I.rideau = x == null ? null : { x, sc: scene(i) }; invalider(); };
  M.definirCouches = c => { Object.assign(I.couches, c); invalider(); };
  M.naviguer = (nav, anime) => { Object.assign(I.nav, nav); invalider(); cadrer(anime); };
  M.invalider = invalider;
  // Signale un point : onde qui s'élargit pendant deux secondes (résultat de recherche)
  M.signaler = c => { I.signal = { c, t0: I.temps() }; };
  M.projeter = c => I.P(c);
  M.palier = () => I.palier();
  M.zl = () => I.zl();
  M.intro = () => {
    if (cam.mode !== 'globe' || I.reduit()) return;
    const cible = cam.rot.slice(); cam.rot = [cible[0] - 70, cible[1] + 10, 0]; cam.kg = 0.86; majProj();
    cam.anim = { ms: 2200, t0: performance.now(), pas: e => { cam.rot = [cible[0] - 70 * (1 - e), cible[1] + 10 * (1 - e), 0]; cam.kg = 0.86 + 0.14 * e; majProj(); } };
  };

  // ---------- Boucle ----------
  let dernierVie = 0, etaitMobile = false;
  function boucle(ts) {
    requestAnimationFrame(boucle);
    if (document.hidden || !W || !I.dessin) return;
    const mobile = animer(ts) || cam.bouge;
    I.mobile = mobile;
    if (etaitMobile && !mobile) { invalider(); I.hooks.surVue && I.hooks.surVue(); }
    etaitMobile = mobile;
    // La matière des zones respire : quelques images par seconde suffisent
    if (!I.sale.vie && !I.reduit() && ts - dernierVie > (mobile ? 0 : 90) && I.zonesVisibles) I.sale.vie = true;
    if (I.sale.base) { I.sale.base = false; I.dessin.base(); }
    if (I.sale.vie) { I.sale.vie = false; dernierVie = ts; I.dessin.vie(); }
    if (I.sale.sym) { I.sale.sym = false; I.dessin.sym(); }
    I.dessin.fx(ts);
  }
  return M;
})();
