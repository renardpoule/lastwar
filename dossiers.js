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
      <article class="dos-texte">${page ? texte(page.contenu) : '<p>Dossier vide.</p>'}</article>
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
