// Modes de la carte : film de la chronologie, briefing de la semaine, bascule de palier, rideau de comparaison,
// courbes de la guerre, recherche, calques et légende. S'appuie sur APP (app.js) et CARTE (moteur.js).
APP.pret.then(() => {
  const { $, esc, data, etat, ICO, nH } = APP;
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)');
  const dateCourte = t => (t || '').replace(/\s*\d{4}$/, '');
  const coupe = (t, n) => t && t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : (t || '');
  const RANG = { mineur: 0, majeur: 1, critique: 2 };
  const P = data.tension.paliers;

  // ---------- Carton (film et briefing) ----------
  const carton = $('#carton');
  function montrerCarton({ sur, titre, texte, liste, boutons, cls }) {
    carton.className = 'carton verre ' + (cls || '');
    carton.innerHTML = `<p class="cartouche">${sur || ''}</p><h2>${esc(titre || '')}</h2>${texte ? `<p class="texte">${texte}</p>` : ''}
      ${liste && liste.length ? `<ul>${liste.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      <div class="c-boutons">${(boutons || []).map(b => `<button type="button" data-c="${b[0]}" ${b[2] ? 'class="principal"' : ''} ${b[3] ? 'disabled' : ''}>${b[1]}</button>`).join('')}</div>`;
    carton.hidden = false;
  }
  const cacherCarton = () => { carton.hidden = true; };
  carton.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b && actionsCarton[b.dataset.c]) actionsCarton[b.dataset.c](); });
  const actionsCarton = {};

  // ---------- Film : la chronologie rejouée, la caméra vole d'un événement à l'autre ----------
  let film = null;
  const play = $('#play');
  const majPlay = () => { play.innerHTML = (film ? ICO.stop : ICO.film) + `<span>${film ? 'Arrêter' : 'Film'}</span>`; play.setAttribute('aria-label', film ? 'Arrêter le film' : 'Rejouer le conflit en film'); };
  const pause = ms => new Promise(r => { if (!film) return r(); film.minuterie = setTimeout(r, ms / film.vitesse); film.reprendre = r; });
  const vol = (c, k, ms) => new Promise(r => { let fait = false; const fin = () => { if (!fait) { fait = true; r(); } }; CARTE.volerVers(c, k, ms / (film ? film.vitesse : 1), fin); setTimeout(fin, ms / (film ? film.vitesse : 1) + 250); });
  // Fondu entre deux semaines : les bulles gonflent, les statuts glissent
  const transition = (i, j, ms) => new Promise(r => {
    if (reduit.matches) return r();
    const t0 = performance.now(), d = ms / (film ? film.vitesse : 1);
    (function pas(ts) {
      const u = Math.min(1, (ts - t0) / d);
      if (!film || film.stop || u >= 1) return r();
      CARTE.definirScene(i, j, d3.easeCubicInOut(u));
      requestAnimationFrame(pas);
    })(t0);
  });
  function arreterFilm() {
    if (!film) return;
    clearTimeout(film.minuterie); film.stop = true; film.reprendre && film.reprendre();
    film = null; majPlay(); cacherCarton(); document.body.classList.remove('en-film');
    CARTE.definirScene(etat.replay);
  }
  APP.arreterFilm = arreterFilm;
  async function jouerFilm() {
    if (film) return arreterFilm();
    fermerBrief();
    const moi = film = { stop: false, vitesse: 1 };
    majPlay(); document.body.classList.add('en-film');
    if (etat.niveau !== 'monde') { APP.naviguer(); await new Promise(r => setTimeout(r, 1300)); }
    const boutons = () => [['vitesse', moi.vitesse === 1 ? 'Vitesse ×2' : 'Vitesse ×1'], ['stop', 'Arrêter', true]];
    actionsCarton.stop = arreterFilm;
    actionsCarton.vitesse = () => { moi.vitesse = moi.vitesse === 1 ? 2 : 1; const b = carton.querySelector('[data-c="vitesse"]'); if (b) b.textContent = moi.vitesse === 1 ? 'Vitesse ×2' : 'Vitesse ×1'; };
    for (let i = 0; i < nH && !moi.stop; i++) {
      if (i > 0) await transition(i - 1, i, 950);
      if (moi.stop) break;
      APP.allerA(i);
      const s = CARTE.scene(i), pal = C.palier(s.tension, P);
      montrerCarton({ cls: 'film date', sur: `Semaine ${i + 1} sur ${nH} · tension ${Math.round(s.tension)} · ${esc(P[pal].nom)}`, titre: s.date, boutons: boutons() });
      await pause(1300);
      const evs = s.evtsTour.filter(e => e.lieux && e.lieux.length).sort((a, b) => RANG[b.gravite] - RANG[a.gravite]).slice(0, 2);
      for (const ev of evs) {
        if (moi.stop) break;
        await vol(ev.lieux[0], 3.6, 1250);
        if (moi.stop) break;
        montrerCarton({ cls: 'film ' + ev.gravite, sur: `${esc(dateCourte(ev.date))} · ${esc(C.GRAVITES[ev.gravite])} · ${esc(APP.nomPortee(ev.portee))}`, titre: ev.titre, texte: esc(coupe(ev.description, 210)), boutons: boutons() });
        await pause(2900);
      }
      if (moi.stop) break;
      if (CARTE.mode() === 'plan') { CARTE.cadrer(true); await pause(900); }
    }
    if (!moi.stop) { APP.allerA(null); montrerCarton({ cls: 'film date', sur: 'Fin de la relecture', titre: 'En direct · ' + data.meta.dateRP, boutons: [['stop', 'Fermer', true]] }); await pause(2200); }
    if (film === moi) arreterFilm();
  }
  play.addEventListener('click', jouerFilm);
  majPlay();
  APP.surGeste = () => { if (film) arreterFilm(); };

  // ---------- Passage de palier : l'écran bascule un instant ----------
  const flash = $('#flash');
  APP.basculePalier = (i, monte) => {
    if (reduit.matches) return;
    flash.className = 'flash ' + (monte ? 'monte' : 'descend') + ' p' + i;
    flash.innerHTML = `<div class="f-bande"><span>${monte ? 'Franchissement de palier' : 'Retour au palier'}</span><strong>Palier ${i + 1} · ${esc(P[i].nom)}</strong></div>`;
    flash.hidden = false; void flash.offsetWidth; flash.classList.add('joue');
    clearTimeout(flash._t); flash._t = setTimeout(() => { flash.hidden = true; }, 1900);
  };

  // ---------- Briefing : la semaine racontée en quelques étapes ----------
  let brief = null;
  function fermerBrief() { if (!brief) return; brief = null; cacherCarton(); document.body.classList.remove('en-brief'); }
  function etapeBrief(i) {
    if (!brief) return;
    brief.i = Math.max(0, Math.min(brief.etapes.length - 1, i));
    const e = brief.etapes[brief.i], n = brief.etapes.length, s = APP.sc();
    const boutons = [['prec', 'Précédent', false, brief.i === 0], brief.i === n - 1 ? ['fermer', 'Terminer', true] : ['suiv', 'Suivant', true], ['fermer', 'Fermer']].filter((b, k, l) => !(k === 2 && l[1][0] === 'fermer'));
    APP.cacherTip();
    if (e.type === 'ouverture') {
      if (CARTE.mode() === 'plan') CARTE.cadrer(true);
      const p = s.pertes, pal = C.palier(s.tension, P), inf = Math.round(APP.influenceMonde(etat.replay));
      montrerCarton({ cls: 'brief', sur: `Briefing · semaine du ${esc(s.date)}`, titre: 'Situation générale',
        texte: `La tension mondiale s'établit à <strong>${Math.round(s.tension)}</strong> sur 100, au palier ${pal + 1}, ${esc(P[pal].nom)}, pendant que l'influence cultiste couvre ${inf} % de la population du globe${p ? `, et que les pertes cumulées atteignent ${C.court(p.confederation.tues)} confédérés, ${C.court(p.cultistes.tues)} cultistes et ${C.court(p.civils.deces)} civils` : ''}. ${brief.etapes.length - 2} événement${brief.etapes.length - 2 > 1 ? 's' : ''} à retenir cette semaine.`, boutons });
    } else if (e.type === 'cloture') {
      if (CARTE.mode() === 'plan') CARTE.cadrer(true);
      montrerCarton({ cls: 'brief', sur: 'Fin du briefing', titre: 'Le reste est au journal', texte: `Les ${s.evtsTour.length} événements de la semaine sont consignés, dans l'ordre, à l'onglet Journal du rapport.`, boutons });
    } else {
      const ev = e.ev;
      if (ev.lieux && ev.lieux.length) CARTE.volerVers(ev.lieux[0], 4.2, 1300);
      else { const d = ev.portee.type === 'district' && APP.parId[ev.portee.id], sec = ev.portee.type === 'secteur' && APP.secteurParId[ev.portee.id], a = (d && CARTE._.ancre(d)) || (sec && sec._geoS && CARTE._.ancre(sec)); if (a) CARTE.volerVers(a, 2.8, 1300); }
      montrerCarton({ cls: 'brief ' + ev.gravite, sur: `${brief.i} sur ${n - 2} · ${esc(C.GRAVITES[ev.gravite])} · ${esc(APP.nomPortee(ev.portee))} · ${esc(dateCourte(ev.date))}`, titre: ev.titre, texte: esc(ev.description), liste: ev.consequences, boutons });
    }
  }
  APP.briefing = () => {
    arreterFilm();
    const s = APP.sc(), evs = s.evtsTour.map((ev, k) => ({ ev, k })).sort((a, b) => RANG[b.ev.gravite] - RANG[a.ev.gravite] || a.k - b.k).slice(0, 6).sort((a, b) => a.k - b.k).map(o => ({ ev: o.ev }));
    brief = { etapes: [{ type: 'ouverture' }, ...evs, { type: 'cloture' }], i: 0 };
    document.body.classList.add('en-brief');
    if (etat.niveau !== 'monde') APP.naviguer();
    if (APP.tel()) APP.definirVolet('replie');
    etapeBrief(0);
  };
  actionsCarton.prec = () => etapeBrief(brief.i - 1);
  actionsCarton.suiv = () => etapeBrief(brief.i + 1);
  actionsCarton.fermer = () => { const b = brief; fermerBrief(); arreterFilm(); if (b && CARTE.mode() === 'plan') CARTE.cadrer(true); };
  $('#oBrief').addEventListener('click', () => brief ? actionsCarton.fermer() : APP.briefing());
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select, dialog')) return;
    if (brief && e.key === 'ArrowRight') { e.preventDefault(); etapeBrief(brief.i + 1); }
    else if (brief && e.key === 'ArrowLeft') { e.preventDefault(); etapeBrief(brief.i - 1); }
    else if (e.key === 'Escape') { if (brief) actionsCarton.fermer(); else if (film) arreterFilm(); else if (!$('#tiroir').hidden) basculerTiroir(false); }
    else if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); ouvrirRecherche(); }
  });

  // ---------- Rideau de comparaison : à droite, la carte à une autre date ----------
  let comp = null;
  const rideau = $('#rideau');
  const autreDate = () => { if (etat.replay === null) return data.historique[nH - 1].date === data.meta.dateRP ? Math.max(0, nH - 2) : nH - 1; return etat.replay > 0 ? etat.replay - 1 : Math.min(nH - 1, 1); };
  function majRideau() {
    if (!comp) return;
    const W = innerWidth, x = Math.round(W * comp.x);
    CARTE.definirRideau(x, comp.i);
    rideau.style.setProperty('--x', x + 'px');
    $('#rideauG').textContent = APP.sc().date;
    $('#rideauD').innerHTML = `<label class="sr" for="rideauDate">Date comparée</label><select id="rideauDate">${data.historique.map((h, i) => `<option value="${i}" ${i === comp.i ? 'selected' : ''}>${esc(h.date)}</option>`).join('')}</select>`;
    $('#rideauDate').onchange = ev => { comp.i = +ev.target.value; majRideau(); };
  }
  function basculerComparer() {
    if (comp) { comp = null; CARTE.definirRideau(null); rideau.hidden = true; }
    else { arreterFilm(); comp = { i: autreDate(), x: 0.5 }; rideau.hidden = false; majRideau(); }
    $('#oComparer').setAttribute('aria-pressed', !!comp);
  }
  $('#oComparer').addEventListener('click', basculerComparer);
  (() => {
    const p = $('#rideauPoignee'); let actif = false;
    p.addEventListener('pointerdown', e => { actif = true; p.setPointerCapture(e.pointerId); });
    p.addEventListener('pointermove', e => { if (actif && comp) { comp.x = Math.max(0.08, Math.min(0.92, e.clientX / innerWidth)); majRideau(); } });
    p.addEventListener('pointerup', () => { actif = false; });
    p.addEventListener('keydown', e => { if (!comp) return; if (e.key === 'ArrowLeft') comp.x = Math.max(0.08, comp.x - 0.03); else if (e.key === 'ArrowRight') comp.x = Math.min(0.92, comp.x + 0.03); else return; e.preventDefault(); majRideau(); });
  })();
  window.addEventListener('resize', () => setTimeout(majRideau, 200));

  // ---------- Courbes de la guerre ----------
  const COUL = { tension: '#9478f0', influence: '#c864d8', cult: '#dc4c53', cc: '#4a8be0', civ: '#b08a28', dispo: '#2fa874', conso: '#9478f0' };
  const pts = (() => {
    const out = data.historique.map((h, i) => ({ i, date: h.date, h }));
    if (!nH || data.historique[nH - 1].date !== data.meta.dateRP) out.push({ i: nH, date: data.meta.dateRP, h: null });
    return out;
  })();
  const scDe = p => CARTE.scene(p.h ? p.i : null);
  const M = v => v == null ? null : v / 1e6;
  const fr = (v, d = 0) => v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });
  const SERIES = [
    { id: 'tension', titre: 'Tension mondiale', unite: 'sur 100', dom: [0, 100], dec: 0, series: [{ nom: 'Tension', c: COUL.tension, v: p => scDe(p).tension }] },
    { id: 'influence', titre: 'Influence cultiste', unite: '% de la population', dec: 1, series: [{ nom: 'Influence', c: COUL.influence, v: p => APP.influenceMonde(p.h ? p.i : null) }] },
    { id: 'pertes', titre: 'Tués cumulés', unite: 'millions', dec: 1, series: [
      { nom: 'Cultistes', c: COUL.cult, v: p => { const x = scDe(p).pertes; return x ? M(x.cultistes.tues) : null; } },
      { nom: 'Confédérés', c: COUL.cc, v: p => { const x = scDe(p).pertes; return x ? M(x.confederation.tues) : null; } },
      { nom: 'Civils', c: COUL.civ, v: p => { const x = scDe(p).pertes; return x ? M(x.civils.deces) : null; } }] },
    { id: 'energie', titre: 'Énergie', unite: 'TW', dec: 1, series: [
      { nom: 'Disponible', c: COUL.dispo, v: p => { const e = scDe(p).energie; return e ? Math.round(((+e.production || 0) - (+e.detruite || 0) - (+e.detournee || 0)) * 10) / 10 : null; } },
      { nom: 'Consommée', c: COUL.conso, v: p => { const e = scDe(p).energie; return e ? +e.consommation : null; } }] }
  ];
  const courbes = $('#courbes');
  const idxCourant = () => { const r = etat.replay === null ? (pts[pts.length - 1].h ? nH - 1 : nH) : etat.replay; return Math.max(0, pts.findIndex(p => p.i === r)); };
  function graphe(S) {
    const W = 300, H = 132, m = { g: 30, d: S.series.length > 1 ? 62 : 14, h: 8, b: 20 }, n = pts.length;
    const vals = S.series.map(s => pts.map(s.v)), tous = vals.flat().filter(v => v != null);
    if (!tous.length) return '';
    let [lo, hi] = S.dom || d3.extent(tous);
    if (!S.dom) { if (S.id === 'energie') { const e = Math.max(1, (hi - lo) * 0.25); lo = Math.floor(lo - e); hi = Math.ceil(hi + e); } else { lo = 0; hi = hi * 1.08 || 1; } }
    const x = i => m.g + (n > 1 ? i / (n - 1) : 0.5) * (W - m.g - m.d), y = v => H - m.b - (v - lo) / ((hi - lo) || 1) * (H - m.h - m.b);
    const ligne = d3.line().defined(d => d[1] != null).x(d => x(d[0])).y(d => y(d[1]));
    // Étiquettes de fin de courbe, écartées pour ne pas se chevaucher
    const fins = S.series.map((s, k) => { const j = d3.range(n).reverse().find(q => vals[k][q] != null); return { s, k, j, y: y(vals[k][j]) }; }).sort((a, b) => a.y - b.y);
    for (let k = 1; k < fins.length; k++) if (fins[k].y - fins[k - 1].y < 11) fins[k].y = fins[k - 1].y + 11;
    return `<figure class="graphe" data-id="${S.id}" tabindex="0" role="group" aria-label="${esc(S.titre)}, ${esc(S.unite)}. Flèches pour parcourir les dates, Entrée pour y aller.">
      <figcaption><span class="g-titre">${esc(S.titre)}</span><span class="g-unite">${esc(S.unite)}</span><span class="g-val" data-val></span></figcaption>
      ${S.series.length > 1 ? `<div class="g-legende">${S.series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.nom)}</span>`).join('')}</div>` : ''}
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(S.titre)}">
        ${[lo, (lo + hi) / 2, hi].map(v => `<line class="g-grille" x1="${m.g}" x2="${W - m.d}" y1="${y(v)}" y2="${y(v)}"/><text class="g-axe" x="${m.g - 5}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${fr(v, hi - lo < 10 ? 1 : 0)}</text>`).join('')}
        <text class="g-axe" x="${m.g}" y="${H - 5}">${esc(dateCourte(pts[0].date))}</text><text class="g-axe" x="${W - m.d}" y="${H - 5}" text-anchor="end">${esc(dateCourte(pts[n - 1].date))}</text>
        <line class="g-date" data-date x1="0" x2="0" y1="${m.h}" y2="${H - m.b}"/>
        ${S.series.map((s, k) => `<path class="g-ligne" d="${ligne(vals[k].map((v, i) => [i, v]))}" style="stroke:${s.c}"/>`).join('')}
        ${fins.map(f => `<circle class="g-fin" cx="${x(f.j)}" cy="${y(vals[f.k][f.j])}" r="4" style="fill:${f.s.c}"/>${S.series.length > 1 ? `<text class="g-nom" x="${W - m.d + 8}" y="${f.y}" dominant-baseline="middle">${esc(f.s.nom)}</text>` : ''}`).join('')}
        <g class="g-viseur" data-viseur hidden><line y1="${m.h}" y2="${H - m.b}"/>${S.series.map((s, k) => `<circle r="4" data-pt="${k}" style="fill:${s.c}"/>`).join('')}</g>
        <rect class="g-zone" x="${m.g - 8}" y="0" width="${W - m.g - m.d + 16}" height="${H}"/>
      </svg><div class="g-bulle" data-bulle hidden></div></figure>`;
  }
  function rendreCourbes() {
    const tableau = `<details class="g-table"><summary>Tableau des valeurs</summary><div class="tableau"><table><thead><tr><th scope="col">Date</th>${SERIES.flatMap(S => S.series.map(s => `<th scope="col" class="num">${esc(S.series.length > 1 ? s.nom : S.titre)}</th>`)).join('')}</tr></thead>
      <tbody>${pts.map(p => `<tr><th scope="row">${esc(p.date)}</th>${SERIES.flatMap(S => S.series.map(s => `<td class="num">${fr(s.v(p), S.dec)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div></details>`;
    courbes.innerHTML = `<div class="g-tete"><p class="cartouche">Courbes de la guerre · ${esc(dateCourte(pts[0].date))} → ${esc(dateCourte(pts[pts.length - 1].date))}</p><span class="pale">Cliquer sur une courbe pour aller à cette date</span></div><div class="g-rang">${SERIES.map(graphe).join('')}</div>${tableau}`;
    for (const fig of courbes.querySelectorAll('.graphe')) brancherGraphe(fig, SERIES.find(S => S.id === fig.dataset.id));
    majCourbes();
  }
  function brancherGraphe(fig, S) {
    const svg = fig.querySelector('svg'), W = 300, m = { g: 30, d: S.series.length > 1 ? 62 : 14 }, n = pts.length, viseur = fig.querySelector('[data-viseur]'), bulle = fig.querySelector('[data-bulle]');
    const vals = S.series.map(s => pts.map(s.v)), tous = vals.flat().filter(v => v != null);
    let [lo, hi] = S.dom || d3.extent(tous);
    if (!S.dom) { if (S.id === 'energie') { const e = Math.max(1, (hi - lo) * 0.25); lo = Math.floor(lo - e); hi = Math.ceil(hi + e); } else { lo = 0; hi = hi * 1.08 || 1; } }
    const H = 132, mh = 8, mb = 20, x = i => m.g + (n > 1 ? i / (n - 1) : 0.5) * (W - m.g - m.d), y = v => H - mb - (v - lo) / ((hi - lo) || 1) * (H - mh - mb);
    let j = null;
    const viser = k => {
      j = k;
      viseur.removeAttribute('hidden'); viseur.querySelector('line').setAttribute('x1', x(k)); viseur.querySelector('line').setAttribute('x2', x(k));
      S.series.forEach((s, q) => { const c = viseur.querySelector(`[data-pt="${q}"]`), v = vals[q][k]; c.style.display = v == null ? 'none' : ''; if (v != null) { c.setAttribute('cx', x(k)); c.setAttribute('cy', y(v)); } });
      bulle.hidden = false; bulle.textContent = '';
      const t = document.createElement('strong'); t.textContent = pts[k].date; bulle.appendChild(t);
      S.series.forEach((s, q) => { const l = document.createElement('span'); l.className = 'g-l'; const cle = document.createElement('i'); cle.style.background = s.c; const v = document.createElement('b'); v.textContent = fr(vals[q][k], S.dec); const nom = document.createElement('em'); nom.textContent = s.nom; l.append(cle, v, nom); bulle.appendChild(l); });
      const r = svg.getBoundingClientRect(), px = x(k) / W * r.width;
      bulle.style.left = Math.max(4, Math.min(r.width - bulle.offsetWidth - 4, px + (px > r.width * 0.55 ? -bulle.offsetWidth - 10 : 10))) + 'px';
    };
    const quitter = () => { j = null; viseur.setAttribute('hidden', ''); bulle.hidden = true; };
    const indice = e => { const r = svg.getBoundingClientRect(), u = ((e.clientX - r.left) / r.width * W - m.g) / (W - m.g - m.d); return Math.max(0, Math.min(n - 1, Math.round(u * (n - 1)))); };
    svg.addEventListener('pointermove', e => viser(indice(e)));
    svg.addEventListener('pointerleave', quitter);
    svg.addEventListener('click', e => { const k = indice(e); arreterFilm(); APP.allerA(pts[k].h ? pts[k].i : null); });
    fig.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); viser(Math.max(0, Math.min(n - 1, (j == null ? idxCourant() : j) + (e.key === 'ArrowRight' ? 1 : -1)))); }
      else if (e.key === 'Enter' && j != null) { arreterFilm(); APP.allerA(pts[j].h ? pts[j].i : null); }
    });
    fig.addEventListener('blur', quitter);
    fig._x = x; fig._vals = vals;
  }
  function majCourbes() {
    if (courbes.hidden) return;
    const k = idxCourant();
    for (const fig of courbes.querySelectorAll('.graphe')) {
      const S = SERIES.find(s => s.id === fig.dataset.id), l = fig.querySelector('[data-date]');
      l.setAttribute('x1', fig._x(k)); l.setAttribute('x2', fig._x(k));
      const el = fig.querySelector('[data-val]');
      el.textContent = S.series.length === 1 ? fr(fig._vals[0][k], S.dec) : '';
    }
  }
  $('#oCourbes').addEventListener('click', () => {
    courbes.hidden = !courbes.hidden;
    $('#oCourbes').setAttribute('aria-expanded', !courbes.hidden);
    document.body.classList.toggle('avec-courbes', !courbes.hidden);
    if (!courbes.hidden) rendreCourbes();
  });

  // ---------- Recherche ----------
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const dlg = $('#rechercheDlg'), champ = $('#rechercheChamp'), listeR = $('#rechercheListe');
  let index = null, resultats = [], choix = 0;
  const viser = (c, k) => { if (!c) return; CARTE.volerVers(c, k || 6, 1300); CARTE.signaler(c); };
  function construireIndex() {
    const out = [], ajouter = (type, nom, sous, action, plus) => out.push({ type, nom, sous, action, cle: norm(nom + ' ' + (sous || '') + ' ' + (plus || '')) });
    for (const s of data.secteurs) {
      ajouter('Secteur', s.nom, s.geographique === false ? 'Secteur organisationnel' : 'Secteur géographique', () => APP.naviguer(s.id));
      for (const d of s.districts) ajouter('District', d.nom, 'Secteur ' + s.nom, () => APP.naviguer(s.id, d.id), (d.pays || []).join(' '));
    }
    for (const v of data.villes || []) { const d = APP.parId[v.district]; if (d) ajouter('Ville', v.nom, d.nom, () => APP.naviguer(d._secteur, d.id, v.id)); }
    for (const x of data.sites || []) ajouter(x.glitch ? "Laboratoire d'exclusion" : 'Site', x.nom, x.etat || (GLYPHES.SITES[x.icone] || {}).nom || 'Site stratégique', () => viser(x.coord, 7));
    for (const z of data.zones || []) ajouter('Zone cultiste', z.nom, z.dieu, () => viser(CARTE._.centreZone(z), 4));
    for (const f of data.flottes || []) ajouter('Flotte', f.nom, f.zone || '', () => viser(f._c || f.trajet[0], 6));
    for (const x of data.satellites || []) ajouter('Satellite', x.nom, x.etat || '', () => viser(x._c || x.coord || [0, 0], 3));
    for (const r of data.traverseurs || []) ajouter('Traverseur', r.nom, 'Voie ferrée', () => viser(r.voie[0], 5));
    for (const l of data.lignes || []) ajouter('Ligne de front', l.nom, l.date, () => viser(l.trace[Math.floor(l.trace.length / 2)], 6));
    data.evenements.forEach((ev, k) => ajouter('Événement', ev.titre, ev.date + ' · ' + APP.nomPortee(ev.portee), () => {
      const i = data.historique.findIndex(h => h.evenements > k); APP.allerA(i < 0 ? null : i);
      etat.onglet = 'evt'; if (ev.lieux && ev.lieux.length) { if (etat.niveau !== 'monde') APP.naviguer(); viser(ev.lieux[0], 4.5); APP.rendrePanel(); } else APP.allerPortee(ev.portee);
    }));
    return out;
  }
  function chercher() {
    const mots = norm(champ.value).split(/\s+/).filter(Boolean);
    resultats = !mots.length ? [] : index.filter(o => mots.every(m => o.cle.includes(m))).sort((a, b) => (norm(b.nom).startsWith(mots[0]) ? 1 : 0) - (norm(a.nom).startsWith(mots[0]) ? 1 : 0)).slice(0, 14);
    choix = 0;
    listeR.innerHTML = resultats.length ? resultats.map((o, i) => `<li role="option" id="rech-${i}" aria-selected="${i === 0}" data-i="${i}"><span class="r-type">${esc(o.type)}</span><span class="r-nom">${esc(o.nom)}</span><span class="r-sous">${esc(o.sous || '')}</span></li>`).join('')
      : `<li class="r-vide">${mots.length ? 'Rien sur le réseau à ce nom.' : 'Un nom de ville, de site, de flotte, de district ou un mot du titre d\'un événement.'}</li>`;
    champ.setAttribute('aria-activedescendant', resultats.length ? 'rech-0' : '');
  }
  const choisir = i => { choix = Math.max(0, Math.min(resultats.length - 1, i)); listeR.querySelectorAll('[role="option"]').forEach((li, k) => { li.setAttribute('aria-selected', k === choix); if (k === choix) li.scrollIntoView({ block: 'nearest' }); }); champ.setAttribute('aria-activedescendant', 'rech-' + choix); };
  const valider = i => { const o = resultats[i]; if (!o) return; dlg.close(); arreterFilm(); fermerBrief(); o.action(); };
  function ouvrirRecherche() { index = index || construireIndex(); champ.value = ''; chercher(); if (!dlg.open) dlg.showModal(); champ.focus(); }
  $('#btnRecherche').addEventListener('click', ouvrirRecherche);
  champ.addEventListener('input', chercher);
  champ.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); choisir(choix + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); choisir(choix - 1); } else if (e.key === 'Enter') { e.preventDefault(); valider(choix); } });
  listeR.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) valider(+li.dataset.i); });

  // ---------- Calques et légende ----------
  const tiroir = $('#tiroir');
  const CALQUES = [
    ['militaire', 'Militaire', 'Pions, lignes de front, offensives, bombardements, flottes'],
    ['anormal', 'Anormal', "Zones cultistes, brouillard, cicatrices nucléaires, laboratoires d'exclusion"],
    ['infrastructure', 'Infrastructure', 'Sites, traverseurs, satellites'],
    ['civil', 'Civil', 'Villes, quarantaines']
  ];
  const svgSite = k => `<svg class="l-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${GLYPHES.SITES[k].d}"/></svg>`;
  function rendreTiroir() {
    const s = APP.sc(), c = CARTE._.couches, dieux = new Map();
    for (const z of s.zones) { const n = APP.nomZone(z); if (!dieux.has(n)) dieux.set(n, z.couleur); }
    const it = (sw, lib) => `<li>${sw}<span>${lib}</span></li>`, sw = (cls, st) => `<i class="sw ${cls}" ${st ? `style="${st}"` : ''}></i>`;
    const groupes = [
      ['Territoire', [it(sw('terre'), 'Territoire confédéré'), it(sw('conteste'), 'District contesté'), it(sw('perdu'), 'District perdu'), it(sw('quarantaine'), 'Quarantaine'), it(sw('reprise'), 'Terres reprises par la Confédération'), it(sw('nuit'), 'Nuit, selon l\'heure réelle')]],
      ['Culte', [...[...dieux].map(([n, col]) => it(sw('zone', `--c:${esc(col)}`), esc(n))), it(sw('bordure'), 'Bordure contestée'), it(sw('dents cult'), 'Front où les cultistes avancent'), it(sw('dents cc'), 'Front où la Confédération reprend du terrain'), it(sw('brume'), 'Brouillard de guerre : rien de confirmé')]],
      ['Militaire', [it('<i class="sw pion"></i>', 'Unité confédérée, avec sa jauge d\'effectif et de pertes'), it('<i class="sw pion cult"></i>', 'Force cultiste, effectif estimé'), it(sw('ligne stab'), 'Front stabilisé'), it(sw('ligne fort'), 'Ligne fortifiée'), it(sw('ligne renf'), 'Ligne fortement fortifiée'), it(sw('axe cult'), 'Offensive cultiste de la semaine'), it(sw('axe cc'), 'Offensive confédérée de la semaine'), it(sw('frappe napalm'), 'Bombardement au napalm'), it(sw('frappe missiles'), 'Missiles et bombardiers'), it(sw('contestation'), 'Zone de contestation'), it(sw('navire'), 'Flotte en patrouille')]],
      ['Anormal', [it(sw('labo'), "Laboratoire d'exclusion"), it(sw('cratere'), 'Cratère vitrifié'), it(sw('panache'), 'Retombées sous le vent'), it(sw('exclusion'), "Anneau d'exclusion")]],
      ['Infrastructure', [it(sw('etoile'), 'Site stratégique'), ...Object.entries(GLYPHES.SITES).filter(([k]) => (data.sites || []).some(x => x.icone === k && !x.glitch)).map(([k, T]) => it(`<span class="sw site ${T.famille}">${svgSite(k)}</span>`, T.nom)), it(sw('rail'), 'Traverseur en service'), it(sw('rail coupe'), 'Voie coupée'), it(sw('rail travaux'), 'Voie en reconstruction'), it(sw('orbite'), 'Orbite de satellite')]],
      ['Civil', [it(sw('ville ok'), 'Ville intacte'), it(sw('ville moyen'), 'Ville éprouvée'), it(sw('ville grave'), 'Ville assiégée'), it(sw('ville critique'), 'Ville ravagée ou tombée'), it(sw('etoile petite'), 'Capitale de secteur'), it(sw('picto'), 'Événement de la semaine (rouge : cultistes, bleu : Confédération)')]]
    ];
    const pal = ['stratégique', 'opérative', 'tactique'][CARTE.palier()];
    tiroir.innerHTML = `<div class="ti-tete"><p class="cartouche">Calques · altitude ${pal}</p><button type="button" class="fermer" aria-label="Fermer">${C.ICONES.close}</button></div>
      <div class="ti-calques">${CALQUES.map(([k, lib, desc]) => `<label class="calque"><input type="checkbox" data-calque="${k}" ${c[k] ? 'checked' : ''}><span class="bascule" aria-hidden="true"></span><span class="c-txt"><strong>${lib}</strong><small>${desc}</small></span></label>`).join('')}</div>
      <p class="cartouche">Légende</p>
      ${groupes.map(([t, items]) => `<details class="l-groupe" ${t === 'Territoire' || t === 'Culte' ? 'open' : ''}><summary>${t}</summary><ul>${items.join('')}</ul></details>`).join('')}`;
  }
  function basculerTiroir(v) {
    const ouvrir = v == null ? tiroir.hidden : v;
    tiroir.hidden = !ouvrir; $('#oCalques').setAttribute('aria-expanded', ouvrir);
    if (ouvrir) rendreTiroir();
  }
  $('#oCalques').addEventListener('click', () => basculerTiroir());
  tiroir.addEventListener('click', e => { if (e.target.closest('.fermer')) basculerTiroir(false); });
  tiroir.addEventListener('change', e => {
    const k = e.target.dataset.calque;
    if (!k) return;
    CARTE.definirCouches({ [k]: e.target.checked });
    APP.prefs.couches = { ...CARTE._.couches }; APP.garder();
  });

  // Mises à jour quand la date ou la vue change
  APP.surDate = () => { majCourbes(); majRideau(); if (!tiroir.hidden) rendreTiroir(); if (brief) etapeBrief(brief.i); };
  APP.surVue = () => { const a = $('#altitude'); if (a) a.textContent = ['Strat.', 'Opér.', 'Tact.'][CARTE.palier()]; if (!tiroir.hidden) { const c = tiroir.querySelector('.cartouche'); if (c) c.textContent = 'Calques · altitude ' + ['stratégique', 'opérative', 'tactique'][CARTE.palier()]; } };
  APP.surVue();

  // Lien direct vers le briefing : index.html?briefing
  if (new URLSearchParams(location.search).has('briefing')) setTimeout(APP.briefing, 900);
});
