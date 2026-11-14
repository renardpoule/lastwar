// Calque animé (repeint à chaque image) : navires, convois, satellites, raids aériens par vagues, salves de la marine,
// explosions et cratères, sphères des laboratoires d'exclusion, distorsion localisée près des bulles.
(() => {
  const I = CARTE._, RAD = I.RAD, G = GLYPHES, COL = I.COL, mixc = I.mixc, alpha = I.alpha;
  const ALT = s => s.geo ? 0.13 : s.etoile ? 0.085 : 0.06;
  let dernier = 0, tPrev = 0, sceneId = null;
  const raids = new Map();
  let explosions = [], crateres = [], missiles = [], glitch = null, prochainGlitch = 2.5;

  const halo = (ctx, txt, x, y, coul, font) => {
    ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.strokeStyle = COL.halo; ctx.lineWidth = 3; ctx.strokeText(txt, x, y); ctx.fillStyle = coul; ctx.fillText(txt, x, y);
  };
  const survole = (type, id) => I.survol && I.survol.type === type && I.survol.obj.id === id;

  // ---------- Flottes ----------
  const COUL_FLOTTE = { surface: '#b9d2ff', 'porte-avions': '#e9c46a', 'sous-marins': '#7fd6c8', recherche: '#e879f9' };
  function flottes(ctx, t, pal) {
    const e = I.ech, s = [0.6, 0.9, 1.15][pal] * e;
    for (const f of I.data.flottes || []) {
      const m = I.routeFlotte(f), d = ((t / (f.periode || 480)) % 1) * m.lg, c = I.posSur(m, d), c2 = I.posSur(m, (d + m.lg * 0.012) % m.lg);
      f._c = c;
      const p = I.P(c), q = I.P(c2);
      if (!p || !q) continue;
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]), type = f.type || 'surface', coul = COUL_FLOTTE[type] || COUL_FLOTTE.surface, sur = survole('flotte', f.id);
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang); ctx.scale(s, s);
      // Sillage
      if (type !== 'sous-marins') { ctx.strokeStyle = 'rgba(200,215,255,.3)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-12, -1.5); ctx.lineTo(-24, -5); ctx.moveTo(-12, 1.5); ctx.lineTo(-24, 5); ctx.stroke(); }
      if (sur) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, 18, 9, 0, 0, 7); ctx.stroke(); }
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(6,5,14,.9)'; ctx.lineWidth = 2.6; ctx.stroke(G.F[type] || G.F.surface);
      ctx.fillStyle = mixc(coul, '#0b0a18', 0.35); ctx.fill(G.F[type] || G.F.surface, 'evenodd');
      ctx.strokeStyle = coul; ctx.lineWidth = 0.9; ctx.stroke(G.F[type] || G.F.surface);
      // Départ de salve : éclair à la proue
      if (f._tir && t - f._tir < 0.25) { ctx.fillStyle = `rgba(255,220,140,${1 - (t - f._tir) / 0.25})`; ctx.beginPath(); ctx.arc(8, 0, 5, 0, 7); ctx.fill(); }
      ctx.restore();
      I.ciblesFx.push({ x: p[0], y: p[1], r: 11 * s, type: 'flotte', obj: f });
      if (pal === 2 || sur) halo(ctx, f.nom, p[0] + 15 * s, p[1], mixc(coul, '#ffffff', 0.4), `500 ${10 * e}px ${I.sans}`);
    }
  }

  // ---------- Convois des traverseurs ----------
  function trains(ctx, t, pal) {
    if (pal === 0) return;
    const e = I.ech, s = (pal === 2 ? 1.1 : 0.85) * e;
    for (const r of I.rails()) {
      const m = r.parcours;
      if (!m) continue;
      let v = (t / (r.periode || 900)) % 1, sens = 1;
      if (r.navette) { v *= 2; if (v > 1) { v = 2 - v; sens = -1; } }
      const d = v * m.lg, p = I.P(I.posSur(m, d)), q = I.P(I.posSur(m, Math.min(m.lg, d + m.lg * 0.004 + 0.05)));
      if (!p || !q) continue;
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) + (sens < 0 ? Math.PI : 0);
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang); ctx.scale(s, s);
      ctx.strokeStyle = 'rgba(6,5,14,.9)'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.stroke(G.F.train);
      ctx.fillStyle = COL.or; ctx.fill(G.F.train);
      ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(11, 0, 1.1, 0, 7); ctx.fill();
      ctx.restore();
      I.ciblesFx.push({ x: p[0], y: p[1], r: 10 * s, type: 'rail', obj: r });
      if (pal === 2 || survole('rail', r.id)) halo(ctx, r.nom, p[0] + 15 * s, p[1], '#f3dea0', `500 ${10 * e}px ${I.sans}`);
    }
  }

  // ---------- Satellites ----------
  function satellites(ctx, t, pal) {
    const e = I.ech, rot = d3.geoRotation(I.cam.rot);
    for (const s of I.data.satellites || []) {
      const c = s.geo ? s.coord : I.posOrbite(s, 2 * Math.PI * (t / (s.periode || 90) + (s.phase || 0)));
      s._c = c;
      const p = I.Palt(c, ALT(s), rot);
      if (!p) continue;
      const coul = s.etoile ? COL.or : COL.science, chantier = /fabrication/i.test(s.etat || ''), sur = survole('satellite', s.id);
      ctx.save(); ctx.globalAlpha = p[2] ? 1 : 0.4; ctx.translate(p[0], p[1]);
      const k = (s.etoile ? 0.95 : 0.72) * e;
      ctx.scale(k, k);
      if (chantier) { ctx.strokeStyle = alpha(coul, 0.8); ctx.lineWidth = 1; ctx.setLineDash([2.5, 2.5]); ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      if (sur) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.stroke(); }
      ctx.rotate(-0.5);
      ctx.strokeStyle = 'rgba(6,5,14,.9)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(G.F.satellite);
      ctx.fillStyle = mixc(coul, '#0b0a18', 0.45); ctx.fill(G.F.satellite);
      ctx.strokeStyle = coul; ctx.lineWidth = 1; ctx.stroke(G.F.satellite);
      ctx.restore();
      I.ciblesFx.push({ x: p[0], y: p[1], r: 12 * k, type: 'satellite', obj: s });
      if (s.etoile || pal >= 1 || sur) halo(ctx, s.nom, p[0] + 14 * k, p[1], mixc(coul, '#ffffff', 0.35), `${s.etoile ? 600 : 500} ${10 * e}px ${I.mono}`);
    }
  }

  // ---------- Laboratoires d'exclusion : sphère de confinement qui tourne et décroche par à-coups ----------
  function labos(ctx, t) {
    for (const L of I.labsEcran) {
      const ph = (I.hash(L.s.id) % 100) / 100 * 6.28, r = L.r, saut = I.reduit() ? false : ((t + ph) % 3.4) < 0.22;
      const dx = saut ? Math.sin(t * 90 + ph) * 2.6 : 0;
      const g = ctx.createRadialGradient(L.x, L.y, r * 0.5, L.x, L.y, r * 1.9);
      g.addColorStop(0, 'rgba(232,121,249,.28)'); g.addColorStop(1, 'rgba(232,121,249,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L.x, L.y, r * 1.9, 0, 7); ctx.fill();
      if (L.urgence) { const u = I.reduit() ? 0.4 : (t * 0.8) % 1; ctx.strokeStyle = `rgba(255,90,95,${0.9 * (1 - u)})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(L.x, L.y, r * (1.15 + u * 0.9), 0, 7); ctx.stroke(); }
      if (saut) for (const [o, c] of [[-2.6, 'rgba(255,60,90,.6)'], [2.6, 'rgba(70,220,255,.6)']]) { ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(L.x + o, L.y, r, 0, 7); ctx.stroke(); }
      ctx.save(); ctx.translate(L.x + dx, L.y);
      ctx.fillStyle = 'rgba(52,18,74,.6)'; ctx.strokeStyle = L.urgence ? '#ffb3c0' : '#f0c4ff'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(240,196,255,.7)';
      const sx = I.reduit() ? 0.45 : Math.cos(t * 0.9 + ph);
      ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.6, r * Math.abs(sx)), r, 0, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.3, 0, 0, 7); ctx.stroke();
      if (r > 9) for (const o of [-0.46, 0.46]) { ctx.beginPath(); ctx.ellipse(0, r * o, r * 0.88, r * 0.26, 0, 0, 7); ctx.stroke(); }
      if (saut) { ctx.fillStyle = 'rgba(240,196,255,.55)'; ctx.fillRect(-r * 1.2, -r * 0.5, r * 2.4, 1.5); ctx.fillRect(-r * 1.1, r * 0.25, r * 2.2, 1); }
      ctx.restore();
    }
  }

  // ---------- Raids aériens par vagues ----------
  const cibles = new Map();
  function anneauCible(sc, f) {
    const cle = sc.id + f.id;
    if (cibles.has(cle)) return cibles.get(cle);
    const zr = f.zone && sc.zones.find(x => x.id === f.zone);
    let ring;
    if (zr && zr.contour) ring = I.tache({ id: f.id, contour: zr.contour, marge: f.margeInt != null ? (+f.marge + +f.margeInt) / 2 : (+f.marge || 0) - 0.8 }).coordinates[0];
    else ring = I.tache({ id: f.graine || f.id, centre: f.centre, rayon: ((+f.rayon || 2) + (+f.rayonInt || 0)) / 2 }).coordinates[0];
    const o = { ring, c: [d3.mean(ring, p => p[0]), d3.mean(ring, p => p[1])] };
    cibles.set(cle, o);
    return o;
  }
  // Bases de départ : groupes aéronavals en mer, villes encore debout à terre
  function bases(sc) {
    const out = [];
    if (sc.direct) for (const f of I.data.flottes || []) if (f.type === 'porte-avions' && f._c) out.push(f._c);
    for (const v of sc.villes) if (v.etat >= 50) out.push(v.coord);
    return out;
  }
  function lancerVague(sc, f, t, pal) {
    const { ring, c } = anneauCible(sc, f), n = ring.length - 1, i = Math.floor(Math.random() * n), j = (i + Math.floor(n / 2 + (Math.random() - 0.5) * n * 0.4)) % n;
    const A = ring[i], B = ring[j];
    let base = null, dmin = 60 * RAD;
    for (const b of bases(sc)) { const dd = d3.geoDistance(b, A); if (dd < dmin && dd > 3 * RAD) { dmin = dd; base = b; } }
    let depart;
    if (base) depart = dmin / RAD > 15 ? d3.geoInterpolate(A, base)(15 / (dmin / RAD)) : base;
    else { const dx = A[0] - c[0], dy = A[1] - c[1], l = Math.hypot(dx, dy) || 1; depart = [A[0] + dx / l * 13, Math.max(-80, Math.min(80, A[1] + dy / l * 13))]; }
    const retour = [depart[0] + (B[0] - A[0]) * 0.3, depart[1] + (B[1] - A[1]) * 0.3];
    const m = I.mesurer(I.spline([depart, A, B, retour], 14, false)), lourd = f.type !== 'napalm', esc = f.escadrilles;
    const nb = pal === 0 ? (lourd ? 3 : 2) : lourd ? (esc ? Math.min(7, +esc.parFormation || 5) : 3) : 4, app = [];
    for (let k = 0; k < nb; k++) { const rang = k - (nb - 1) / 2; app.push({ rang, file: Math.abs(rang), modele: lourd ? 'bombardier' : 'chasseur', prochain: 0 }); }
    if (esc && pal > 0) for (const sg of [-1, 1]) app.push({ rang: sg * (nb / 2 + 0.9), file: -1.2, modele: 'chasseur', prochain: Infinity });
    return { f, m, dA: m.cum[14], dB: m.cum[28], vit: lourd ? 3.4 : 5.6, t0: t, app, lourd };
  }
  function raidsMaj(ctx, sc, t, pal) {
    const e = I.ech, g = [0.6, 0.95, 1.3][pal] * e;
    // Nouvelles vagues
    for (const f of sc.frappes) {
      let R = raids.get(f.id);
      if (!R) raids.set(f.id, R = { vagues: [], prochain: t + Math.random() * 1.5 });
      R.vagues = R.vagues.filter(v => (t - v.t0) * v.vit < v.m.lg);
      const max = pal === 0 ? 1 : f.escadrilles ? Math.min(4, +f.escadrilles.formations || 3) : 2;
      if (t >= R.prochain && R.vagues.length < max) { R.vagues.push(lancerVague(sc, f, t, pal)); R.prochain = t + (pal === 0 ? 4 + Math.random() * 4 : f.escadrilles ? 1.6 + Math.random() * 1.6 : 3 + Math.random() * 3); }
    }
    for (const id of raids.keys()) if (!sc.frappes.some(f => f.id === id)) raids.delete(id);
    // Salves de la marine : missiles tirés par les navires sur le bombardement qu'ils visent
    if (sc.direct) {
      const actives = new Map(sc.frappes.map(z => [z.id, z])), dt = Math.min(0.2, t - tPrev);
      for (const f of I.data.flottes || []) {
        const z = f.tir && actives.get(f.tir);
        if (!z || !f._c || Math.random() > (pal === 0 ? 0.1 : 0.32) * dt) continue;
        const { ring, c } = anneauCible(sc, z);
        // Cible : le plus proche de quelques points tirés au hasard, pour que le navire frappe la côte qui lui fait face
        let best = null, dmin = Infinity;
        for (let i = 0; i < 6; i++) { const r = ring[Math.floor(Math.random() * (ring.length - 1))], u = Math.random() * 0.55, q = [r[0] + (c[0] - r[0]) * u, r[1] + (c[1] - r[1]) * u], dd = d3.geoDistance(q, f._c); if (dd < dmin) { dmin = dd; best = q; } }
        if (best && dmin / RAD < 70) { missiles.push({ a: f._c.slice(), c: best, t0: t, dur: Math.max(0.9, Math.min(2.8, dmin / RAD / 11)) }); f._tir = t; }
      }
    }
    // Cratères : traces sombres qui restent quelques secondes
    crateres = crateres.filter(x => t - x.t0 < 6);
    for (const x of crateres) {
      const p = I.P(x.c); if (!p) continue;
      const u = (t - x.t0) / 6;
      ctx.fillStyle = `rgba(8,6,10,${0.55 * (1 - u)})`; ctx.beginPath(); ctx.arc(p[0], p[1], 2.6 * g, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,150,60,${0.8 * (1 - u) * (1 - u)})`; ctx.beginPath(); ctx.arc(p[0], p[1], 1.1 * g, 0, 7); ctx.fill();
    }
    // Missiles de croisière : arc lumineux, tête brillante
    missiles = missiles.filter(x => {
      const u = (t - x.t0) / x.dur;
      if (u >= 1) { explosions.push({ c: x.c, t0: t, type: 'missiles', k: 1.35 }); return false; }
      const a = I.P(x.a), b = I.P(x.c);
      if (!a || !b) return true;
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - l * 0.22;
      const B = v => [(1 - v) * (1 - v) * a[0] + 2 * (1 - v) * v * mx + v * v * b[0], (1 - v) * (1 - v) * a[1] + 2 * (1 - v) * v * my + v * v * b[1]];
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) { const v0 = Math.max(0, u - 0.32 + i * 0.04), v1 = Math.max(0, u - 0.28 + i * 0.04), p0 = B(v0), p1 = B(v1); ctx.strokeStyle = `rgba(255,214,130,${(i + 1) / 9 * 0.8})`; ctx.lineWidth = (0.6 + i * 0.12) * g; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
      const h = B(u); ctx.fillStyle = '#fff3d0'; ctx.beginPath(); ctx.arc(h[0], h[1], 1.5 * g, 0, 7); ctx.fill();
      return true;
    }).slice(-60);
    // Explosions
    explosions = explosions.filter(x => {
      const vie = x.type === 'napalm' ? 1.5 : 1.1, u = (t - x.t0) / vie;
      if (u >= 1) { crateres.push({ c: x.c, t0: t }); return false; }
      const p = I.P(x.c); if (!p) return true;
      const k = g * (x.k || 1);
      if (x.type === 'napalm') {
        const q = x.c2 && I.P(x.c2), ang = q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : 0;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang);
        ctx.fillStyle = `rgba(240,110,30,${0.55 * (1 - u)})`; ctx.beginPath(); ctx.ellipse(0, 0, (7 + 9 * u) * k, (2.6 + 2.4 * u) * k, 0, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(255,214,100,${0.95 * (1 - u) * (1 - u)})`; ctx.beginPath(); ctx.ellipse(0, 0, (5 + 4 * u) * k, 1.6 * k, 0, 0, 7); ctx.fill();
        ctx.restore();
      } else {
        const v = Math.sin(Math.min(1, u * 1.7) * Math.PI);
        ctx.fillStyle = `rgba(60,52,60,${0.35 * (1 - u)})`; ctx.beginPath(); ctx.arc(p[0], p[1] - 2 * u * k, (3 + 6 * u) * k, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,170,110,${0.8 * (1 - u)})`; ctx.lineWidth = 1.1 * k; ctx.beginPath(); ctx.arc(p[0], p[1], (3 + 12 * u) * k, 0, 7); ctx.stroke();
        ctx.fillStyle = `rgba(240,122,46,${1 - u})`; ctx.beginPath(); ctx.arc(p[0], p[1], (2.6 + 3.4 * v) * k, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(255,244,210,${(1 - u) * (1 - u)})`; ctx.beginPath(); ctx.arc(p[0], p[1], (1.2 + 1.8 * v) * k, 0, 7); ctx.fill();
      }
      return true;
    }).slice(-220);
    crateres = crateres.slice(-160);
    // Appareils en formation, avec ombre portée et traînées
    const s = [0.62, 0.95, 1.25][pal] * e;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const R of raids.values()) for (const v of R.vagues) {
      const d = (t - v.t0) * v.vit, p = I.P(I.posSur(v.m, d)), q = I.P(I.posSur(v.m, d + 0.35));
      if (!p || !q) continue;
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]), ux = Math.cos(ang), uy = Math.sin(ang), esp = 12.5 * s, fondu = Math.max(0, Math.min(1, d / 2.5, (v.m.lg - d) / 2.5));
      ctx.globalAlpha = fondu;
      for (const a of v.app) {
        const x = p[0] - uy * a.rang * esp - ux * a.file * esp * 0.75, y = p[1] + ux * a.rang * esp - uy * a.file * esp * 0.75;
        // Largage au-dessus de la cible
        if (d > v.dA && d < v.dB && t >= a.prochain) {
          a.prochain = t + (v.lourd ? 0.16 + Math.random() * 0.22 : 0.3 + Math.random() * 0.3);
          const sol = I.inv([x - ux * 5 * s + (Math.random() - 0.5) * 5 * s, y - uy * 5 * s + (Math.random() - 0.5) * 5 * s]);
          if (sol && !isNaN(sol[0])) explosions.push({ c: sol, c2: I.inv([x + ux * 20, y + uy * 20]), t0: t, type: v.lourd ? 'missiles' : 'napalm' });
        }
        const chasseur = a.modele === 'chasseur', forme = G.F[a.modele];
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s * (chasseur ? 0.9 : 1.15), s * (chasseur ? 0.9 : 1.15));
        ctx.strokeStyle = chasseur ? 'rgba(235,240,250,.5)' : 'rgba(225,232,245,.28)'; ctx.lineWidth = chasseur ? 1.2 : 1;
        ctx.beginPath(); if (chasseur) { ctx.moveTo(-6, 0); ctx.lineTo(-30, 0); } else { ctx.moveTo(-7, -4.5); ctx.lineTo(-24, -4.5); ctx.moveTo(-7, 4.5); ctx.lineTo(-24, 4.5); } ctx.stroke();
        ctx.translate(3, 4); ctx.fillStyle = 'rgba(6,5,14,.45)'; ctx.fill(forme); ctx.translate(-3, -4);
        ctx.fillStyle = chasseur ? '#dcecf8' : '#a3afc2'; ctx.fill(forme);
        ctx.strokeStyle = '#1d1a29'; ctx.lineWidth = 0.6; ctx.stroke(forme);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Offensives : chevrons qui remontent la flèche ; événements critiques : onde ----------
  function marques(ctx, t) {
    if (I.reduit()) return;
    for (const A of I.axesEcran) for (let i = 0; i < 3; i++) {
      const d = ((t * 0.28 + i / 3) % 1) * A.corps;
      if (d < 4) continue;
      const p = I.pointA(A.L, d), w = (2 + 4 * d / A.corps) * I.ech;
      ctx.strokeStyle = `rgba(255,255,255,${0.75 * Math.sin(Math.PI * d / A.corps)})`; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - p.ux * w * 0.8 + p.uy * w, p.y - p.uy * w * 0.8 - p.ux * w); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x - p.ux * w * 0.8 - p.uy * w, p.y - p.uy * w * 0.8 + p.ux * w); ctx.stroke();
    }
    for (const p of I.pings) { const u = (t * 0.55) % 1; ctx.strokeStyle = alpha(mixc(p.coul, '#ffffff', 0.35), 0.85 * (1 - u)); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 + u * 1.5), 0, 7); ctx.stroke(); }
  }

  // ---------- Distorsion localisée : des tranches de la carte décrochent près des bulles et des laboratoires ----------
  function distorsion(ctx, sc, t) {
    const { W, H, dpr } = I.dim();
    if (!glitch && t > prochainGlitch) {
      prochainGlitch = t + (0.5 + (1 - sc.distorsion) * 6.5) * (0.5 + Math.random());
      const foyers = [];
      for (const z of sc.zones) { const c = I.centreZone(z), p = I.P(c), p2 = I.P([c[0], c[1] + (c[1] > 0 ? -1 : 1) * I.rayonZone(z)]); if (p && p2 && p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < H) foyers.push({ x: p[0], y: p[1], r: Math.max(40, Math.min(240, Math.hypot(p[0] - p2[0], p[1] - p2[1]) * 1.15)), poids: 3 }); }
      for (const L of I.labsEcran) if (L.x > 0 && L.x < W && L.y > 0 && L.y < H) foyers.push({ x: L.x, y: L.y, r: Math.max(34, L.r * 3), poids: 1 });
      if (foyers.length && sc.distorsion > 0) {
        let tirage = Math.random() * d3.sum(foyers, f => f.poids), f = foyers[0];
        for (const o of foyers) { tirage -= o.poids; if (tirage <= 0) { f = o; break; } }
        const n = 2 + Math.floor(Math.random() * (2 + 4 * sc.distorsion));
        glitch = { ...f, t0: t, dur: 0.08 + Math.random() * 0.17, tranches: d3.range(n).map(() => ({ dy: (Math.random() * 2 - 1) * f.r, h: 3 + Math.random() * 14 * (0.4 + sc.distorsion), dx: (Math.random() * 2 - 1) * (6 + 22 * sc.distorsion), rouge: Math.random() < 0.5 })) };
      }
    }
    if (!glitch) return;
    if (t - glitch.t0 > glitch.dur) { glitch = null; return; }
    const x0 = Math.max(0, glitch.x - glitch.r), w = Math.min(W - x0, glitch.r * 2);
    for (const tr of glitch.tranches) {
      const y = Math.round(glitch.y + tr.dy), h = Math.round(tr.h);
      if (y < 0 || y + h > H || w < 4) continue;
      for (const n of ['base', 'vie', 'sym']) ctx.drawImage(I.cv[n], x0 * dpr, y * dpr, w * dpr, h * dpr, x0 + tr.dx, y, w, h);
      ctx.fillStyle = tr.rouge ? 'rgba(255,60,90,.14)' : 'rgba(80,220,255,.12)'; ctx.fillRect(x0 + tr.dx, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x0 + tr.dx, y, w, 1);
    }
  }

  function fx(ts) {
    if (!I.mobile && ts - dernier < 24) return;
    dernier = ts;
    const ctx = I.cx.fx, { W, H, dpr } = I.dim(), t = I.temps(), sc = I.sceneA, pal = I.palier();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W * dpr, H * dpr);
    I.ecran(ctx); ctx.globalAlpha = 1; ctx.setLineDash([]);
    I.ciblesFx = [];
    if (sc.id !== sceneId) { sceneId = sc.id; raids.clear(); explosions = []; crateres = []; missiles = []; cibles.clear(); }
    if (I.cam.mode === 'morph') { tPrev = t; return; }
    ctx.save();
    if (I.rideau) { ctx.beginPath(); ctx.rect(0, 0, I.rideau.x, H); ctx.clip(); }
    const anime = !I.reduit();
    if (I.couches.anormal && anime) distorsion(ctx, sc, t);
    if (I.couches.anormal) labos(ctx, t);
    if (I.couches.militaire && anime) raidsMaj(ctx, sc, t, pal);
    if (sc.direct) {
      if (I.couches.infrastructure) trains(ctx, t, pal);
      if (I.couches.militaire) flottes(ctx, t, pal);
      if (I.couches.infrastructure) satellites(ctx, t, pal);
    }
    if (I.couches.militaire) marques(ctx, t);
    if (I.signal) {
      const u = (t - I.signal.t0) / 2.4, p = I.P(I.signal.c);
      if (u >= 1) I.signal = null;
      else if (p) for (const o of [0, 0.33]) { const v = (u * 2 + o) % 1; ctx.strokeStyle = `rgba(196,181,253,${0.95 * (1 - v) * (1 - u)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 8 + v * 46, 0, 7); ctx.stroke(); }
    }
    ctx.restore();
    tPrev = t;
  }
  I.dessin.fx = fx;
})();
