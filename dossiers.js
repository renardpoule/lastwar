// Dossiers des secteurs : Monde → secteur organisationnel → sous-dossier (#renseignement/atmosphere)
(async function () {
  const $ = s => document.querySelector(s), esc = C.esc;
  let data;
  try { data = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json()); }
  catch (e) { $('#contenu').innerHTML = '<p class="ds-supporting">Impossible de lire les dossiers. Rechargez la page.</p>'; return; }

  const dossiers = data.dossiers || {};
  const secteurs = data.secteurs.filter(s => s.geographique === false && dossiers[s.id]);

  // Texte des dossiers : « ## » titre, « - » puce, ligne vide = nouveau paragraphe
  function texte(src) {
    const html = [];
    let liste = null, para = [];
    const finPara = () => { if (para.length) { html.push(`<p>${para.map(esc).join(' ')}</p>`); para = []; } };
    const finListe = () => { if (liste) { html.push(`<ul>${liste.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`); liste = null; } };
    for (const ligne of (src || '').split('\n')) {
      const l = ligne.trim();
      if (!l) { finPara(); finListe(); continue; }
      if (l.startsWith('## ')) { finPara(); finListe(); html.push(`<h3>${esc(l.slice(3))}</h3>`); continue; }
      if (l.startsWith('- ')) { finPara(); (liste ||= []).push(l.slice(2)); continue; }
      finListe(); para.push(l);
    }
    finPara(); finListe();
    return html.join('');
  }

  // Registre façon terminal : une entrée par utilisation d'anomalie, la plus récente en haut
  const USAGES = ['NEUTRALISATION', 'CONFINEMENT', 'CIVIL', 'PLANIFICATION', 'AUGMENTATION', 'RECHERCHE', 'PERTE DE CONTRÔLE'];
  let filtreUsage = 'TOUS';
  function terminal(page) {
    const j = page.journal || [];
    const usages = ['TOUS', ...USAGES.filter(u => j.some(e => e.usage === u)), ...[...new Set(j.map(e => e.usage))].filter(u => u && !USAGES.includes(u))];
    const visibles = j.map((e, i) => ({ e, i })).filter(o => filtreUsage === 'TOUS' || o.e.usage === filtreUsage).reverse();
    const ligne = (cle, val, cls = '') => `<span class="t-l"><span class="t-cle">${cle}</span><span class="t-val ${cls}">${esc(val || '—')}</span></span>`;
    return `<section class="terminal" aria-label="Registre des utilisations d'anomalies">
      <div class="t-barre"><span class="t-points" aria-hidden="true"><i></i><i></i><i></i></span><span>rca://registre-anormal</span><span class="t-compte">${j.length} entrée${j.length > 1 ? 's' : ''}</span></div>
      <div class="t-corps">
        ${(page.contenu || '').split('\n').filter(Boolean).map(l => `<p class="t-com"># ${esc(l)}</p>`).join('')}
        <div class="t-filtres" role="group" aria-label="Filtrer par usage"><span class="t-invite" aria-hidden="true">$ rca --usage</span>${usages.map(u =>
          `<button type="button" class="t-flag ${u === filtreUsage ? 'actif' : ''}" aria-pressed="${u === filtreUsage}" data-usage="${esc(u)}">${esc(u.toLowerCase())}</button>`).join('')}</div>
        <ol class="t-journal" reversed>${visibles.map(({ e, i }, k) => `<li class="t-entree" style="--i:${k}">
          <p class="t-tete"><span class="t-date">[${esc(e.date || 'date non consignée')}]</span> <span class="t-num">#${String(i + 1).padStart(3, '0')}</span> <span class="t-usage u-${esc((e.usage || '').toLowerCase().replace(/[^a-z]+/g, '-'))}">${esc(e.usage || '')}</span></p>
          ${ligne('anomalie', e.anomalie, 't-fort')}${ligne('lieu', e.lieu)}${ligne('autorisation', e.autorisation)}${ligne('résultat', e.resultat)}</li>`).join('') || '<li class="t-vide">Aucune entrée pour cet usage.</li>'}</ol>
        <p class="t-invite fin" aria-hidden="true">$ <span class="t-curseur"></span></p>
      </div></section>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-usage]');
    if (b) { filtreUsage = b.dataset.usage; lire(); }
  });

  function rendreArbre(sid, pid) {
    $('#arbre').innerHTML = `<ul class="arbre-racine"><li>
      <a href="#" class="noeud ${!sid ? 'actif' : ''}" ${!sid ? 'aria-current="page"' : ''}>Monde</a>
      <ul>${secteurs.map(s => {
        const pages = dossiers[s.id].pages || [];
        const ouvert = s.id === sid;
        return `<li><a href="#${esc(s.id)}" class="noeud ${ouvert && (!pid || pid === 'overview') ? 'actif' : ouvert ? 'parent' : ''}" ${ouvert && (!pid || pid === 'overview') ? 'aria-current="page"' : ''}>${esc(s.nom)}</a>
          ${pages.filter(p => p.id !== 'overview').length ? `<ul>${pages.filter(p => p.id !== 'overview').map(p =>
            `<li><a href="#${esc(s.id)}/${esc(p.id)}" class="noeud feuille ${ouvert && pid === p.id ? 'actif' : ''}" ${ouvert && pid === p.id ? 'aria-current="page"' : ''}>${esc(p.titre)}</a></li>`).join('')}</ul>` : ''}</li>`;
      }).join('')}</ul></li></ul>`;
  }

  function vueMonde() {
    return `<header class="dos-tete"><p class="surtitre">Monde</p><h2 class="ds-display">Secteurs organisationnels</h2>
      <p class="chapo">Six secteurs sans territoire font tourner la Confédération : la recherche, le renseignement, la justice, l'armée, la santé et l'administration. Chacun tient son dossier, mis à jour par son conseiller.</p></header>
      <div class="dos-cartes">${secteurs.map(s => {
        const d = dossiers[s.id], sous = (d.pages || []).filter(p => p.id !== 'overview');
        return `<a class="dos-carte" href="#${esc(s.id)}"><span class="nom">${esc(s.nom)}</span><span class="resume">${esc(d.resume || '')}</span>
          <span class="pied">${s.districts.length} district${s.districts.length > 1 ? 's' : ''}${sous.length ? ' · ' + sous.map(p => esc(p.titre)).join(', ') : ''}</span></a>`;
      }).join('')}</div>`;
  }

  function vueSecteur(s, pid) {
    const d = dossiers[s.id], pages = d.pages || [];
    const page = pages.find(p => p.id === pid) || pages[0];
    return `<header class="dos-tete"><p class="surtitre"><a href="#">Monde</a> / ${esc(s.nom)}</p><h2 class="ds-display">${esc(page && page.id !== 'overview' ? page.titre : s.nom)}</h2>
      <p class="chapo">${esc(d.resume || '')}</p></header>
      ${pages.length > 1 ? `<div class="ds-tabs dos-onglets" role="tablist" aria-label="Dossiers du secteur ${esc(s.nom)}">${pages.map(p =>
        `<a class="ds-tab ${p === page ? 'active' : ''}" role="tab" aria-selected="${p === page}" href="#${esc(s.id)}${p.id === 'overview' ? '' : '/' + esc(p.id)}">${esc(p.titre)}</a>`).join('')}</div>` : ''}
      ${page && page.journal ? terminal(page) : `<article class="dos-texte">${page ? texte(page.contenu) : '<p>Dossier vide.</p>'}</article>`}
      ${(!page || page.id === 'overview') && s.districts.length ? `<section class="dos-districts"><h3 class="ds-section-title">Districts</h3><ul>${s.districts.map(x =>
        `<li><strong>${esc(x.nom)}</strong>${x.note ? `<span>${esc(x.note)}</span>` : ''}</li>`).join('')}</ul></section>` : ''}`;
  }

  function lire() {
    const [sid, pid] = decodeURIComponent(location.hash.slice(1)).split('/');
    const s = secteurs.find(x => x.id === sid);
    rendreArbre(s && s.id, pid);
    $('#contenu').innerHTML = s ? vueSecteur(s, pid) : vueMonde();
    document.title = s ? `${s.nom} · Dossiers des secteurs` : 'Dossiers des secteurs';
  }
  window.addEventListener('hashchange', () => { lire(); $('#contenu').focus({ preventScroll: true }); window.scrollTo(0, 0); });
  lire();
})();
