// Illustrations des villes « Too young to die » : une vue dessinée à partir de la description,
// déformée selon l'état de la ville (100 % = intacte, 0 % = tombée).
const VILLES = (() => {
  // Générateur pseudo-aléatoire stable : même ville, même dessin
  function graine(s) {
    let h = 2166136261;
    for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  const W = 320, H = 180, SOL = 146;
  const f = n => n.toFixed(1);

  // Silhouette de bâtiment, sommet cassé si endommagé
  function batiment(x, w, h, casse, r) {
    const y = SOL - h;
    if (!casse) return `M${f(x)},${SOL}V${f(y)}H${f(x + w)}V${SOL}Z`;
    const n = 3 + Math.floor(r() * 3);
    let d = `M${f(x)},${SOL}V${f(y + r() * h * 0.3)}`;
    for (let i = 1; i <= n; i++) d += `L${f(x + w * i / n)},${f(y + h * (0.1 + r() * 0.45))}`;
    return d + `V${SOL}Z`;
  }

  // Éléments caractéristiques de chaque ville (d'après sa fiche)
  const REPERES = {
    port: r => `<g class="v-sil"><path d="M200,${SOL}V92h6v54zM203,92l46,0v4h-40zM246,96v16"/><path d="M262,${SOL}V100h5v46zM264,100l34,0v3h-30z"/>
      <path d="M150,${SOL + 6}l8,-12h78l10,-6h14l-6,18z"/><path d="M178,${SOL - 6}h26v-8h-26z"/></g>
      <rect class="v-eau" x="0" y="${SOL}" width="${W}" height="${H - SOL}"/>`,
    caserne: r => `<g class="v-sil"><path d="M40,${SOL}V112h70v34zM130,${SOL}V120h60v26z"/><path d="M226,${SOL}V84h10v62zM220,84h22v-8h-22z"/>
      <path d="M262,58l22,5l10,-3l-3,4l12,3l-12,1l-10,6l-4,-1l5,-6l-20,-4z"/></g>`,
    labo: r => `<g class="v-sil"><path d="M60,${SOL}a38,38 0 0 1 76,0zM170,${SOL}a24,24 0 0 1 48,0z"/><path d="M236,${SOL}V96h28v50z"/></g>
      <rect class="v-eau" x="0" y="${SOL}" width="${W}" height="${H - SOL}"/>
      <path class="v-verre" d="M66,${SOL}a32,32 0 0 1 64,0"/>`,
    hopital: r => `<g class="v-sil"><path d="M100,${SOL}V90h90v56z"/><path d="M20,${SOL}h260v-10h-260z"/></g>
      <path class="v-croix" d="M139,98h12v10h10v12h-10v10h-12v-10h-10v-12h10z"/>
      <g class="v-train"><rect x="196" y="126" width="46" height="12" rx="3"/><rect x="244" y="126" width="46" height="12" rx="3"/></g>`,
    ruines: r => `<g class="v-sil"><path d="M0,${SOL}V124l20,-4v26zM30,${SOL}V112h8v-6h8v6h8v34z"/><path d="M180,${SOL}V118h140v28z"/>
      <path d="M190,118v-8h6v8zM220,118v-8h6v8zM250,118v-8h6v8zM280,118v-8h6v8z"/></g>`,
    pagode: r => `<g class="v-sil"><path d="M100,${SOL}V128h40v18zM92,128h56l-8,-8h-40zM104,120V106h32v14zM96,106h48l-8,-8h-32zM108,98V86h24v12zM100,86h40l-10,-8h-20zM119,78v-12h2v12z"/></g>
      <path class="v-torii" d="M200,${SOL}V112h4v34zM230,${SOL}V112h4v34zM194,110h46v4h-46zM198,118h38v3h-38z"/>`,
    usines: r => `<g class="v-sil"><path d="M20,${SOL}V116l24,-12v12l24,-12v12l24,-12v42z"/><path d="M130,${SOL}V60h10v86zM156,${SOL}V74h9v72zM180,${SOL}V88h8v58z"/></g>`,
    prison: r => `<g class="v-sil"><path d="M0,${SOL}V124h${W}v22z"/><path d="M40,124V92h14v32zM36,92h22l-11,-10z"/><path d="M266,124V92h14v32zM262,92h22l-11,-10z"/>
      <path d="M120,124V104h80v20z"/></g>`,
    tours: r => `<g class="v-sil"><path d="M140,${SOL}V40l6,-6l6,6v106zM145,34V14h2v20z"/><path d="M170,${SOL}V64h14v82zM112,${SOL}V70h16v76z"/></g>`,
    opera: r => `<g class="v-sil"><path d="M90,${SOL - 8}q20,-44 44,-40q-10,20 -6,40zM124,${SOL - 8}q22,-50 50,-46q-12,22 -8,46zM160,${SOL - 8}q18,-36 40,-34q-8,16 -6,34z"/>
      <path d="M80,${SOL}h140v-8h-140z"/><path d="M230,${SOL}V110h60v36z"/></g>
      <rect class="v-eau" x="0" y="${SOL}" width="${W}" height="${H - SOL}"/>`,
    capitole: r => `<g class="v-sil"><path d="M90,${SOL}V116h140v30zM130,116V104h60v12zM134,104a26,26 0 0 1 52,0zM158,78V66h4v12z"/><path d="M40,${SOL}V60l6,-10l6,10v86z"/></g>`,
    infectee: r => `<g class="v-sil"><path d="M150,${SOL}V92l14,-18l14,18v54z"/><path d="M200,${SOL}V110h40v36z"/></g>`
  };

  function dessiner(v, couleurCulte) {
    const r = graine(v.id);
    const etat = Math.max(0, Math.min(100, +v.etat || 0)), deg = 1 - etat / 100;
    const id = 'v' + v.id.replace(/[^a-z0-9]/gi, '');

    // Ligne d'horizon : immeubles plus bas et plus cassés quand la ville souffre
    let bats = '', fen = '';
    for (let x = -4; x < W;) {
      const w = 14 + r() * 26, h = (26 + r() * 62) * (1 - deg * 0.45 * r());
      const casse = r() < deg * 1.1;
      bats += batiment(x, w, h, casse, r);
      // Fenêtres allumées : moins nombreuses quand la ville se vide
      for (let yy = SOL - h + 6; yy < SOL - 6; yy += 7) for (let xx = x + 3; xx < x + w - 4; xx += 6)
        if (r() < 0.22 * (1 - deg) + 0.02) fen += `M${f(xx)},${f(yy)}h2.4v3h-2.4z`;
      x += w + r() * 5;
    }

    // Incendies et fumées
    let feux = '', fumees = '';
    const nFeux = Math.round(deg * 9);
    for (let i = 0; i < nFeux; i++) {
      const x = 10 + r() * (W - 20), y = SOL - 8 - r() * 50, s = 4 + r() * 8 * deg + 3;
      feux += `<path d="M${f(x)},${f(y - s * 1.8)}C${f(x + s)},${f(y - s * 0.5)} ${f(x + s * 0.9)},${f(y + s * 0.6)} ${f(x)},${f(y + s * 0.7)}C${f(x - s * 0.9)},${f(y + s * 0.6)} ${f(x - s)},${f(y - s * 0.5)} ${f(x)},${f(y - s * 1.8)}Z"/>`;
      fumees += `<path d="M${f(x)},${f(y)}c${f(-10 - r() * 20)},-20 ${f(20 + r() * 20)},-40 ${f(-10 + r() * 30)},${f(-70 - r() * 50)}" stroke-width="${f(8 + s * 2)}"/>`;
    }

    // Tranches décalées (effet de signal brouillé), plus nombreuses quand l'état baisse
    let tranches = '';
    const nT = Math.round(deg * deg * 7);
    for (let i = 0; i < nT; i++) {
      const y = r() * H, h = 3 + r() * 14 * deg, dx = (r() * 2 - 1) * 26 * deg;
      tranches += `<clipPath id="${id}t${i}"><rect x="0" y="${f(y)}" width="${W}" height="${f(h)}"/></clipPath>
        <use href="#${id}scene" clip-path="url(#${id}t${i})" transform="translate(${f(dx)},0)"/>`;
    }

    const lune = 40 + r() * 240;
    const culte = couleurCulte && deg > 0.25 ? `<rect width="${W}" height="${H}" fill="url(#${id}brume)" style="mix-blend-mode:screen"/>` : '';
    const vrilles = v.image === 'infectee' || (couleurCulte && deg > 0.5)
      ? Array.from({ length: 10 }, () => { const x = r() * W; return `<path d="M${f(x)},${H}c${f(r() * 20 - 10)},-30 ${f(r() * 30 - 15)},-50 ${f(r() * 40 - 20)},${f(-60 - r() * 60)}"/>`; }).join('') : '';
    const sat = (0.15 + (1 - deg) * 0.85).toFixed(2);

    return `<svg class="v-illu" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vue de ${C.esc(v.nom)}, état ${etat} %" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="${id}ciel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="oklch(0.2 0.06 285)"/><stop offset=".7" stop-color="oklch(${(0.38 + deg * 0.1).toFixed(2)} ${(0.08 + deg * 0.08).toFixed(2)} ${Math.round(300 - deg * 270)})"/><stop offset="1" stop-color="oklch(0.5 0.12 ${Math.round(320 - deg * 290)})"/>
        </linearGradient>
        <radialGradient id="${id}brume" cx=".5" cy="1" r="1"><stop offset="0" stop-color="${couleurCulte || '#000'}" stop-opacity="${(deg * 0.7).toFixed(2)}"/><stop offset="1" stop-color="${couleurCulte || '#000'}" stop-opacity="0"/></radialGradient>
        <filter id="${id}f" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="${(0.008 + r() * 0.01).toFixed(4)} ${(0.04 + deg * 0.08).toFixed(3)}" numOctaves="2" seed="${Math.floor(r() * 99)}"/>
          <feDisplacementMap in="SourceGraphic" scale="${f(deg * deg * 24)}" xChannelSelector="R" yChannelSelector="G"/>
          <feColorMatrix type="saturate" values="${sat}"/>
        </filter>
      </defs>
      <g filter="url(#${id}f)">
        <g id="${id}scene">
          <rect width="${W}" height="${H}" fill="url(#${id}ciel)"/>
          <circle class="v-lune" cx="${f(lune)}" cy="${f(28 + r() * 18)}" r="11" opacity="${(0.9 - deg * 0.6).toFixed(2)}"/>
          <g class="v-fumee" opacity="${(0.25 + deg * 0.45).toFixed(2)}">${fumees}</g>
          <path class="v-loin" d="${bats}" transform="translate(0,-10) scale(1,0.9)" opacity=".45"/>
          <path class="v-bat" d="${bats}"/>
          ${(REPERES[v.image] || REPERES.tours)(r)}
          <path class="v-fen" d="${fen}"/>
          <g class="v-feu">${feux}</g>
          <g class="v-vrille" style="stroke:${couleurCulte || '#2fbf5b'}">${vrilles}</g>
          <rect class="v-sol" y="${SOL}" width="${W}" height="${H - SOL}" opacity=".35"/>
          ${culte}
        </g>
        ${tranches}
      </g>
      <rect class="v-grain" width="${W}" height="${H}" opacity="${(0.04 + deg * 0.2).toFixed(2)}"/>
    </svg>`;
  }

  const niveau = e => e >= 85 ? ['Intacte', 'ok'] : e >= 60 ? ['Éprouvée', 'moyen'] : e >= 35 ? ['Assiégée', 'grave'] : e >= 15 ? ['Ravagée', 'critique'] : ['Tombée', 'critique'];
  return { dessiner, niveau };
})();
