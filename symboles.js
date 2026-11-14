// Calque des symboles (statique entre deux mouvements de caméra) : voies, lignes de front, offensives, sites,
// villes, pions, pictogrammes d'événements, étiquettes. Chaque symbole dessiné devient une cible pour le pointeur.
(() => {
  const I = CARTE._, RAD = I.RAD, G = GLYPHES, COL = I.COL, mixc = I.mixc, alpha = I.alpha;
  const data = () => I.data;

  // ---------- Courbes ----------
  // Spline de Catmull-Rom (uniforme) à travers des points [x, y], fermée ou non
  function spline(pts, n, ferme) {
    const out = [], N = pts.length, at = i => ferme ? pts[(i + N) % N] : pts[Math.max(0, Math.min(N - 1, i))];
    for (let i = 0; i < (ferme ? N : N - 1); i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    out.push(ferme ? out[0] : pts[N - 1]);
    return out;
  }
  // Longueurs cumulées d'une ligne en degrés (corrigées de la latitude), et position à une distance donnée
  function mesurer(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * Math.cos(pts[i][1] * RAD), pts[i][1] - pts[i - 1][1]));
    return { pts, cum, lg: cum[cum.length - 1] || 1e-6 };
  }
  function posSur(m, d) {
    d = Math.max(0, Math.min(m.lg, d));
    let j = d3.bisectRight(m.cum, d) - 1; j = Math.max(0, Math.min(m.pts.length - 2, j));
    const u = (d - m.cum[j]) / ((m.cum[j + 1] - m.cum[j]) || 1), a = m.pts[j], b = m.pts[j + 1];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  }
  Object.assign(I, { spline, mesurer, posSur });

  // Point surélevé au-dessus du globe (satellites) : [x, y, devant] ou null s'il est caché par la sphère
  function Palt(c, h, rot) {
    const cam = I.cam;
    if (cam.mode !== 'globe') { const p = I.P(c); return p && [p[0], p[1], true]; }
    const [l, f] = rot(c), lr = l * RAD, fr = f * RAD, x = Math.cos(fr) * Math.sin(lr), y = -Math.sin(fr), z = Math.cos(fr) * Math.cos(lr), R = cam.R * cam.kg * (1 + h);
    if (z < 0 && Math.hypot(x, y) * (1 + h) < 1.005) return null;
    return [cam.c[0] + R * x, cam.c[1] + R * y, z >= 0];
  }
  I.Palt = Palt;

  // ---------- Satellites ----------
  function posOrbite(s, u) {
    const i = s.inclinaison * RAD, lat = Math.asin(Math.sin(i) * Math.sin(u)) / RAD, lon = s.noeud + Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u)) / RAD;
    return [((lon + 540) % 360) - 180, lat];
  }
  I.posOrbite = posOrbite;
  const ALT = s => s.geo ? 0.13 : s.etoile ? 0.085 : 0.06;
  function orbites(ctx) {
    const cam = I.cam, rot = d3.geoRotation(cam.rot);
    for (const s of data().satellites || []) {
      if (s.geo) continue;
      const pts = []; for (let a = 0; a <= 360; a += 3) pts.push(posOrbite(s, a * RAD));
      ctx.lineWidth = s.etoile ? 1.1 : 0.8; ctx.setLineDash(s.etoile ? [5, 4] : [2, 5]);
      if (cam.mode === 'globe') {
        I.ecran(ctx);
        for (const devant of [false, true]) {
          ctx.strokeStyle = alpha(s.etoile ? COL.or : COL.science, devant ? 0.5 : 0.16); ctx.beginPath();
          let pr = null;
          for (const c of pts) { const p = Palt(c, ALT(s), rot); if (p && pr && p[2] === devant && pr[2] === devant) { ctx.moveTo(pr[0], pr[1]); ctx.lineTo(p[0], p[1]); } pr = p; }
          ctx.stroke();
        }
      } else {
        I.vue(ctx); ctx.lineWidth = I.px(ctx.lineWidth); ctx.setLineDash(ctx.getLineDash().map(I.px));
        ctx.strokeStyle = alpha(s.etoile ? COL.or : COL.science, 0.34);
        ctx.stroke(I.forme('orb:' + s.id, { type: 'LineString', coordinates: pts }));
      }
      ctx.setLineDash([]);
    }
  }

  // ---------- Traverseurs (voies ferrées) ----------
  let rails = null;
  function preparerRails() {
    if (rails) return rails;
    const sc = CARTE.scene(null), dangers = [...(data().zones || []), ...sc.detruites];
    const pres = (m, z, f) => z.contour ? d3.geoContains(I.tache(f > 1 ? I.haloDe(z) : z), m) : d3.geoDistance(m, z.centre) / RAD < (+z.rayon || 1) * f;
    rails = (data().traverseurs || []).map(r => {
      const voie = r.boucle ? [...r.voie, r.voie[0]] : r.voie, pts = [voie[0]];
      for (let i = 1; i < voie.length; i++) {
        const f = d3.geoInterpolate(voie[i - 1], voie[i]), n = Math.max(1, Math.ceil(d3.geoDistance(voie[i - 1], voie[i]) / RAD / 0.5));
        for (let j = 1; j <= n; j++) pts.push(f(j / n));
      }
      const etatSeg = (a, b) => { const m = d3.geoInterpolate(a, b)(0.5); return dangers.some(z => pres(m, z, 1.1)) ? 'coupe' : (r.travaux || []).some(z => pres(m, z, 1)) ? 'travaux' : ''; };
      const troncons = [];
      for (let i = 1; i < pts.length; i++) {
        const c = etatSeg(pts[i - 1], pts[i]), der = troncons[troncons.length - 1];
        if (der && der.etat === c) der.pts.push(pts[i]); else troncons.push({ etat: c, pts: [pts[i - 1], pts[i]] });
      }
      const libres = troncons.filter(t => !t.etat), boucle = r.boucle && !troncons.some(t => t.etat);
      const parcours = boucle ? pts : (libres.slice().sort((a, b) => b.pts.length - a.pts.length)[0] || { pts: [] }).pts;
      return { ...r, troncons, branches: r.branches || [], parcours: parcours.length > 1 ? mesurer(parcours) : null, navette: !boucle, coupee: troncons.some(t => t.etat === 'coupe'), enTravaux: troncons.some(t => t.etat === 'travaux') };
    });
    return rails;
  }
  I.rails = preparerRails;
  function voies(ctx, pal) {
    I.vue(ctx);
    const px = I.px;
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const r of preparerRails()) {
      const toutes = [...r.troncons, ...r.branches.map(b => ({ etat: '', pts: b }))];
      toutes.forEach((t, i) => {
        const f = I.forme('rail:' + r.id + ':' + i, { type: 'LineString', coordinates: t.pts });
        if (pal === 0) { ctx.strokeStyle = t.etat === 'coupe' ? 'rgba(255,90,95,.4)' : 'rgba(233,196,106,.38)'; ctx.lineWidth = px(0.9); ctx.setLineDash(t.etat ? [px(2), px(3)] : []); ctx.stroke(f); ctx.setLineDash([]); return; }
        ctx.strokeStyle = 'rgba(8,7,16,.7)'; ctx.lineWidth = px(3.2); ctx.stroke(f);
        if (t.etat === 'coupe') { ctx.strokeStyle = COL.cult; ctx.lineWidth = px(1.4); ctx.setLineDash([px(2), px(5)]); ctx.stroke(f); }
        else if (t.etat === 'travaux') { ctx.strokeStyle = COL.etat.grave; ctx.lineWidth = px(1.6); ctx.setLineDash([px(5), px(3)]); ctx.stroke(f); }
        else {
          ctx.strokeStyle = alpha(COL.or, 0.85); ctx.lineWidth = px(1.2); ctx.stroke(f);
          ctx.strokeStyle = alpha(COL.or, 0.4); ctx.lineWidth = px(3.6); ctx.setLineDash([px(1), px(4)]); ctx.stroke(f);
        }
        ctx.setLineDash([]);
      });
      // Cible de survol : la voie entière
      const pts = [...r.voie, ...(r.boucle ? [r.voie[0]] : [])].map(c => I.P(c)).filter(Boolean);
      if (pts.length > 1) I.traitsCibles.push({ pts, obj: r, type: 'rail', l: 4 });
    }
  }

  // ---------- Flottes : route de patrouille ----------
  function routeFlotte(f) { return f._route || (f._route = mesurer(spline(f.trajet, 12, true))); }
  I.routeFlotte = routeFlotte;
  function routes(ctx) {
    I.vue(ctx);
    ctx.setLineDash([I.px(2), I.px(4)]); ctx.lineWidth = I.px(0.8); ctx.strokeStyle = alpha(COL.cc, 0.32);
    for (const f of data().flottes || []) ctx.stroke(I.forme('route:' + f.id, { type: 'LineString', coordinates: routeFlotte(f).pts }));
    ctx.setLineDash([]);
  }

  // Polyligne à l'écran, avec la suite de points visibles et leurs distances cumulées
  function ecranLigne(coords) {
    const pts = [];
    for (const c of coords) { const p = I.P(c); if (p) pts.push(p); }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, lg: cum[cum.length - 1] || 0 };
  }
  function tracer(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); }
  const pointA = (L, d) => {
    let j = d3.bisectRight(L.cum, d) - 1; j = Math.max(0, Math.min(L.pts.length - 2, j));
    const a = L.pts[j], b = L.pts[j + 1], lg = (L.cum[j + 1] - L.cum[j]) || 1, u = (d - L.cum[j]) / lg;
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, ux: (b[0] - a[0]) / lg, uy: (b[1] - a[1]) / lg };
  };
  I.pointA = pointA;

  // ---------- Lignes de front tenues par la Confédération ----------
  function lignes(ctx, sc) {
    I.ecran(ctx);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const x of sc.lignes) {
      const L = ecranLigne(spline(x.trace, 8, false));
      if (L.pts.length < 2) continue;
      const type = x.type || 'stabilisee', coul = type === 'stabilisee' ? COL.stab : type === 'renforcee' ? COL.renf : COL.fort, e = I.ech;
      tracer(ctx, L.pts); ctx.strokeStyle = 'rgba(6,5,14,.8)'; ctx.lineWidth = (type === 'renforcee' ? 8 : 5.5) * e; ctx.stroke();
      if (type === 'renforcee') { ctx.strokeStyle = coul; ctx.lineWidth = 5 * e; ctx.stroke(); ctx.strokeStyle = '#0c1a1a'; ctx.lineWidth = 1.8 * e; ctx.stroke(); }
      else { ctx.strokeStyle = coul; ctx.lineWidth = 2.2 * e; ctx.stroke(); }
      // Ouvrages le long de la ligne : traits courts (stabilisée), redoutes carrées (fortifiée), bastions pleins (renforcée)
      const pas = (type === 'renforcee' ? 15 : 11) * e;
      for (let d = pas / 2; d < L.lg; d += pas) {
        const p = pointA(L, d);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.uy, p.ux));
        if (type === 'stabilisee') { ctx.strokeStyle = coul; ctx.lineWidth = 1.4 * e; ctx.beginPath(); ctx.moveTo(0, -3.4 * e); ctx.lineTo(0, 3.4 * e); ctx.stroke(); }
        else { const t = (type === 'renforcee' ? 3.6 : 2.5) * e; ctx.fillStyle = coul; ctx.strokeStyle = '#08120e'; ctx.lineWidth = 0.8; ctx.fillRect(-t, -t, 2 * t, 2 * t); ctx.strokeRect(-t, -t, 2 * t, 2 * t); }
        ctx.restore();
      }
      I.traitsCibles.push({ pts: L.pts, obj: x, type: 'ligne', l: 6 });
    }
  }

  // ---------- Offensives de la semaine : flèches effilées ----------
  I.axesEcran = [];
  function axes(ctx, sc) {
    I.ecran(ctx);
    I.axesEcran = [];
    for (const a of sc.axes) {
      const L = ecranLigne(spline(a.trace, 10, false));
      if (L.pts.length < 3 || L.lg < 14) continue;
      const coul = a.camp === 'cc' ? COL.cc : COL.cult, e = I.ech, tete = Math.min(15 * e, L.lg * 0.45), corps = L.lg - tete;
      const g = [], d = [];
      for (let s = 0; s <= corps; s += 4) { const p = pointA(L, s), w = (1 + 4 * (s / corps)) * e; g.push([p.x + p.uy * w, p.y - p.ux * w]); d.push([p.x - p.uy * w, p.y + p.ux * w]); }
      const b = pointA(L, corps), bout = L.pts[L.pts.length - 1], wt = 9.5 * e;
      const poly = [...g, [b.x + b.uy * wt, b.y - b.ux * wt], bout, [b.x - b.uy * wt, b.y + b.ux * wt], ...d.reverse()];
      const grad = ctx.createLinearGradient(L.pts[0][0], L.pts[0][1], bout[0], bout[1]);
      grad.addColorStop(0, alpha(coul, 0.05)); grad.addColorStop(0.55, alpha(coul, 0.6)); grad.addColorStop(1, coul);
      tracer(ctx, poly); ctx.closePath();
      ctx.strokeStyle = 'rgba(6,5,14,.75)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = alpha(mixc(coul, '#ffffff', 0.45), 0.8); ctx.lineWidth = 0.9; ctx.stroke();
      I.traitsCibles.push({ pts: L.pts, obj: a, type: 'axe', l: 7 });
      I.axesEcran.push({ L, coul, corps });
    }
  }

  // ---------- Étiquettes : posées par priorité, sans chevauchement ----------
  let etiquettes = [], occupes = [];
  const etiqueter = o => etiquettes.push(o);
  const libre = r => !occupes.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
  function poserEtiquettes(ctx) {
    I.ecran(ctx);
    const { W, H } = I.dim();
    etiquettes.sort((a, b) => b.prio - a.prio);
    for (const o of etiquettes) {
      ctx.font = o.font;
      const lignesTxt = o.lignes || [o.txt], larg = Math.max(...lignesTxt.map(l => ctx.measureText(l).width)), ht = (o.taille || 11) * 1.2 * lignesTxt.length;
      const x0 = o.align === 'center' ? o.x - larg / 2 : o.x, r = [x0 - 2, o.y - ht / 2 - 1, x0 + larg + 2, o.y + ht / 2 + 1];
      if (r[2] < 0 || r[0] > W || r[3] < 0 || r[1] > H) continue;
      if (!o.force && !libre(r)) continue;
      occupes.push(r);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      lignesTxt.forEach((l, i) => {
        const y = o.y + (i - (lignesTxt.length - 1) / 2) * (o.taille || 11) * 1.2, x = o.align === 'center' ? o.x - ctx.measureText(l).width / 2 : o.x;
        ctx.font = i === 0 && o.fontHaut ? o.fontHaut : o.font;
        const xx = i === 0 && o.fontHaut && o.align === 'center' ? o.x - ctx.measureText(l).width / 2 : x;
        ctx.strokeStyle = COL.halo; ctx.lineWidth = 3.2; ctx.strokeText(l, xx, y);
        ctx.fillStyle = i === 0 && o.fontHaut ? alpha(o.couleur || COL.texte, 0.62) : (o.couleur || COL.texte); ctx.fillText(l, xx, y);
      });
    }
  }

  // ---------- Sites ----------
  const FAMILLE = { energie: COL.or, science: COL.science };
  I.labsEcran = [];
  function sites(ctx, sc, pal) {
    I.ecran(ctx);
    I.labsEcran = [];
    const e = I.ech;
    for (const s of data().sites || []) {
      const p = I.P(s.coord);
      if (!p) continue;
      const T = G.SITES[s.icone], perdu = /perdu|désactiv/i.test(s.etat || ''), brume = !!sc.brouillard(s.coord);
      if (!T) {
        // Lieux de grande importance : étoile brisée de la Confédération
        const k = (pal === 0 ? 19 : 24) * e / 610;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(k, k); ctx.translate(-415, -415);
        ctx.strokeStyle = 'rgba(8,7,16,.9)'; ctx.lineWidth = 2.4 / k; ctx.stroke(G.F.etoile); ctx.fillStyle = COL.or; ctx.fill(G.F.etoile, 'evenodd'); ctx.restore();
        I.cibles.push({ x: p[0], y: p[1], r: 11 * e, type: 'site', obj: s });
        etiqueter({ txt: s.nom, x: p[0] + 13 * e, y: p[1], prio: 8, font: `600 ${12 * e}px ${I.sans}`, taille: 12 * e, couleur: COL.or });
        continue;
      }
      if (s.glitch) {
        if (!I.couches.anormal) continue;
        const r = [6.5, 11, 16][pal] * e;
        I.labsEcran.push({ x: p[0], y: p[1], r, s, urgence: /urgence/i.test(s.etat || '') });
        I.cibles.push({ x: p[0], y: p[1], r: r + 2, type: 'site', obj: s });
        occupes.push([p[0] - r, p[1] - r, p[0] + r, p[1] + r]);
        if (pal >= 1) etiqueter({ txt: s.nom, x: p[0] + r + 5, y: p[1], prio: 5, font: `600 ${11 * e}px ${I.mono}`, taille: 11 * e, couleur: '#f0c4ff' });
        continue;
      }
      if (!I.couches.infrastructure) continue;
      const coul = perdu || brume ? COL.cult : FAMILLE[T.famille] || COL.science;
      if (T.mineur && pal === 0) continue;
      if ((T.mineur && pal === 1) || (!T.mineur && pal === 0 && !s.ile)) {
        ctx.fillStyle = 'rgba(8,7,16,.85)'; ctx.beginPath(); ctx.arc(p[0], p[1], 3.6 * e, 0, 7); ctx.fill();
        ctx.fillStyle = coul; ctx.beginPath(); ctx.arc(p[0], p[1], 2.2 * e, 0, 7); ctx.fill();
        I.cibles.push({ x: p[0], y: p[1], r: 5 * e, type: 'site', obj: s });
        continue;
      }
      const t = (pal === 2 ? 10 : 8.5) * e;
      ctx.save(); ctx.translate(p[0], p[1]);
      ctx.beginPath(); ctx.roundRect(-t, -t, 2 * t, 2 * t, 3.5 * e);
      ctx.fillStyle = 'rgba(14,15,34,.94)'; ctx.fill();
      ctx.strokeStyle = coul; ctx.lineWidth = 1.2;
      ctx.setLineDash(/fabrication/i.test(s.etat || '') ? [4, 2.5] : /recherche/i.test(s.etat || '') ? [1.5, 2.5] : []); ctx.stroke(); ctx.setLineDash([]);
      const k = t * 1.5 / 24;
      ctx.scale(k, k); ctx.translate(-12, -12);
      ctx.strokeStyle = perdu || brume ? alpha(coul, 0.5) : mixc(coul, '#ffffff', 0.35); ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(T.p);
      if (perdu || brume) { ctx.strokeStyle = COL.cult; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(3, 21); ctx.lineTo(21, 3); ctx.stroke(); }
      ctx.restore();
      I.cibles.push({ x: p[0], y: p[1], r: t + 1, type: 'site', obj: s });
      occupes.push([p[0] - t, p[1] - t, p[0] + t, p[1] + t]);
      if (!T.mineur || pal === 2) etiqueter({ txt: s.nom, x: p[0] + t + 5, y: p[1], prio: T.mineur ? 2 : 4, font: `500 ${10.5 * e}px ${I.sans}`, taille: 10.5 * e, couleur: mixc(coul, '#ffffff', 0.5) });
    }
  }

  // ---------- Villes : ligne d'horizon miniature ----------
  function villes(ctx, sc, pal) {
    I.ecran(ctx);
    const e = I.ech;
    for (const v of sc.villes) {
      const p = I.P(v.coord);
      if (!p || !I.parId[v.district]) continue;
      const [, cls] = VILLES.niveau(v.etat), coul = COL.etat[cls], s = [0.82, 1.08, 1.45][pal] * e, S = G.silhouette(v), sel = I.nav.ville === v.id, survol = I.survol && I.survol.type === 'ville' && I.survol.obj.id === v.id;
      ctx.save(); ctx.translate(p[0], p[1] + 4 * s); ctx.scale(s, s);
      if (sel || survol) { ctx.strokeStyle = alpha(coul, 0.9); ctx.lineWidth = 1.2 / s; ctx.beginPath(); ctx.ellipse(0, -4, 17, 12, 0, 0, 7); ctx.stroke(); }
      ctx.fillStyle = 'rgba(8,7,16,.8)'; ctx.beginPath(); ctx.roundRect(-13.5, -15.5, 27, 18, 3); ctx.fill();
      ctx.fillStyle = mixc('#0e0d1c', coul, 0.3); ctx.strokeStyle = coul; ctx.lineWidth = 0.9; ctx.lineJoin = 'round';
      ctx.fill(S.p); ctx.stroke(S.p);
      ctx.strokeStyle = coul; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-12.5, 0.4); ctx.lineTo(12.5, 0.4); ctx.stroke();
      // Braises sur les immeubles éventrés
      ctx.fillStyle = '#ffb054';
      for (const b of S.bats) if (b.feu) { ctx.beginPath(); ctx.arc(b.x + b.w / 2, -b.h * 0.5, 0.9, 0, 7); ctx.fill(); }
      if (v.capitale) {
        const k = 11 / 610;
        ctx.translate(0, -21); ctx.scale(k, k); ctx.translate(-415, -415);
        ctx.strokeStyle = 'rgba(8,7,16,.9)'; ctx.lineWidth = 2 / k; ctx.stroke(G.F.etoile); ctx.fillStyle = COL.or; ctx.fill(G.F.etoile, 'evenodd');
      }
      ctx.restore();
      const w = 14 * s;
      I.cibles.push({ x: p[0], y: p[1] - 4 * s, w: w * 2, h: 22 * s, type: 'ville', obj: v });
      occupes.push([p[0] - w, p[1] - 14 * s, p[0] + w, p[1] + 6 * s]);
      if (pal >= 1 || sel) etiqueter({ txt: v.nom, x: p[0] + w + 3, y: p[1] - 3 * s, prio: v.capitale ? 7 : 6, font: `600 ${11 * e}px ${I.sans}`, taille: 11 * e, force: sel });
    }
  }

  // ---------- Pions ----------
  const TYPES_UNITE = I.TYPES_UNITE = {
    reg: { re: /^forces régulières/i, nom: 'Forces régulières', ref: 1e6, echelon: 'XXX', piles: [3e6, 8e6] },
    fs: { re: /^forces spéciales/i, nom: 'Forces spéciales', ref: 5000, echelon: 'X', piles: [1e4] },
    ph: { re: /^division phoenix/i, nom: 'Division Phoenix', ref: 1500, echelon: 'XX', piles: [3000] },
    cult: { nom: 'Cultistes', ref: 1e6, echelon: '', piles: [5e6, 2e7] },
    cc: { nom: 'Forces de la Confédération', ref: 1e6, echelon: '', piles: [] }
  };
  const MORCEAUX = { reg: [1.5e6, 4e6, 8e6], fs: [6000], ph: [], cult: [3e6, 1.2e7] };
  const ancre = I.ancre = o => o.label || (o._ancre || (o._ancre = o._geoS ? d3.geoCentroid(o._geoS) : null));
  function pointsDe(d) {
    if (d._pts) return d._pts;
    const polys = d._geoS.type === 'MultiPolygon' ? d._geoS.coordinates : [d._geoS.coordinates];
    const aires = polys.map(c => d3.geoArea({ type: 'Polygon', coordinates: c })), max = Math.max(...aires);
    const geo = { type: 'MultiPolygon', coordinates: polys.filter((c, i) => aires[i] >= max * 0.2) };
    let [[x0, y0], [x1, y1]] = d3.geoBounds(geo);
    if (x1 < x0) x1 += 360;
    const pts = [], n = 16;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      let lon = x0 + (x1 - x0) * (i + 0.5) / (n + 1); const lat = y0 + (y1 - y0) * (j + 0.5) / (n + 1);
      if (lon > 180) lon -= 360;
      if (lat > 75 || lat < -60) continue;
      if (d3.geoContains(geo, [lon, lat])) pts.push([lon, lat]);
    }
    return (d._pts = pts);
  }
  // Usure d'un camp dans un district : part des tués dans l'effectif d'origine (direct seulement)
  function usure(sc, d, camp) {
    if (!sc.direct) return null;
    const t = C.parse(d.pertes && d.pertes[camp] && d.pertes[camp].tues).n;
    const eff = C.somme(((d.forces || {})[camp] || []).filter(u => !/milice|survivants/i.test(u.nom)).map(u => u.effectif)).n;
    return t + eff > 0 ? t / (t + eff) : null;
  }
  const cachePions = new Map();
  function pionsDe(sc) {
    const sel = I.nav.niveau === 'monde' ? null : I.nav.secteur, fin = I.nav.niveau === 'district' ? I.nav.district : null, cle = sc.id + '|' + (sel || '') + '|' + (fin || '');
    if (cachePions.has(cle)) return cachePions.get(cle);
    const pions = [];
    if (!sc.archiveForces) { cachePions.set(cle, pions); return pions; }
    const foyers = sc.zones.filter(z => (+z.rayon || 0) >= 2);
    const couleurZone = d => {
      const a = ancre(d);
      const z = sc.zones.find(x => x.district === d.id) || (a && foyers.map(x => ({ x, dist: d3.geoDistance(x.centre, a) })).sort((p, q) => p.dist - q.dist)[0] || {}).x;
      return z ? z.couleur : null;
    };
    // Vue monde : un pion par camp et par district, total des troupes militaires (sans les milices)
    if (!sel) for (const d of I.districts) {
      const a = d._geoS && ancre(d);
      if (!a) continue;
      const F = sc.forces(d), cc = (F.confederation || []).filter(u => u.effectif !== undefined && u.effectif !== '' && !/milice/i.test(u.nom));
      const cult = (F.cultistes || []).filter(u => !/survivants/i.test(u.nom)), camps = [];
      if (cc.length) camps.push({ type: 'cc', liste: cc, camp: 'confederation' });
      if (cult.length) camps.push({ type: 'cult', liste: cult, couleur: couleurZone(d), camp: 'cultistes' });
      camps.forEach((c, i) => {
        const tot = C.somme(c.liste.map(u => u.effectif)), t = !tot.n ? 0.8 : Math.max(0.75, Math.min(1.35, 0.95 + 0.15 * Math.log10(tot.n / 1e6)));
        pions.push({ type: c.type, n: tot.n, v: tot, inconnu: !tot.n, couleur: c.couleur, detail: c.liste, synthese: true, id: `${d.id}:${c.type}`, g: d.id, d, t, pile: 1, c: a, dx: camps.length > 1 ? (i ? 15 : -15) : 0, larg: 26 * t + 34, usure: usure(sc, d, c.camp) });
      });
    }
    else for (const d of I.districts.filter(x => x._geoS && x._secteur === sel)) {
      const centre = ancre(d);
      if (!centre) continue;
      const F = sc.forces(d), us = [];
      for (const [k, T] of Object.entries(TYPES_UNITE)) {
        if (!T.re) continue;
        const u = (F.confederation || []).find(x => T.re.test(x.nom)), n = u ? C.parse(u.effectif).n : 0;
        if (n > 0) us.push({ type: k, n, v: u.effectif, camp: 'confederation' });
      }
      const cult = (F.cultistes || []).filter(u => !/survivants/i.test(u.nom));
      if (cult.length) { const tot = C.somme(cult.map(u => u.effectif)); us.push({ type: 'cult', n: tot.n, v: tot, inconnu: !tot.n, couleur: couleurZone(d), camp: 'cultistes' }); }
      const cands = pointsDe(d).length ? pointsDe(d) : [centre];
      const bulles = sc.zones.filter(z => z.district === d.id).sort((x, y) => (+y.rayon || 0) - (+x.rayon || 0));
      const voisin = bulles.length ? null : (foyers.map(z => ({ z, dist: d3.geoDistance(z.centre, centre) })).filter(o => o.dist < 0.75).sort((x, y) => x.dist - y.dist)[0] || {}).z;
      const autour = bulles.length ? bulles : voisin ? [voisin] : [];
      const petitesPoches = bulles.length > 0 && bulles.every(z => (+z.rayon || 0) < 2);
      const decale = (c, r, th) => [c[0] + r * Math.cos(th) / Math.max(0.2, Math.cos(c[1] * RAD)), c[1] + r * Math.sin(th)];
      const surTerre = pt => d3.geoContains(d._geoS, pt);
      const dedans = [], anneau = [], derriere = [];
      for (const z of bulles) {
        const R = +z.rayon || 1; dedans.push(z.centre);
        for (let a = 0; a < 8; a++) for (const f of [0.35, 0.6]) { const q = decale(z.centre, R * f, a * Math.PI / 4 + f); if (surTerre(q)) dedans.push(q); }
      }
      for (const z of autour) {
        const R = +z.rayon || 1;
        if (z.cordon) { const pts = I.ringCordon(z).coordinates[0].filter(surTerre); if (pts.length) { anneau.push(...pts); continue; } }
        for (const f of [1.35, 1.7, 2.2, 3]) {
          const pts = [];
          for (let a = 0; a < 24; a++) { const q = decale(z.centre, R * f, a * Math.PI / 12); if (surTerre(q)) pts.push(q); }
          if (pts.length) { anneau.push(...pts); break; }
        }
      }
      if (voisin && voisin.cordon) { const R = +voisin.rayon || 1; for (let a = 0; a < 24; a++) for (const f of [0.55, 0.7, 0.85]) { const q = decale(voisin.centre, R * f, a * Math.PI / 12); if (surTerre(q)) derriere.push(q); } }
      const villesD = sc.villes.filter(v => v.district === d.id).map(v => v.coord), calme = [...villesD, ...cands], pris = [centre];
      const choisir = (liste, poids) => { let best = -Infinity, pos = null; for (const c of liste) { const s = Math.min(...pris.map(q => d3.geoDistance(c, q))) - poids * d3.geoDistance(c, centre); if (s > best) { best = s; pos = c; } } return pos; };
      const ordre = [...us.filter(u => u.type === 'cult'), ...us.filter(u => u.type === 'ph'), ...us.filter(u => u.type !== 'cult' && u.type !== 'ph')];
      for (const u of ordre) {
        const T = TYPES_UNITE[u.type], nb = u.inconnu || d.id !== fin ? 1 : 1 + MORCEAUX[u.type].filter(x => u.n >= x).length, part = u.n / nb;
        const t = u.inconnu ? 0.8 : Math.max(0.7, Math.min(1.5, 0.95 + 0.22 * Math.log10(part / T.ref)));
        for (let m = 0; m < nb; m++) {
          let pos;
          if (u.type === 'cult' && m === 0 && bulles.length) pos = bulles[0].centre;
          else if ((u.type === 'cult' || u.type === 'ph') && dedans.length) pos = choisir(dedans, 0);
          else if (u.type === 'cult' && derriere.length) pos = choisir(derriere, 0);
          else if (u.type === 'cult' && anneau.length) pos = choisir(anneau, 0);
          else if (anneau.length && u.type === 'reg' && m > 0 && petitesPoches) pos = villesD.find(v => pris.every(q => d3.geoDistance(q, v) > 0.01)) || choisir(calme, 0.8);
          else if (anneau.length) pos = choisir(anneau, 0.1);
          else if (u.type === 'cult') pos = choisir(cands.filter(c => villesD.every(v => d3.geoDistance(c, v) > 0.05)), 0.4);
          else pos = m < villesD.length && pris.every(q => d3.geoDistance(q, villesD[m]) > 0.01) ? villesD[m] : choisir(calme, 0.8);
          pos = pos || centre; pris.push(pos);
          pions.push({ ...u, n: part, v: nb > 1 ? '~' + Math.round(part) : u.v, total: nb > 1 ? u.v : null, nb, id: `${d.id}:${u.type}:${m}`, g: `${d.id}:${u.type}:${m}`, d, t, pile: u.inconnu ? 1 : 1 + T.piles.filter(x => part >= x).length, c: pos, dx: 0, larg: 26 * t + 6, usure: usure(sc, d, u.camp) });
        }
      }
    }
    cachePions.set(cle, pions);
    return pions;
  }
  function dessinerPion(ctx, u, x, y, s, survol) {
    const T = TYPES_UNITE[u.type], us = u.usure, cult = u.type === 'cult';
    const coul = cult ? (u.couleur || COL.cult) : COL.cc, clair = mixc(coul, '#ffffff', cult ? 0.4 : 0.45);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let j = u.pile - 1; j >= 0; j--) {
      const o = j * 2.6;
      ctx.beginPath();
      if (cult) { ctx.moveTo(o, -12 - o); ctx.lineTo(12 + o, -o); ctx.lineTo(o, 12 - o); ctx.lineTo(-12 + o, -o); ctx.closePath(); }
      else ctx.roundRect(-12 + o, -8 - o, 24, 16, 2);
      ctx.fillStyle = cult ? mixc(coul, '#0a0814', 0.62) : COL.ccFonce; ctx.fill();
      ctx.strokeStyle = survol && j === 0 ? '#ffffff' : clair; ctx.lineWidth = 1.2;
      // Unité saignée : cadre en pointillés
      ctx.setLineDash(us != null && us > 0.5 && j === 0 ? [3, 2] : []); ctx.stroke(); ctx.setLineDash([]);
    }
    if (cult) {
      if (u.inconnu) { ctx.fillStyle = clair; ctx.font = `700 12px ${I.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 0.5); }
      else { ctx.save(); ctx.scale(6.6, 6.6); ctx.fillStyle = clair; ctx.fill(G.F.chaos); ctx.restore(); }
    } else {
      ctx.strokeStyle = clair; ctx.fillStyle = clair; ctx.lineWidth = 1.1;
      if (u.type === 'reg') { ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(12, 8); ctx.moveTo(-12, 8); ctx.lineTo(12, -8); ctx.stroke(); }
      else if (u.type === 'fs') ctx.fill(G.F.dague);
      else if (u.type === 'ph') { ctx.fillStyle = '#ffb86b'; ctx.fill(G.F.phenix); }
      else { ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, 7); ctx.moveTo(0, -4.6); ctx.lineTo(4, 2.3); ctx.lineTo(-4, 2.3); ctx.closePath(); ctx.stroke(); }
      // Fêlure en travers du cadre quand l'unité a perdu l'essentiel de ses hommes
      if (us != null && us > 0.75) { ctx.strokeStyle = '#ff7a7f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(-5, -1); ctx.lineTo(-7, 3); ctx.lineTo(1, 2); ctx.lineTo(-1, 6); ctx.lineTo(6, 8); ctx.stroke(); }
      if (T.echelon) { ctx.font = `700 6.5px ${I.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = clair; ctx.fillText(T.echelon, 0, -10.5); }
    }
    // Jauge : effectif restant (couleur du camp) et pertes (rouge sombre)
    const yb = cult ? 14.5 : 10.5;
    if (us != null) {
      ctx.fillStyle = 'rgba(6,5,14,.9)'; ctx.fillRect(-12.5, yb - 0.5, 25, 3.6);
      ctx.fillStyle = '#8f2a33'; ctx.fillRect(-12, yb, 24, 2.6);
      ctx.fillStyle = clair; ctx.fillRect(-12, yb, 24 * (1 - us), 2.6);
    }
    const txt = u.inconnu ? '?' : (cult ? '≈ ' : '') + C.court(u.n);
    ctx.font = `600 8.5px ${I.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const yt = yb + (us != null ? 9.5 : 6);
    ctx.strokeStyle = COL.halo; ctx.lineWidth = 3; ctx.strokeText(txt, 0, yt);
    ctx.fillStyle = cult ? clair : COL.texte; ctx.fillText(txt, 0, yt);
    ctx.restore();
  }
  function pions(ctx, sc) {
    I.ecran(ctx);
    const e = I.ech, liste = pionsDe(sc).map(u => ({ u, p: I.P(u.c) })).filter(o => o.p);
    // Écarte les groupes qui se chevauchent à l'écran
    const groupes = new Map();
    for (const o of liste) {
      if (!groupes.has(o.u.g)) groupes.set(o.u.g, { x: o.p[0], y: o.p[1] + 6 * e, w: ((o.u.larg || 30) + 8) * e, h: 46 * e, ox: 0, oy: 0 });
      o.gr = groupes.get(o.u.g);
    }
    const gs = [...groupes.values()];
    for (let it = 0; it < 40; it++) {
      let bouge = false;
      for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
        const a = gs[i], b = gs[j], dx = (b.x + b.ox) - (a.x + a.ox), dy = (b.y + b.oy) - (a.y + a.oy);
        const ox = (a.w + b.w) / 2 - Math.abs(dx), oy = (a.h + b.h) / 2 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        bouge = true;
        if (oy < ox) { const m = oy / 2 + 0.5, sg = dy >= 0 ? 1 : -1; a.oy -= sg * m; b.oy += sg * m; }
        else { const m = ox / 2 + 0.5, sg = dx >= 0 ? 1 : -1; a.ox -= sg * m; b.ox += sg * m; }
      }
      if (!bouge) break;
    }
    for (const o of liste) {
      const u = o.u, s = u.t * e, x = o.p[0] + u.dx * e + o.gr.ox, y = o.p[1] + o.gr.oy;
      const survol = I.survol && I.survol.type === 'pion' && I.survol.obj.id === u.id;
      dessinerPion(ctx, u, x, y, s, survol);
      I.cibles.push({ x, y: y + 5 * s, w: 28 * s, h: 40 * s, type: 'pion', obj: u });
      occupes.push([x - 15 * s, y - 14 * s, x + 15 * s, y + 26 * s]);
    }
  }

  // ---------- Pictogrammes des événements de la semaine ----------
  const CAMP = { cult: '#c8323c', cc: '#2f6fd6', feu: '#e07b1e', neutre: '#4b4f78' };
  I.pings = [];
  const RANG = { mineur: 0, majeur: 1, critique: 2 };
  function pictos(ctx, sc, pal) {
    I.ecran(ctx);
    I.pings = [];
    const e = I.ech * (pal === 0 ? 0.88 : 1), r = 10.5 * e, lots = [];
    for (const ev of sc.evtsTour) for (const c of ev.lieux || []) {
      const p = I.P(c);
      if (!p) continue;
      // Vue stratégique : les événements voisins se rassemblent sous un seul pictogramme, avec leur nombre
      const lot = lots.find(l => Math.hypot(l.p[0] - p[0], l.p[1] - p[1]) < (pal === 0 ? 30 * e : 5));
      if (lot) { if (!lot.evs.includes(ev)) lot.evs.push(ev); } else lots.push({ p, evs: [ev] });
    }
    const badge = (x, y, ev, n, evs) => {
      const T = G.EVTS[ev.icone] || G.EVTS.signal, camp = ev.camp || T[0], coul = CAMP[camp] || CAMP.neutre;
      const survol = I.survol && I.survol.type === 'evenement' && I.survol.obj.id === ev.id;
      ctx.beginPath(); ctx.arc(x, y, r + 2.2, 0, 7); ctx.fillStyle = 'rgba(6,5,14,.8)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = coul; ctx.fill();
      ctx.strokeStyle = survol ? '#fff' : mixc(coul, '#ffffff', 0.55); ctx.lineWidth = ev.gravite === 'critique' ? 1.8 : 1; ctx.stroke();
      if (ev.gravite === 'critique') { ctx.beginPath(); ctx.arc(x, y, r + 3.6, 0, 7); ctx.strokeStyle = alpha(mixc(coul, '#ffffff', 0.4), 0.8); ctx.lineWidth = 1; ctx.stroke(); I.pings.push({ x, y, r, coul }); }
      ctx.save(); ctx.translate(x, y); const k = r * 1.36 / 24; ctx.scale(k, k); ctx.translate(-12, -12);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(T[3]); ctx.restore();
      if (n > 1) {
        ctx.beginPath(); ctx.arc(x + r * 0.8, y - r * 0.8, 6.2 * e, 0, 7); ctx.fillStyle = '#f4f1ff'; ctx.fill(); ctx.strokeStyle = 'rgba(6,5,14,.9)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#14122a'; ctx.font = `700 ${8.5 * e}px ${I.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), x + r * 0.8, y - r * 0.8 + 0.5);
      }
      I.cibles.push({ x, y, r: r + 2, type: 'evenement', obj: ev, extra: evs });
      occupes.push([x - r, y - r, x + r, y + r]);
    };
    for (const l of lots) {
      const tri = l.evs.slice().sort((a, b) => RANG[b.gravite] - RANG[a.gravite]);
      if (pal === 0) badge(l.p[0], l.p[1], tri[0], tri.length, tri);
      else tri.forEach((ev, n) => { const a = n * 2.2, d = n ? 22 * e : 0; badge(l.p[0] + d * Math.cos(a), l.p[1] + d * Math.sin(a), ev, 1, [ev]); });
    }
  }

  // ---------- Noms des secteurs et des districts ----------
  function noms(sc, pal) {
    const nav = I.nav, e = I.ech, sSel = nav.niveau !== 'monde' && I.secteurParId[nav.secteur], sel = sSel && sSel._geo ? sSel : null;
    if (!sel) {
      for (const s of data().secteurs) {
        const a = s._geoS && ancre(s), p = a && I.P(a);
        if (p) etiqueter({ txt: I.espacer(s.nom.toUpperCase()), x: p[0], y: p[1] - 30 * e, align: 'center', prio: 10, force: true, font: `700 ${12.5 * e}px ${I.mono}`, taille: 12.5 * e, couleur: 'rgba(238,240,255,.92)' });
      }
      if (pal < 1) return;
    }
    for (const d of I.districts) {
      if (!d._geoS || (sel && d._secteur !== sel.id)) continue;
      const a = ancre(d), p = a && I.P(a);
      if (!p) continue;
      const m = d.nom.match(/^(District)\s+(.*)$/i);
      etiqueter({ lignes: m ? ['DISTRICT', m[2]] : [d.nom], x: p[0], y: p[1] - 34 * e, align: 'center', prio: sel ? 9 : 3, force: !!sel, fontHaut: `600 ${8 * e}px ${I.mono}`, font: `600 ${12.5 * e}px ${I.sans}`, taille: 12.5 * e });
    }
  }

  // Survol : le secteur (vue monde) ou le district sous le pointeur s'éclaire
  function eclairer(ctx) {
    const s = I.survol;
    if (!s || s.type !== 'district') return;
    const monde = I.nav.niveau === 'monde' || s.obj._secteur !== I.nav.secteur, o = monde ? I.secteurParId[s.obj._secteur] : s.obj;
    if (!o || !o._geo) return;
    I.vue(ctx);
    const f = I.forme((monde ? 'sel:' : 'd:') + o.id, I.g(o, '_geo'));
    ctx.fillStyle = 'rgba(190,200,255,.07)'; ctx.fill(f);
    ctx.strokeStyle = 'rgba(210,216,255,.75)'; ctx.lineWidth = I.px(1.2); ctx.stroke(f);
  }

  function sym() {
    const ctx = I.cx.sym;
    I.cibles = []; I.traitsCibles = [];
    I.avecRideau(ctx, (sc, second) => {
      const pal = I.palier(), cam = I.cam, leger = I.mobile && cam.mode !== 'plan';
      etiquettes = []; occupes = [];
      ctx.globalAlpha = 1; ctx.setLineDash([]);
      eclairer(ctx);
      if (I.couches.infrastructure && sc.direct && !leger) { orbites(ctx); voies(ctx, pal); }
      if (I.couches.militaire) {
        if (sc.direct && pal >= 1 && !leger) routes(ctx);
        lignes(ctx, sc); axes(ctx, sc);
      }
      sites(ctx, sc, pal);
      if (I.couches.civil) villes(ctx, sc, pal);
      if (I.couches.militaire && !leger) pions(ctx, sc);
      pictos(ctx, sc, pal);
      noms(sc, pal);
      poserEtiquettes(ctx);
    });
  }
  I.dessin.sym = sym;
  I.pionsDe = pionsDe;
  I.oublierPions = () => cachePions.clear();
})();
