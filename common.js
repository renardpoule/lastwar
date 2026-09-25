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

  const GRAVITES = { mineur: 'Mineur', majeur: 'Majeur', critique: 'Critique' };
  const TENDANCES = { hausse: 'Progression cultiste', stable: 'Front stable', baisse: 'Recul cultiste' };

  return { parse, fmt, num, court, somme, combine, agrege, palier, minutes, heure, tousDistricts, esc, CIVILS, PERTES, FACTIONS, GRAVITES, TENDANCES };
})();
