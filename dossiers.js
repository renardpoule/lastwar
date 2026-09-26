// Dossiers des secteurs, façon terminal : ~/secteurs → dossier du secteur → sous-dossier thématique (#armee/ganzir)
(async function () {
  const $ = s => document.querySelector(s), esc = C.esc;
  let data;
  try { data = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json()); }
  catch (e) { $('#contenu').innerHTML = '<p class="t-erreur">cat: data.json: lecture impossible. Rechargez la page.</p>'; return; }

  const dossiers = data.dossiers || {};
  const secteurs = data.secteurs.filter(s => s.geographique === false && dossiers[s.id]);
  const sousDossiers = s => (dossiers[s.id].pages || []).filter(p => p.id !== 'overview');
  const USER = '<span class="t-user">cc@confederation</span>';
  const chemin = (sid, pid) => '~/secteurs' + (sid ? '/' + sid : '') + (pid ? '/' + pid : '');
  const cmd = (sid, pid, c) => `<p class="t-cmd">${USER}:<span class="t-chemin">${esc(chemin(sid, pid))}</span>$ <span class="t-tape">${esc(c)}</span></p>`;
  const lien = (sid, pid) => '#' + (sid ? esc(sid) + (pid ? '/' + esc(pid) : '') : '');

  // Texte des dossiers : "##" titre, "-" puce, **gras**, *italique*, ![légende](img/…) image, ligne vide = nouveau paragraphe
  const enLigne = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  function texte(src) {
    const html = [];
    let liste = null, para = [];
    const finPara = () => { if (para.length) { html.push(`<p>${para.map(enLigne).join(' ')}</p>`); para = []; } };
    const finListe = () => { if (liste) { html.push(`<ul>${liste.map(l => `<li>${enLigne(l)}</li>`).join('')}</ul>`); liste = null; } };
    for (const ligne of (src || '').split('\n')) {
      const l = ligne.trim();
      if (!l) { finPara(); finListe(); continue; }
      const img = /^!\[([^\]]*)\]\(([\w./-]+\.(?:webp|png|jpe?g|gif|avif))\)$/i.exec(l);
      if (img) { finPara(); finListe(); html.push(`<figure class="t-image"><img src="${esc(img[2])}" alt="${esc(img[1])}" loading="lazy"><figcaption>${esc(img[2].split('/').pop())}</figcaption></figure>`); continue; }
      const titre = /^(#{2,3}) (.+)$/.exec(l);
      if (titre) { finPara(); finListe(); html.push(titre[1].length === 2 ? `<h3>${enLigne(titre[2])}</h3>` : `<h4>${enLigne(titre[2])}</h4>`); continue; }
      if (l.startsWith('- ')) { finPara(); (liste ||= []).push(l.slice(2)); continue; }
      finListe(); para.push(l);
    }
    finPara(); finListe();
    return `<div class="t-texte">${html.join('') || '<p class="t-pale">(fichier vide)</p>'}</div>`;
  }

  // Registre des anomalies : une entrée par utilisation, la plus récente en haut
  const USAGES = ['OFFENSIVE', 'DÉFENSIVE', 'RESTRUCTURATION'];
  let filtreUsage = 'TOUS';
  function registre(s, page) {
    const j = page.journal || [];
    const usages = ['TOUS', ...USAGES.filter(u => j.some(e => e.usage === u)), ...[...new Set(j.map(e => e.usage))].filter(u => u && !USAGES.includes(u))];
    const visibles = j.map((e, i) => ({ e, i })).filter(o => filtreUsage === 'TOUS' || o.e.usage === filtreUsage).reverse();
    const ligne = (cle, val, cls = '') => `<span class="t-l"><span class="t-cle">${cle}</span><span class="t-val ${cls}">${esc(val || '—')}</span></span>`;
    return `${cmd(s.id, page.id, 'cat preambule.txt')}
      ${(page.contenu || '').split('\n').filter(Boolean).map(l => `<p class="t-com"># ${esc(l)}</p>`).join('')}
      ${cmd(s.id, page.id, `rca --categorie ${filtreUsage.toLowerCase()}`)}
      <div class="t-filtres" role="group" aria-label="Filtrer par catégorie">${usages.map(u =>
        `<button type="button" class="t-flag ${u === filtreUsage ? 'actif' : ''}" aria-pressed="${u === filtreUsage}" data-usage="${esc(u)}">${esc(u.toLowerCase())}</button>`).join('')}
        <span class="t-pale t-compte">${visibles.length}/${j.length} entrée${j.length > 1 ? 's' : ''}</span></div>
      <ol class="t-journal" reversed>${visibles.map(({ e, i }, k) => `<li class="t-entree" style="--i:${k}">
        <p class="t-tete"><span class="t-date">[${esc(e.date || 'date non consignée')}]</span> <span class="t-num">#${String(i + 1).padStart(3, '0')}</span> <span class="t-usage u-${esc((e.usage || '').toLowerCase().normalize('NFD').replace(/[^a-z]+/g, ''))}">${esc(e.usage || '')}</span></p>
        ${ligne('groupe', e.groupe)}${ligne('anomalie', e.anomalie, 't-fort')}${ligne('lieu', e.lieu)}${ligne('autorisation', e.autorisation)}${ligne('résultat', e.resultat)}</li>`).join('') || '<li class="t-pale">Aucune entrée dans cette catégorie.</li>'}</ol>`;
  }

  // Arborescence, dessinée comme la sortie de "tree"
  function rendreArbre(sid, pid) {
    const noeud = (href, nom, actif, cls = '') => `<a href="${href}" class="noeud ${cls} ${actif ? 'actif' : ''}" ${actif ? 'aria-current="page"' : ''}>${esc(nom)}/</a>`;
    const lignes = [`<li>${noeud('#', '~/secteurs', !sid, 'racine')}</li>`];
    secteurs.forEach((s, i) => {
      const dernier = i === secteurs.length - 1, sous = sousDossiers(s);
      lignes.push(`<li><span class="t-branche" aria-hidden="true">${dernier ? '└── ' : '├── '}</span>${noeud(lien(s.id), s.id, s.id === sid && !pid, s.id === sid ? 'parent' : '')}</li>`);
      sous.forEach((p, k) => lignes.push(`<li><span class="t-branche" aria-hidden="true">${dernier ? '    ' : '│   '}${k === sous.length - 1 ? '└── ' : '├── '}</span>${noeud(lien(s.id, p.id), p.id, s.id === sid && p.id === pid, 'feuille')}</li>`));
    });
    const nbSous = secteurs.reduce((n, s) => n + sousDossiers(s).length, 0);
    $('#arbre').innerHTML = `<ul>${lignes.join('')}</ul><p class="t-pale t-bilan">${secteurs.length} dossiers, ${nbSous} sous-dossiers</p>`;
  }

  // Une ligne de "ls -l" : droits, contenu, nom, description
  const entree = (href, nom, info, desc) => `<li class="t-ls"><span class="t-droits" aria-hidden="true">drwxr-x---</span><span class="t-taille">${esc(info)}</span><a href="${href}" class="t-dossier">${esc(nom)}/</a>${desc ? `<span class="t-desc">${esc(desc)}</span>` : ''}</li>`;

  function vueMonde() {
    return `${cmd('', '', 'cat LISEZMOI')}
      <div class="t-texte"><h2>Secteurs organisationnels</h2><p>Alors que les secteurs géographiques tiennent le terrain, six secteurs sans territoire font tourner la Confédération, de la recherche au renseignement en passant par la justice, l'armée, la santé et l'administration, et chacun tient son propre dossier, mis à jour par son conseiller.</p></div>
      ${cmd('', '', 'ls -l')}
      <ul class="t-liste">${secteurs.map(s => {
        const n = sousDossiers(s).length;
        return entree(lien(s.id), s.id, `${n} sous-dossier${n > 1 ? 's' : ''}`, `${s.nom} · ${dossiers[s.id].resume || ''}`);
      }).join('')}</ul>`;
  }

  function vueSecteur(s) {
    const d = dossiers[s.id], sous = sousDossiers(s), apercu = (d.pages || []).find(p => p.id === 'overview');
    return `${cmd(s.id, '', 'ls -l')}
      <ul class="t-liste">${entree('#', '..', '', '~/secteurs')}${sous.map(p => entree(lien(s.id, p.id), p.id, p.journal ? `${p.journal.length} entrées` : '', p.titre)).join('')}</ul>
      ${cmd(s.id, '', 'cat LISEZMOI')}
      <div class="t-texte"><h2>${esc(s.nom)}</h2><p class="t-chapo">${esc(d.resume || '')}</p></div>
      ${apercu ? texte(apercu.contenu) : ''}
      ${s.districts.length ? `${cmd(s.id, '', 'cat districts.lst')}<ul class="t-districts">${s.districts.map(x =>
        `<li><span class="t-fort">${esc(x.nom)}</span>${x.note ? `<span>${esc(x.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}`;
  }

  // Installations de la carte rattachées à ce dossier, avec leur fiche technique
  function installations(chemin) {
    const liste = [...(data.sites || []), ...(data.satellites || [])].filter(x => x.dossier === chemin && x.fiche && x.fiche.length);
    if (!liste.length) return '';
    return `${cmd(...chemin.split('/'), `ls installations/ | xargs cat`)}<div class="t-installations">${liste.map(x => `<section class="t-inst">
      <h3>${esc(x.nom)}${x.etat ? ` <span class="t-etat">[${esc(x.etat)}]</span>` : ''}</h3>
      ${x.coord ? `<p class="t-pale">${x.coord[1].toFixed(2)}° ${x.coord[1] >= 0 ? 'N' : 'S'}, ${Math.abs(x.coord[0]).toFixed(2)}° ${x.coord[0] >= 0 ? 'E' : 'O'}${x.geo ? ', orbite géostationnaire' : ''}</p>` : '<p class="t-pale">en orbite</p>'}
      ${x.fiche.map(([k, v]) => `<span class="t-l"><span class="t-cle">${esc(k)}</span><span class="t-val">${esc(v)}</span></span>`).join('')}</section>`).join('')}</div>`;
  }

  function vuePage(s, page) {
    return `${cmd(s.id, page.id, 'ls')}
      <ul class="t-liste">${entree(lien(s.id), '..', '', s.nom)}</ul>
      ${page.journal ? `<div class="t-texte"><h2>${esc(page.titre)}</h2></div>${registre(s, page)}`
        : `${cmd(s.id, page.id, 'cat dossier.txt')}<div class="t-texte"><h2>${esc(page.titre)}</h2><p class="t-chapo">${esc(s.nom)}</p></div>${texte(page.contenu)}${installations(s.id + '/' + page.id)}`}`;
  }

  // Invite de commande : cd, ls, cat, tree, help
  let message = '', depuisSaisie = false;
  function saisie(sid, pid) {
    return `<form class="t-saisie" autocomplete="off">
      ${message ? `<pre class="t-reponse">${message}</pre>` : ''}
      <label for="t-cmd">${USER}:<span class="t-chemin">${esc(chemin(sid, pid))}</span>$</label>
      <input id="t-cmd" name="cmd" type="text" spellcheck="false" autocapitalize="off" enterkeyhint="go" aria-describedby="t-aide" placeholder="help">
      <p id="t-aide" class="t-pale t-aide">cd &lt;dossier&gt;, ls, tree, help · Tab complète</p></form>`;
  }
  function resoudre(arg, sid, pid) {
    let pile = [sid, pid].filter(Boolean);
    const cible = (arg || '~').trim().replace(/\/+$/, '');
    if (cible === '~' || cible.startsWith('~/secteurs') || cible.startsWith('/')) { pile = []; }
    for (const part of cible.replace(/^~\/secteurs\/?|^~|^\//, '').split('/').filter(Boolean)) {
      if (part === '.') continue;
      if (part === '..') { pile.pop(); continue; }
      if (pile.length === 0 && secteurs.some(s => s.id === part)) pile.push(part);
      else if (pile.length === 1 && sousDossiers(secteurs.find(s => s.id === pile[0])).some(p => p.id === part)) pile.push(part);
      else return null;
    }
    return pile;
  }
  function enfants(sid, pid) {
    if (!sid) return secteurs.map(s => s.id);
    if (!pid) return sousDossiers(secteurs.find(s => s.id === sid)).map(p => p.id);
    return [];
  }
  function executer(ligne, sid, pid) {
    const [c, ...args] = ligne.trim().split(/\s+/), arg = args.join(' ');
    message = '';
    if (!c) return;
    if (c === 'help') { message = esc('cd <dossier>   ouvrir un dossier (cd .. pour remonter, cd ~ pour la racine)\nls             lister le dossier courant\ntree           afficher l\'arborescence\nclear          effacer ce message'); return; }
    if (c === 'clear') return;
    if (c === 'ls') { const e = enfants(sid, pid); message = esc(e.length ? e.map(x => x + '/').join('   ') : pid ? 'dossier.txt' : ''); return; }
    if (c === 'tree') { const b = $('#arbre-boite'); b.open = true; b.scrollIntoView({ block: 'nearest' }); return; }
    if (c === 'cd' || c === 'cat' || c === 'open') {
      const p = resoudre(arg, sid, pid);
      if (!p) { message = esc(`${c}: ${arg}: dossier introuvable`); return; }
      location.hash = p.join('/');
      return;
    }
    message = esc(`${c}: commande inconnue, tapez help`);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-usage]');
    if (b) { filtreUsage = b.dataset.usage; lire(); }
  });
  document.addEventListener('submit', e => {
    if (!e.target.matches('.t-saisie')) return;
    e.preventDefault();
    const [sid, pid] = etat();
    const avant = location.hash;
    depuisSaisie = true;
    executer(e.target.cmd.value, sid, pid);
    if (location.hash === avant) { lire(); $('#t-cmd').focus(); depuisSaisie = false; }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || e.target.id !== 't-cmd') return;
    const m = e.target.value.match(/^(\s*\S+\s+)(.*)$/);
    if (!m) return;
    const dernier = m[2].lastIndexOf('/'), base = m[2].slice(0, dernier + 1), frag = m[2].slice(dernier + 1);
    const p = base ? resoudre(base, ...etat()) : etat().filter(Boolean);
    if (!p) return;
    const choix = enfants(p[0], p[1]).filter(x => x.startsWith(frag));
    if (choix.length !== 1) return;
    e.preventDefault();
    e.target.value = m[1] + base + choix[0] + '/';
  });

  function etat() {
    const [sid, pid] = decodeURIComponent(location.hash.slice(1)).split('/');
    const s = secteurs.find(x => x.id === sid);
    const page = s && sousDossiers(s).find(p => p.id === pid);
    return [s && s.id, page && page.id];
  }
  function lire() {
    const [sid, pid] = etat();
    const s = secteurs.find(x => x.id === sid), page = s && pid && sousDossiers(s).find(p => p.id === pid);
    rendreArbre(sid, pid);
    $('#contenu').innerHTML = (page ? vuePage(s, page) : s ? vueSecteur(s) : vueMonde()) + saisie(sid, pid);
    document.title = page ? `${page.titre} · ${s.nom}` : s ? `${s.nom} · Dossiers des secteurs` : 'Dossiers des secteurs';
  }

  // L'arborescence reste ouverte sur grand écran, repliée sur téléphone
  const large = matchMedia('(min-width: 901px)');
  const ouvrir = () => { $('#arbre-boite').open = large.matches; };
  large.addEventListener('change', ouvrir);
  ouvrir();

  // Séquence de démarrage à chaque ouverture de la page ; un clic ou une touche la passe
  (function demarrage() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nb = secteurs.reduce((n, s) => n + sousDossiers(s).length, 0);
    const lignes = [
      ['CCOS 7.5.2075 · noyau confédéré, build ' + (data.meta.dateRP || '')],
      ['montage de ~/secteurs', 'ok'],
      ['connexion au réseau tactique confédéré', 'ok'],
      ['liaison HCP', 'surveillée'],
      ['vérification de l\'habilitation', 'accordée'],
      [`indexation : ${secteurs.length} dossiers, ${nb} sous-dossiers`, 'ok'],
      ['chargement du Rapport Confédéral sur l\'Anormal', 'ok'],
      ['diffusion restreinte, toute consultation est journalisée']
    ];
    const el = document.createElement('div');
    el.className = 't-boot';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="t-boot-in"></div><p class="t-boot-passer">cliquer ou appuyer sur une touche pour passer</p>';
    document.body.appendChild(el);
    const zone = el.firstElementChild;
    let i = 0, fini = false;
    const fermer = () => {
      if (fini) return; fini = true;
      el.classList.add('sortie');
      setTimeout(() => el.remove(), 350);
      removeEventListener('keydown', fermer); el.removeEventListener('click', fermer);
    };
    addEventListener('keydown', fermer); el.addEventListener('click', fermer);
    (function suivante() {
      if (fini) return;
      if (i >= lignes.length) { setTimeout(fermer, 700); return; }
      const [txt, res] = lignes[i++];
      zone.insertAdjacentHTML('beforeend', `<p><span class="t-pale">[${(i * 0.137).toFixed(3).padStart(7, ' ')}]</span> ${esc(txt)}${res ? ` <span class="t-boot-res">${esc(res)}</span>` : ''}</p>`);
      setTimeout(suivante, 140 + Math.random() * 160);
    })();
  })();

  window.addEventListener('hashchange', () => {
    if (!large.matches) $('#arbre-boite').open = false;
    lire(); window.scrollTo(0, 0);
    if (depuisSaisie) $('#t-cmd').focus({ preventScroll: true }); else $('#contenu').focus({ preventScroll: true });
    depuisSaisie = false;
  });
  lire();
})();
