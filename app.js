// Carte publique : affichage, navigation, fiches, chronologie.
(async function () {
  const { esc, fmt, sum, fmtDate, districtState, tensionAt, palierFor, findDistrict, allDates, couleur, CONTROLES } = WC;

  const state = {
    data: null,
    dates: [],
    date: null,        // null = en direct
    secteur: null,     // id du secteur zoomé
    district: null,    // id du district ouvert
    playing: null,
  };

  const $ = sel => document.querySelector(sel);
  const svg = d3.select("#map");
  const W = 960, H = 500;
  svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const projection = d3.geoNaturalEarth1().fitExtent([[5, 5], [W - 5, H - 5]], { type: "Sphere" });
  const path = d3.geoPath(projection);
  const root = svg.append("g");
  const zoom = d3.zoom().scaleExtent([1, 40]).translateExtent([[-200, -100], [W + 200, H + 100]])
    .on("zoom", e => {
      root.attr("transform", e.transform);
      root.selectAll(".district-label").attr("font-size", 11 / e.transform.k).attr("stroke-width", 3 / e.transform.k);
      root.selectAll(".country, .district-outline").attr("stroke-width", function () { return (+this.dataset.sw || 0.3) / e.transform.k; });
    });
  svg.call(zoom).on("dblclick.zoom", null);

  // ---------- Chargement ----------
  let data, world;
  try {
    [data, world] = await Promise.all([WC.loadData(), fetch("countries-50m.json").then(r => r.json())]);
  } catch (err) {
    $("#loading").textContent = "Erreur de chargement : " + err.message;
    return;
  }
  state.data = data;
  state.dates = allDates(data);
  $("#loading").remove();
  $("#titre").textContent = data.meta.titre || "Carte de guerre";
  document.title = data.meta.titre || "Carte de guerre";

  const countries = topojson.feature(world, world.objects.countries).features;
  const geomById = new Map(world.objects.countries.geometries.filter(g => g.id).map(g => [g.id, g]));
  const districtOfCountry = new Map();
  for (const s of data.secteurs) for (const d of s.districts) for (const p of d.pays || []) districtOfCountry.set(p, { d, s });

  // ---------- Dessin ----------
  const defs = svg.append("defs");
  defs.append("pattern").attr("id", "hatch").attr("patternUnits", "userSpaceOnUse").attr("width", 4).attr("height", 4)
    .attr("patternTransform", "rotate(45)")
    .append("rect").attr("width", 2).attr("height", 4).attr("fill", "rgba(0,0,0,.35)");

  root.append("path").attr("class", "sphere").attr("d", path({ type: "Sphere" }));
  root.append("path").attr("class", "graticule").attr("d", path(d3.geoGraticule10()));

  const countryPaths = root.append("g").selectAll("path").data(countries).join("path")
    .attr("class", d => "country" + (districtOfCountry.has(d.id) ? " assigned" : ""))
    .attr("d", path)
    .attr("data-sw", 0.3);

  const hatchPaths = root.append("g").attr("pointer-events", "none").selectAll("path").data(countries.filter(c => districtOfCountry.has(c.id))).join("path")
    .attr("d", path).attr("fill", "url(#hatch)");

  const mapDistricts = data.secteurs.flatMap(s => s.districts.filter(d => (d.pays || []).some(p => geomById.has(p))).map(d => ({ d, s })));
  const merged = new Map(mapDistricts.map(({ d }) => [d.id, topojson.merge(world, d.pays.map(p => geomById.get(p)).filter(Boolean))]));

  root.append("g").attr("pointer-events", "none").selectAll("path").data(mapDistricts).join("path")
    .attr("class", "district-outline").attr("data-sw", 0.9)
    .attr("d", x => path(merged.get(x.d.id)));

  const sectorOutlines = root.append("g").attr("pointer-events", "none").selectAll("path").data(data.secteurs.filter(s => s.districts.some(d => merged.has(d.id)))).join("path")
    .attr("class", "district-outline sector-outline").attr("data-sw", 1.8)
    .attr("d", s => path(topojson.merge(world, s.districts.flatMap(d => (d.pays || []).map(p => geomById.get(p)).filter(Boolean)))));

  const labels = root.append("g").attr("pointer-events", "none").selectAll("text").data(mapDistricts).join("text")
    .attr("class", "district-label")
    .attr("transform", x => {
      const c = path.centroid(largestPolygon(merged.get(x.d.id)));
      return `translate(${c[0]},${c[1]})`;
    })
    .text(x => x.d.nom);

  function largestPolygon(feature) {
    if (feature.type !== "MultiPolygon") return feature;
    let best = null, area = -1;
    for (const coords of feature.coordinates) {
      const poly = { type: "Polygon", coordinates: coords };
      const a = d3.geoArea(poly);
      if (a > area) { area = a; best = poly; }
    }
    return best;
  }

  // ---------- Interaction carte ----------
  const tip = $("#tooltip");
  countryPaths
    .on("mousemove", (e, c) => {
      const x = districtOfCountry.get(c.id);
      if (!x) { tip.hidden = true; return; }
      const st = districtState(x.d, state.date);
      tip.innerHTML = `<strong>${esc(x.d.nom)}</strong><br><span class="muted">${esc(x.s.nom)} · ${esc(c.properties.name)}</span><br>${badge(st.controle)}`;
      const r = $(".map-wrap").getBoundingClientRect();
      tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 200) + "px";
      tip.style.top = (e.clientY - r.top + 12) + "px";
      tip.hidden = false;
    })
    .on("mouseleave", () => { tip.hidden = true; })
    .on("click", (e, c) => {
      const x = districtOfCountry.get(c.id);
      if (!x) return;
      if (state.secteur !== x.s.id) selectSecteur(x.s.id);
      else selectDistrict(x.d.id);
    });

  $("#btn-monde").onclick = () => { state.district = null; selectSecteur(null); };

  function zoomToSecteur(s, animate = true) {
    let t = d3.zoomIdentity;
    if (s) {
      let [[x0, y0], [x1, y1]] = [[Infinity, Infinity], [-Infinity, -Infinity]];
      if (s.cadrage) {
        const [[lo0, la0], [lo1, la1]] = s.cadrage;
        for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
          const p = projection([lo0 + (lo1 - lo0) * i / 10, la0 + (la1 - la0) * j / 10]);
          if (!p) continue;
          x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
        }
      } else {
        const feats = s.districts.map(d => merged.get(d.id)).filter(Boolean);
        if (!feats.length) return;
        [[x0, y0], [x1, y1]] = path.bounds({ type: "FeatureCollection", features: feats.map(g => ({ type: "Feature", geometry: g })) });
      }
      if (isFinite(x0)) {
        const k = Math.min(40, 0.92 / Math.max((x1 - x0) / W, (y1 - y0) / H));
        t = d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      }
    }
    (animate ? svg.transition().duration(750) : svg).call(zoom.transform, t);
  }

  // ---------- Rendu ----------
  function badge(controle) {
    return `<span class="badge badge-${esc(controle)}">${esc(CONTROLES[controle] || controle)}</span>`;
  }

  function intensityBars(n) {
    n = Math.max(0, Math.min(5, +n || 0));
    return `<span class="intensity" title="Intensité des combats : ${n}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
  }

  function paintMap() {
    countryPaths.style("fill", c => {
      const x = districtOfCountry.get(c.id);
      if (!x) return null;
      return couleur(data, districtState(x.d, state.date).controle);
    }).classed("active", c => {
      const x = districtOfCountry.get(c.id);
      return !!x && (x.d.id === state.district);
    }).classed("dim", c => {
      const x = districtOfCountry.get(c.id);
      return sectorOnMap() && (!x || x.s.id !== state.secteur);
    });
    hatchPaths.attr("opacity", c => {
      const x = districtOfCountry.get(c.id);
      const st = districtState(x.d, state.date);
      const dim = sectorOnMap() && x.s.id !== state.secteur ? 0.3 : 1;
      return st.controle === "conteste" ? dim * Math.min(1, 0.3 + (st.intensite || 0) * 0.15) : 0;
    });
    labels.attr("display", x => state.secteur === x.s.id ? null : "none");
    sectorOutlines.classed("current", s => s.id === state.secteur);
  }

  // Le secteur sélectionné a-t-il au moins un district visible sur la carte ?
  function sectorOnMap() {
    const s = state.secteur && data.secteurs.find(x => x.id === state.secteur);
    return !!s && s.districts.some(d => merged.has(d.id));
  }

  function renderLegend() {
    $("#legend").innerHTML = ["confederation", "conteste", "cultistes"].map(k =>
      `<span><i style="background:${esc(couleur(data, k))}"></i>${esc(CONTROLES[k])}</span>`).join("");
  }

  function countByControle(districts) {
    const c = { confederation: 0, conteste: 0, cultistes: 0 };
    districts.forEach(d => { const k = districtState(d, state.date).controle; c[k] = (c[k] || 0) + 1; });
    return c;
  }

  function controlBar(c) {
    const total = c.confederation + c.conteste + c.cultistes || 1;
    return `<div class="ctrl-bar">${["confederation", "conteste", "cultistes"].map(k =>
      c[k] ? `<span style="flex:${c[k]};background:${esc(couleur(data, k))}" title="${esc(CONTROLES[k])} : ${c[k]}"></span>` : "").join("")}</div>
      <div class="ctrl-legend muted">${c.confederation} tenus · ${c.conteste} contestés · ${c.cultistes} perdus</div>`;
  }

  function renderZones() {
    const pane = $("#pane-zones");
    if (state.district) return renderFiche(pane);
    if (state.secteur) {
      const s = data.secteurs.find(x => x.id === state.secteur);
      pane.innerHTML = `
        <div class="crumbs"><a href="#" data-go="monde">Monde</a> › ${esc(s.nom)}</div>
        <h2>${esc(s.nom)}</h2>
        ${s.description ? `<p class="muted">${esc(s.description)}</p>` : ""}
        ${controlBar(countByControle(s.districts))}
        <ul class="list">${s.districts.map(d => {
          const st = districtState(d, state.date);
          return `<li><button data-district="${esc(d.id)}"><i class="dot" style="background:${esc(couleur(data, st.controle))}"></i>
            <span class="grow">${esc(d.nom)}${(d.pays || []).length ? "" : ' <span class="tag">hors carte</span>'}</span>${intensityBars(st.intensite)}</button></li>`;
        }).join("")}</ul>`;
      return;
    }
    const all = data.secteurs.flatMap(s => s.districts);
    pane.innerHTML = `
      <h2>Situation mondiale</h2>
      ${controlBar(countByControle(all))}
      <p class="muted small">Cliquez sur un secteur pour zoomer, puis sur un district pour ouvrir sa fiche.</p>
      <ul class="list">${data.secteurs.map(s => {
        const c = countByControle(s.districts);
        const onMap = s.districts.some(d => merged.has(d.id));
        return `<li><button data-secteur="${esc(s.id)}"><span class="grow"><strong>${esc(s.nom)}</strong>${onMap ? "" : ' <span class="tag">hors carte</span>'}<br>
          <span class="muted small">${s.districts.length} districts · ${c.conteste} contestés · ${c.cultistes} perdus</span></span>›</button></li>`;
      }).join("")}</ul>`;
  }

  function effectifsBlock(nomFaction, color, list) {
    const total = sum((list || []).map(u => u.nombre));
    return `<details class="effectifs">
      <summary><i class="dot" style="background:${esc(color)}"></i><span class="grow">${esc(nomFaction)}</span><strong>${list && list.length ? fmt(total) : "—"}</strong></summary>
      ${list && list.length ? `<table>${list.map(u => `<tr><td>${esc(u.unite)}</td><td class="num">${fmt(u.nombre)}</td></tr>`).join("")}</table>` : '<p class="muted small">Aucune unité signalée.</p>'}
    </details>`;
  }

  function renderFiche(pane) {
    const f = findDistrict(data, state.district);
    if (!f) { state.district = null; return renderZones(); }
    const { district: d, secteur: s } = f;
    const st = districtState(d, state.date);
    const hist = [...(d.historique || [])].filter(h => !state.date || h.date <= state.date).sort((a, b) => b.date.localeCompare(a.date));
    const evts = data.evenements.filter(e => e.district === d.id && (!state.date || e.date <= state.date)).sort((a, b) => b.date.localeCompare(a.date));
    const c = d.civils || {}, p = d.pertes || {}, e = d.effectifs || {};
    pane.innerHTML = `
      <div class="crumbs"><a href="#" data-go="monde">Monde</a> › <a href="#" data-secteur="${esc(s.id)}">${esc(s.nom)}</a> › ${esc(d.nom)}</div>
      <div class="fiche-head">
        <h2>${esc(d.nom)}</h2>
        <button class="small-btn" id="btn-share" type="button" title="Copier le lien vers cette fiche">🔗 Partager</button>
      </div>
      <div class="status-row">${badge(st.controle)} ${intensityBars(st.intensite)}</div>

      <h3>Population civile</h3>
      <table class="stats">
        <tr><td>Population</td><td class="num">${fmt(c.population)}</td></tr>
        <tr><td>Déplacés</td><td class="num">${fmt(c.deplaces)}</td></tr>
        <tr><td>Victimes civiles</td><td class="num">${fmt(c.victimes)}</td></tr>
      </table>

      <h3>Effectifs engagés</h3>
      ${effectifsBlock(data.factions.confederation.nom, couleur(data, "confederation"), e.confederation)}
      ${effectifsBlock(data.factions.cultistes.nom, couleur(data, "cultistes"), e.cultistes)}

      <h3>Pertes militaires</h3>
      <table class="stats">
        <tr><td>${esc(data.factions.confederation.nom)}</td><td class="num">${fmt(p.confederation)}</td></tr>
        <tr><td>${esc(data.factions.cultistes.nom)}</td><td class="num">${fmt(p.cultistes)}</td></tr>
      </table>

      ${d.notes ? `<h3>Rapport</h3><p class="notes">${esc(d.notes)}</p>` : ""}

      <h3>Événements</h3>
      ${evts.length ? `<ul class="events">${evts.map(eventItem).join("")}</ul>` : '<p class="muted small">Aucun événement enregistré.</p>'}

      <h3>Historique du contrôle</h3>
      <ul class="history">${hist.map(h => `<li><span class="muted small">${fmtDate(h.date)}</span> ${badge(h.controle)} ${intensityBars(h.intensite)}</li>`).join("")}</ul>`;
    $("#btn-share").onclick = async () => {
      const url = location.href;
      try { await navigator.clipboard.writeText(url); $("#btn-share").textContent = "✓ Lien copié"; }
      catch { prompt("Copiez ce lien :", url); }
    };
  }

  function eventItem(e) {
    const f = e.district ? findDistrict(data, e.district) : null;
    return `<li class="event grav-${esc(e.gravite)}">
      <div class="event-meta"><span class="grav">${esc({ info: "Info", important: "Important", critique: "Critique" }[e.gravite] || e.gravite)}</span>
      <span class="muted small">${fmtDate(e.date)}</span></div>
      <strong>${esc(e.titre)}</strong>
      ${e.description ? `<p>${esc(e.description)}</p>` : ""}
      ${f ? `<a href="#" class="small" data-district="${esc(f.district.id)}">📍 ${esc(f.district.nom)}</a>` : ""}
    </li>`;
  }

  function renderEvents() {
    const evts = data.evenements.filter(e => !state.date || e.date <= state.date).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    $("#pane-events").innerHTML = `<h2>Événements récents</h2>` +
      (evts.length ? `<ul class="events">${evts.map(eventItem).join("")}</ul>` : '<p class="muted">Aucun événement à cette date.</p>');
  }

  function renderTension() {
    const v = tensionAt(data, state.date);
    const pal = palierFor(data, v);
    const paliers = [...data.tension.paliers].sort((a, b) => a.seuil - b.seuil);
    const colors = ["#3f9a5b", "#b6b33a", "#e0a526", "#d9622b", "#b3202a"];
    const minutes = Math.max(0, Math.round((100 - v) * 0.6));
    $("#tb-value").textContent = v;
    $("#tb-palier").textContent = pal.nom;
    $("#tension-badge").style.setProperty("--tc", colors[Math.min(4, paliers.indexOf(pal))]);

    // Jauge en demi-cercle
    const cx = 120, cy = 110, r = 90;
    const ang = x => Math.PI * (1 - x / 100);
    const pt = (x, rr) => [cx + rr * Math.cos(ang(x)), cy - rr * Math.sin(ang(x))];
    const arcs = paliers.map((p, i) => {
      const a = p.seuil, b = i + 1 < paliers.length ? paliers[i + 1].seuil : 100;
      const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r);
      return `<path d="M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}" stroke="${colors[Math.min(4, i)]}" stroke-width="18" fill="none" opacity="${p === pal ? 1 : 0.35}"/>`;
    }).join("");
    const [nx, ny] = pt(v, r - 22);
    const hist = [...data.tension.historique].filter(h => !state.date || h.date <= state.date).sort((a, b) => b.date.localeCompare(a.date));

    $("#pane-tension").innerHTML = `
      <h2>Horloge de Tension</h2>
      <svg class="gauge" viewBox="0 0 240 130">
        ${arcs}
        <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" class="needle"/>
        <circle cx="${cx}" cy="${cy}" r="6" class="needle-hub"/>
      </svg>
      <p class="gauge-value">${v}<span class="muted"> / 100</span></p>
      <p class="clock">${minutes === 0 ? "MINUIT" : `${minutes} min avant minuit`}</p>
      <div class="palier" style="border-color:${colors[Math.min(4, paliers.indexOf(pal))]}">
        <strong>Palier ${paliers.indexOf(pal) + 1} — ${esc(pal.nom)}</strong>
        <p class="muted">${esc(pal.description || "")}</p>
        <h3>Armes autorisées</h3>
        <ul class="armes">${paliers.filter(p => p.seuil <= pal.seuil).flatMap(p => p.armes || []).filter((a, i, arr) => arr.indexOf(a) === i).map(a => `<li>${esc(a)}</li>`).join("")}</ul>
      </div>
      <h3>Paliers</h3>
      <ol class="paliers">${paliers.map((p, i) => `<li class="${p === pal ? "current" : ""}"><i class="dot" style="background:${colors[Math.min(4, i)]}"></i><span class="grow">${esc(p.nom)}</span><span class="muted small">≥ ${p.seuil}</span></li>`).join("")}</ol>
      <h3>Évolution</h3>
      <ul class="history">${hist.map(h => `<li><span class="muted small">${fmtDate(h.date)}</span> <strong>${h.valeur}</strong> ${esc(h.note || "")}</li>`).join("")}</ul>`;
  }

  function renderTimeline() {
    const r = $("#timeline");
    r.max = Math.max(0, state.dates.length - 1);
    const idx = state.date ? state.dates.indexOf(state.date) : state.dates.length - 1;
    r.value = idx;
    const shown = state.date || state.dates[state.dates.length - 1];
    $("#timeline-date").textContent = shown ? fmtDate(shown).replace(/<[^>]+>/g, "") : "–";
    $("#timeline-live").hidden = !!state.date;
  }

  function render() {
    paintMap();
    renderZones();
    renderEvents();
    renderTension();
    renderTimeline();
    $("#btn-monde").hidden = !state.secteur;
    writeHash();
  }

  // ---------- Navigation ----------
  function selectSecteur(id, animate = true) {
    state.secteur = id;
    if (!id) state.district = null;
    const s = data.secteurs.find(x => x.id === id);
    zoomToSecteur(s, animate);
    showTab("zones");
    render();
  }

  function selectDistrict(id) {
    const f = findDistrict(data, id);
    if (!f) return;
    state.district = id;
    if (state.secteur !== f.secteur.id) { state.secteur = f.secteur.id; zoomToSecteur(f.secteur); }
    showTab("zones");
    render();
    $(".panel-body").scrollTop = 0;
    if (window.matchMedia("(max-width: 800px)").matches) $(".panel").scrollIntoView({ behavior: "smooth" });
  }

  function showTab(name) {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("active", p.dataset.pane === name));
  }

  document.querySelector(".tabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]");
    if (b) showTab(b.dataset.tab);
  });
  $("#tension-badge").onclick = () => showTab("tension");

  document.querySelector(".panel").addEventListener("click", e => {
    const a = e.target.closest("[data-district],[data-secteur],[data-go]");
    if (!a) return;
    e.preventDefault();
    if (a.dataset.district) selectDistrict(a.dataset.district);
    else if (a.dataset.secteur) { state.district = null; selectSecteur(a.dataset.secteur); }
    else if (a.dataset.go === "monde") selectSecteur(null);
  });

  // ---------- Chronologie ----------
  $("#timeline").addEventListener("input", e => {
    stopPlay();
    const i = +e.target.value;
    state.date = i >= state.dates.length - 1 ? null : state.dates[i];
    render();
  });
  $("#btn-live").onclick = () => { stopPlay(); state.date = null; render(); };
  $("#btn-play").onclick = () => {
    if (state.playing) return stopPlay();
    let i = 0;
    state.date = state.dates[0];
    render();
    $("#btn-play").textContent = "❚❚";
    state.playing = setInterval(() => {
      i++;
      if (i >= state.dates.length - 1) { state.date = null; render(); return stopPlay(); }
      state.date = state.dates[i];
      render();
    }, 1400);
  };
  function stopPlay() {
    if (state.playing) clearInterval(state.playing);
    state.playing = null;
    $("#btn-play").textContent = "▶";
  }

  // ---------- Liens partageables ----------
  function writeHash() {
    const p = new URLSearchParams();
    if (state.secteur) p.set("secteur", state.secteur);
    if (state.district) p.set("district", state.district);
    if (state.date) p.set("date", state.date);
    const h = p.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const date = p.get("date");
    state.date = date && state.dates.includes(date) ? date : null;
    const d = p.get("district"), s = p.get("secteur");
    const f = d && findDistrict(data, d);
    if (f) { state.district = d; state.secteur = f.secteur.id; }
    else if (s && data.secteurs.some(x => x.id === s)) state.secteur = s;
    zoomToSecteur(data.secteurs.find(x => x.id === state.secteur), false);
  }

  renderLegend();
  readHash();
  render();
})();
