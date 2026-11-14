// Glyphes de la carte : tous les symboles sont peints sur canvas à partir de tracés vectoriels (Path2D).
// Grille de 24 pour les pictogrammes au trait, tracés centrés sur l'origine pour les silhouettes.
const GLYPHES = (() => {
  const T = d => new Path2D(d);
  const anneau = (r, e) => `M${r},0A${r},${r} 0 1 1 ${-r},0A${r},${r} 0 1 1 ${r},0ZM${r - e},0A${r - e},${r - e} 0 1 0 ${-(r - e)},0A${r - e},${r - e} 0 1 0 ${r - e},0Z`;

  // Étoile du chaos à huit flèches, dans un cercle de rayon 1
  const CHAOS_D = (() => {
    const w = 0.034, forme = [[0.26, -w], [0.78, -w], [0.74, -0.1], [1, 0], [0.74, 0.1], [0.78, w], [0.26, w]];
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8, ca = Math.cos(a), sa = Math.sin(a), f = i % 2 ? 0.8 : 1;
      d += forme.map(([x, y], j) => (j ? 'L' : 'M') + (x * f * ca - y * sa).toFixed(3) + ',' + (x * f * sa + y * ca).toFixed(3)).join('') + 'Z';
    }
    return d + anneau(0.2, 0.06);
  })();
  // Trèfle de radioactivité, dans un cercle de rayon 1
  const TREFLE_D = (() => {
    let d = '';
    for (let i = 0; i < 3; i++) {
      const a0 = (-90 + 120 * i - 30) * Math.PI / 180, a1 = a0 + Math.PI / 3, r1 = 0.26, r2 = 0.95;
      const P = (r, a) => (r * Math.cos(a)).toFixed(3) + ',' + (r * Math.sin(a)).toFixed(3);
      d += `M${P(r1, a0)}L${P(r2, a0)}A${r2},${r2} 0 0 1 ${P(r2, a1)}L${P(r1, a1)}A${r1},${r1} 0 0 0 ${P(r1, a0)}Z`;
    }
    return d + 'M0.15,0A0.15,0.15 0 1 1 -0.15,0A0.15,0.15 0 1 1 0.15,0Z';
  })();
  // Étoile brisée de la Confédération (dessin d'origine 830 × 830, centré sur 415,415)
  const ETOILE_D = 'M415,110L483,320H438L415,248L392,320H347ZM110,348H720L217,718L292,487ZM237,390L342,470L299,605L590,390ZM546,511L615,720L437,591L472,565L533,608L510,537Z';

  const F = {
    chaos: T(CHAOS_D), trefle: T(TREFLE_D), etoile: T(ETOILE_D),
    // Appareils, nez vers +x
    chasseur: T('M7.5,0L3,-1L-2.5,-4.6H-4L-3.2,-1H-5.6L-6.8,-2.4H-7.4L-6.9,0L-7.4,2.4H-6.8L-5.6,1H-3.2L-4,4.6H-2.5L3,1Z'),
    bombardier: T('M6.5,0L5.2,-1.3H2L-0.8,-9.4H-2.6L-1.6,-1.3H-5.2L-6.8,-3.6H-8.2L-7.6,0L-8.2,3.6H-6.8L-5.2,1.3H-1.6L-2.6,9.4H-0.8L2,1.3H5.2Z'),
    // Navires vus du dessus, proue vers +x
    surface: T('M-12,-2.2L-10.5,-3H4.5L12,0L4.5,3H-10.5L-12,2.2ZM-5.5,-1.1H-2.5V1.1H-5.5ZM0.5,-1.1H3.5V1.1H0.5Z'),
    'porte-avions': T('M-13,-3.2H7.5L13,-1V2L9,3.8H-13ZM-9,-3.2L5,2.4M-2,-5.2H3.5V-3.2H-2Z'),
    'sous-marins': T('M-12,0C-12,-1.9 -8,-2.5 -3,-2.5H5C9.5,-2.5 12.5,-1.2 12.5,0C12.5,1.2 9.5,2.5 5,2.5H-3C-8,2.5 -12,1.9 -12,0ZM-1.5,-1.1H3V1.1H-1.5ZM-12,0H-14.5M-13.2,-1.8V1.8'),
    recherche: T('M-12,-2.8H5L12,0L5,2.8H-12L-10,0ZM-3.4,0A2.3,2.3 0 1 0 1.2,0A2.3,2.3 0 1 0 -3.4,0Z'),
    train: T('M-13,-2.3H-6.5V2.3H-13ZM-5.5,-2.3H1V2.3H-5.5ZM2,-2.3H8.5L12.5,0L8.5,2.3H2Z'),
    satellite: T('M-3,-3h6v6h-6zM-12,-2.2h7.5v4.4h-7.5zM4.5,-2.2h7.5v4.4h-7.5zM-8.2,-2.2v4.4M8.2,-2.2v4.4M0,-3v-3.2M-1.6,-6.2h3.2'),
    // Intérieur des pions
    dague: T('M0,-6.4L1.4,-3.4V1.6H-1.4V-3.4ZM-4.2,1.6H4.2V3H-4.2ZM-0.8,3H0.8V5.2H-0.8ZM0,5L1.3,6.3L0,7.3L-1.3,6.3Z'),
    phenix: T('M0,-6.2L1.1,-4.8L0.9,-3.2L3.6,-3.4L6.6,-5.4L9.4,-6.2L8.2,-4.1L8.6,-3.1L6.4,-2.7L6.6,-1.5L4.2,-1.2L1.6,0.2L2.2,2.4L3.4,5.4L1.3,3.7L0,6.2L-1.3,3.7L-3.4,5.4L-2.2,2.4L-1.6,0.2L-4.2,-1.2L-6.6,-1.5L-6.4,-2.7L-8.6,-3.1L-8.2,-4.1L-9.4,-6.2L-6.6,-5.4L-3.6,-3.4L-0.9,-3.2L-1.1,-4.8Z')
  };

  // Installations (grille de 24, au trait)
  const SITES = {
    labo: { nom: 'Laboratoire', famille: 'science', d: 'M9 3h6M10 3v6.2L4.9 18a2 2 0 0 0 1.7 3h10.8a2 2 0 0 0 1.7-3L14 9.2V3M7.6 15h8.8' },
    lancement: { nom: 'Site de lancement spatial', famille: 'science', d: 'M12 2.5c3 2.5 4 6 4 9.5l-1.5 5h-5L8 12c0-3.5 1-7 4-9.5zM10.4 9a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M8.3 13.5 5.5 17.2l3.3-.7M15.7 13.5l2.8 3.7-3.3-.7M10.5 19.5l1.5 2.3 1.5-2.3' },
    geothermie: { nom: 'Générateur géothermique', famille: 'energie', d: 'M3 20.5h18M5 20.5l5-9 2.5 3L15 10l4 10.5M12 3c-1.6 1.6 1.2 2.6 0 5M16 4c-1 1 .8 1.8 0 3.5' },
    reception: { nom: 'Station de réception', famille: 'energie', d: 'M12 21v-9M8 21h8M10.5 10a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M8.5 6.5a5 5 0 0 1 7 0M5.5 3.5a9 9 0 0 1 13 0' },
    telescope: { nom: 'Observatoire', famille: 'science', d: 'M3.5 13.6 14 7.2l2.4 4.1L6 17.6zM14 7.2l3.4-2 2.4 4.1-3.4 2M10 15.4 7.2 21M11 15 14 21M10.5 15.2V21' },
    fusion: { nom: 'Réacteur à fusion', famille: 'energie', mineur: true, d: 'M10.2 12a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M2 12a10 4 0 1 0 20 0a10 4 0 1 0-20 0M7 3.34a10 4 60 1 0 10 17.32a10 4 60 1 0-10-17.32M17 3.34a10 4 -60 1 0-10 17.32a10 4 -60 1 0 10-17.32' },
    tda: { nom: 'Tour de décarbonisation', famille: 'energie', mineur: true, d: 'M9 21V7.5a3 3 0 0 1 6 0V21M6 21h12M9 11h6M9 15h6M12 4.5V2' }
  };
  for (const k in SITES) SITES[k].p = T(SITES[k].d);

  // Événements : [camp par défaut, libellé, tracé]
  const EVTS = {
    percee: ['cult', 'Percée cultiste', 'M4 12h12M11 6l6 6-6 6'],
    contre: ['cc', 'Contre-offensive', 'M3 12h9M8 7l5 5-5 5M13 7l5 5-5 5'],
    reprise: ['cc', 'Reprise', 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4'],
    nucleaire: ['feu', 'Frappe nucléaire', 'M10.2 12a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M10.2 9.2L7.6 4.8a8.5 8.5 0 0 1 8.8 0L13.8 9.2M15 13.6h5a8.5 8.5 0 0 1-4.4 7.4L13 16.7M9 13.6H4a8.5 8.5 0 0 0 4.4 7.4L11 16.7'],
    plieur: ['cult', 'Plieur de réalité', 'M11 12a1 1 0 1 1 2 0a3 3 0 1 1-6 0a5 5 0 1 1 10 0a7 7 0 1 1-14 0'],
    'plieur-mort': ['cc', 'Plieur de réalité tué', 'M12 3a7 7 0 0 0-7 7c0 2.6 1.3 4.2 3 5.2V19h8v-3.8c1.7-1 3-2.6 3-5.2a7 7 0 0 0-7-7zM9.5 10.5h.01M14.5 10.5h.01M10.5 19v2M13.5 19v2'],
    entite: ['cult', 'Entité', 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0'],
    maladie: ['cult', 'Épidémie', 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11zM10 14a2 2 0 0 0 2 2'],
    phoenix: ['cc', 'Division Phoenix', 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6.5 1.2 1 2 2.4 2 4 1.3-2 1.3-4.7 1-7.5z'],
    quarantaine: ['cc', 'Quarantaine', 'M3 8h18v5H3zM6 13v7M18 13v7M7 8l4 5M13 8l4 5'],
    confinement: ['cc', 'Confinement', 'M6 11V8a6 6 0 0 1 12 0v3M4.5 11h15v10h-15zM12 15v2.5'],
    fortification: ['cc', 'Fortification', 'M4 20V9h3V6h3v3h4V6h3v3h3v11zM10 20v-4h4v4'],
    front: ['neutre', 'Front', 'M5 5l9 9M19 5l-9 9M7 17l3-3M17 17l-3-3M4 20l2-2M20 20l-2-2'],
    combat: ['neutre', 'Combat', 'M5 5l9 9M19 5l-9 9M7 17l3-3M17 17l-3-3M4 20l2-2M20 20l-2-2'],
    foule: ['neutre', 'Foules', 'M5 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M13 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M2 20c0-3 3-5 6-5s6 2 6 5M12 20c.4-2.6 2.2-5 4-5 3 0 6 2 6 5'],
    evacuation: ['cc', 'Évacuation', 'M3 15h18l-3 5H6zM6 15V9h8l3 6M9 9V5h3v4'],
    renfort: ['cc', 'Renforts', 'M5 20l7-5 7 5M5 15l7-5 7 5M5 10l7-5 7 5'],
    commando: ['neutre', 'Commando', 'M12 2l2 4v9h-4V6zM8 15h8M11 17h2v4h-2z'],
    signal: ['neutre', 'Signal', 'M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13'],
    machine: ['neutre', 'HCP', 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4'],
    science: ['neutre', 'Recherche', 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3'],
    rail: ['cc', 'Voie ferrée', 'M6 4h12v11H6zM6 10h12M9 18l-2 3M15 18l2 3M9 13h.01M15 13h.01'],
    ville: ['cult', 'Ville tombée', 'M4 21V8l6-4v17M10 21V10h6l4 4v7M13 14l2 2M16 13l-1 4'],
    bilan: ['neutre', 'Bilan', 'M6 4h12v17H6zM9 2.5h6V6H9zM9 11h6M9 14.5h6M9 18h3.5'],
    discours: ['cc', 'Allocution', 'M4 10v4h3l7 4V6l-7 4zM17 9.5a4 4 0 0 1 0 5M19.5 7a7.5 7.5 0 0 1 0 10M7 14v5h2.5']
  };
  for (const k in EVTS) EVTS[k].push(T(EVTS[k][2]));

  // Générateur pseudo-aléatoire stable (même identifiant, même dessin)
  function graine(s) {
    let h = 2166136261;
    for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }

  // Ligne d'horizon miniature d'une ville : immeubles tirés de son identifiant, ruinés selon son état (0–100)
  const silhouettes = new Map();
  function silhouette(v) {
    const cle = v.id + ':' + Math.round(v.etat / 4);
    if (silhouettes.has(cle)) return silhouettes.get(cle);
    const r = graine(v.id), deg = 1 - Math.max(0, Math.min(100, +v.etat || 0)) / 100;
    const n = 6, larg = 22, bats = [];
    let x = -larg / 2;
    for (let i = 0; i < n; i++) {
      const w = larg / n * (0.8 + r() * 0.4), centre = 1 - Math.abs(i - (n - 1) / 2) / n;
      let h = (3.5 + r() * 7.5) * (0.6 + centre * 0.8);
      const casse = r() < deg * 1.15, coupe = casse ? 0.3 + r() * 0.5 * (1 - deg * 0.6) : 1, dent = r();
      bats.push({ x, w: Math.min(w, larg / 2 - x), h: h * coupe, casse, dent, feu: casse && r() < deg });
      x += w;
      if (x >= larg / 2) break;
    }
    const p = new Path2D();
    for (const b of bats) {
      p.moveTo(b.x, 0); p.lineTo(b.x, -b.h);
      if (b.casse) { p.lineTo(b.x + b.w * 0.35, -b.h * (0.55 + b.dent * 0.3)); p.lineTo(b.x + b.w * 0.6, -b.h * (0.85 + b.dent * 0.15)); p.lineTo(b.x + b.w, -b.h * (0.3 + b.dent * 0.4)); }
      else p.lineTo(b.x + b.w, -b.h);
      p.lineTo(b.x + b.w, 0); p.closePath();
    }
    const o = { p, bats, larg };
    silhouettes.set(cle, o);
    return o;
  }

  return { F, SITES, EVTS, graine, silhouette, T };
})();
