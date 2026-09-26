// Outils partagés entre la carte (app.js) et le panneau d'administration (admin.js)
const C = (() => {
  // Une valeur chiffrée peut être : 12000 · "~12000" (estimation) · "?" ou "CLASSIFIÉ" (inconnue)
  function parse(v) {
    if (v === null || v === undefined || v === '') return { n: 0, est: false, cls: false, vide: true };
    if (typeof v === 'number') return { n: v, est: false, cls: false };
    const s = String(v).trim();
    if (s === '?' || /^classifi/i.test(s)) return { n: 0, est: false, cls: true };
    const est = s.startsWith('~');
    const n = Number(s.replace(/[~\s ]/g, '').replace(',', '.'));
    return isNaN(n) ? { n: 0, est: false, cls: true } : { n, est, cls: false };
  }

  const nf = new Intl.NumberFormat('fr-FR');
  function num(n) { return nf.format(Math.round(n)); }

  // Format court : 1,2 M · 340 k
  function court(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace('.', ',') + ' Md';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
    if (n >= 1e4) return Math.round(n / 1e3) + ' k';
    return num(n);
  }

  // Affiche une valeur brute ou agrégée
  function fmt(v, compact) {
    const p = (v && v.hasOwnProperty && v.hasOwnProperty('n')) ? v : parse(v);
    if (p.cls && !p.n) return '<span class="cls">CLASSIFIÉ</span>';
    const s = compact ? court(p.n) : num(p.n);
    return (p.est ? '~' : '') + s + (p.cls ? '<span class="plus">+</span>' : '');
  }

  function somme(list) {
    const r = { n: 0, est: false, cls: false };
    for (const v of list) {
      const p = parse(v);
      r.n += p.n; r.est = r.est || p.est; r.cls = r.cls || p.cls;
    }
    return r;
  }
  // Somme d'agrégats déjà calculés
  function combine(list) {
    const r = { n: 0, est: false, cls: false };
    for (const p of list) { r.n += p.n; r.est = r.est || p.est; r.cls = r.cls || p.cls; }
    return r;
  }

  const CIVILS = [
    ['population', 'Population'],
    ['impliques', 'Civils impliqués'],
    ['deplaces', 'Déplacés'],
    ['disparus', 'Disparus'],
    ['deces', 'Décès']
  ];
  const PERTES = [['tues', 'Tués'], ['blesses', 'Blessés'], ['disparus', 'Disparus']];
  const FACTIONS = ['confederation', 'cultistes'];

  // Agrège une liste de districts
  function agrege(districts) {
    const civils = {};
    for (const [k] of CIVILS) civils[k] = somme(districts.map(d => d.civils && d.civils[k]));
    const forces = {}, pertes = {};
    for (const f of FACTIONS) {
      const unites = new Map();
      for (const d of districts) for (const u of (d.forces && d.forces[f]) || []) {
        if (!unites.has(u.nom)) unites.set(u.nom, []);
        unites.get(u.nom).push(u.effectif);
      }
      const list = [...unites].map(([nom, vals]) => ({ nom, v: somme(vals) })).sort((a, b) => b.v.n - a.v.n);
      forces[f] = { total: combine(list.map(u => u.v)), unites: list };
      pertes[f] = {};
      for (const [k] of PERTES) pertes[f][k] = somme(districts.map(d => d.pertes && d.pertes[f] && d.pertes[f][k]));
    }
    return { civils, forces, pertes };
  }

  function palier(tension, paliers) {
    let idx = 0;
    paliers.forEach((p, i) => { if (tension >= p.min) idx = i; });
    return idx;
  }
  // Minutes avant minuit, interpolées entre les paliers
  function minutes(tension, paliers) {
    const i = palier(tension, paliers);
    const p = paliers[i], n = paliers[i + 1];
    if (!n) return p.minutes;
    const t = (tension - p.min) / (n.min - p.min);
    return p.minutes + (n.minutes - p.minutes) * t;
  }
  function heure(min) {
    const s = Math.round(min * 60);
    if (s <= 0) return '00:00:00';
    const t = 24 * 3600 - s;
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
    return [h, m, sec].map(x => String(x).padStart(2, '0')).join(':');
  }

  function tousDistricts(data) {
    return data.secteurs.flatMap(s => s.districts.map(d => Object.assign(d, { _secteur: s.id })));
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));


  // Icônes MingCute (ligne), fournies par Better Design — intégrées pour éviter tout chargement réseau
  const ICONES = {
    play: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M6.661 4.88a.47.47 0 0 1 .656-.378c1.032.441 3.375 1.502 6.354 3.222s5.071 3.22 5.97 3.893a.468.468 0 0 1 0 .755c-.889.667-2.954 2.148-5.97 3.89c-3.019 1.742-5.334 2.79-6.356 3.226a.468.468 0 0 1-.653-.378c-.135-1.11-.389-3.662-.389-7.116c0-3.452.254-6.003.388-7.115Z"/></svg>',
    pause: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M8 5v14m8-14v14"/></svg>',
    close: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m5.636 5.637l12.728 12.728m-12.728 0L18.364 5.637"/></svg>',
    warning: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 7v6m0 3h.002M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0Z"/></svg>',
    location: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M15 11a3 3 0 1 1-6 0a3 3 0 0 1 6 0Z"/><path fill="none" stroke="currentColor" stroke-width="2" d="M20 11c0 5.396-5.896 9.108-7.565 10.05a.87.87 0 0 1-.87 0C9.895 20.108 4 16.396 4 11a8 8 0 1 1 16 0Z"/></svg>',
    download: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 3a1 1 0 1 0-2 0zm-2 13a1 1 0 1 0 2 0zm-1.828-4a1 1 0 1 0-1.415 1.414l.707-.707zM12 16.243l-.707.707a1 1 0 0 0 1.414 0zm4.243-2.829A1 1 0 1 0 14.828 12l.708.707zM20 7h-1v13h2V7zm-1 14v-1H5v2h14zM4 20h1V7H3v13zM5 6v1h3V5H5zm11 0v1h3V5h-3zm-4-3h-1v13h2V3zm-3.536 9.707l-.707.707l3.536 3.536l.707-.707l.707-.707L9.172 12zM12 16.243l.707.707l3.536-3.536l-.707-.707l-.708-.707l-3.535 3.536zM4 7h1V5a2 2 0 0 0-2 2zm1 14v-1H3a2 2 0 0 0 2 2zm15-1h-1v2a2 2 0 0 0 2-2zm0-13h1a2 2 0 0 0-2-2v2z"/></svg>',
    upload: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1h-2m-4-6v11m2.5-8.5L12 3L9.5 5.5"/></svg>',
    externe: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h6m9 2V4h-5m-5 10l9.5-9.5"/></svg>'
  };

  const GRAVITES = { mineur: 'Mineur', majeur: 'Majeur', critique: 'Critique' };
  const TENDANCES = { hausse: 'Progression cultiste', stable: 'Front stable', baisse: 'Recul cultiste' };

  return { ICONES, parse, fmt, num, court, somme, combine, agrege, palier, minutes, heure, tousDistricts, esc, CIVILS, PERTES, FACTIONS, GRAVITES, TENDANCES };
})();
