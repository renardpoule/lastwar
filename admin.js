// Panneau d'administration : édition des données, brouillon local, publication GitHub, annonces Discord.
(async function () {
  const { esc, fmtDate, CONTROLES, districtState, tensionAt, palierFor, findDistrict } = WC;
  const $ = s => document.querySelector(s);
  const DRAFT_KEY = "wc-brouillon";
  const SETTINGS_KEY = "wc-reglages";

  const store = {
    get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
  };

  let published, data, countryNames = new Map();
  try {
    published = await WC.loadData();
  } catch (err) {
    document.querySelector(".admin-main").innerHTML = `<p class="error">Impossible de charger data.json : ${esc(err.message)}</p>`;
    return;
  }
  data = store.get(DRAFT_KEY, null) || structuredClone(published);
  try {
    const w = await fetch("countries-50m.json").then(r => r.json());
    w.objects.countries.geometries.forEach(g => g.id && countryNames.set(g.id, g.properties.name));
  } catch { /* noms de pays facultatifs */ }

  const settings = Object.assign({ owner: "", repo: "", branch: "", path: "data.json", token: "", webhook: "" }, store.get(SETTINGS_KEY, {}));
  guessRepo();
  let currentDistrict = data.secteurs[0]?.districts[0]?.id || null;
  let editingEvent = null;

  // ---------- Utilitaires ----------
  const today = () => new Date().toISOString().slice(0, 10);

  function toast(msg, isError = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast" + (isError ? " error" : "");
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 3500);
  }

  function save() {
    store.set(DRAFT_KEY, data);
    updateDraftStatus();
  }

  function updateDraftStatus() {
    const dirty = JSON.stringify(data) !== JSON.stringify(published);
    $("#draft-status").innerHTML = dirty
      ? '<span class="dirty">● Modifications non publiées</span>'
      : '<span class="clean">✓ À jour avec le site</span>';
  }

  // Saisie avec brouillard de guerre : vide = classifié, "?" = inconnu, "~1200" = estimation.
  function parseFog(v) {
    v = String(v).trim().replace(/\s/g, "");
    if (v === "") return null;
    if (v === "?") return "?";
    if (v.startsWith("~") || v.startsWith("≈")) return "~" + v.slice(1).replace(",", ".");
    const n = Number(v.replace(",", "."));
    return isNaN(n) ? v : n;
  }
  const showFog = v => (v === null || v === undefined ? "" : String(v));

  function slug(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
  }
  function uniqueId(base, exists) {
    let id = base, i = 2;
    while (exists(id)) id = base + "-" + i++;
    return id;
  }
  const districtExists = id => !!findDistrict(data, id);

  function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
  function setPath(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    keys.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== "object") o[k] = {}; o = o[k]; });
    o[keys[keys.length - 1]] = value;
  }

  // Champs liés : data-path="a.b" data-kind="text|num|fog" sur un objet cible.
  function bindInputs(container, target, onChange) {
    container.querySelectorAll("[data-path]").forEach(el => {
      el.addEventListener("change", () => {
        const kind = el.dataset.kind || "text";
        let v = el.value;
        if (kind === "num") v = v === "" ? 0 : Number(v);
        else if (kind === "fog") v = parseFog(v);
        setPath(target(), el.dataset.path, v);
        save();
        onChange && onChange(el);
      });
    });
  }

  function districtOptions(selected, allowNone) {
    return (allowNone ? `<option value="">— Aucun (global) —</option>` : "") +
      data.secteurs.map(s => `<optgroup label="${esc(s.nom)}">${s.districts.map(d =>
        `<option value="${esc(d.id)}" ${d.id === selected ? "selected" : ""}>${esc(d.nom)}</option>`).join("")}</optgroup>`).join("");
  }

  const controleOptions = sel => Object.entries(CONTROLES).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");

  // ---------- Tension ----------
  function renderTension() {
    const t = data.tension;
    const v = tensionAt(data, null);
    const pal = palierFor(data, v);
    const hist = [...t.historique].sort((a, b) => b.date.localeCompare(a.date));
    const pane = $("#pane-tension");
    pane.innerHTML = `
      <div class="card">
        <h2>Niveau actuel : ${v} — ${esc(pal.nom)}</h2>
        <p class="muted">Chaque réglage est daté : la chronologie de la carte rejoue ces valeurs.</p>
        <div class="form-row">
          <label>Date <input type="date" id="t-date" value="${today()}"></label>
          <label class="grow">Valeur : <strong id="t-val-out">${v}</strong>
            <input type="range" id="t-val" min="0" max="100" value="${v}"></label>
        </div>
        <label>Note (raison du changement) <input type="text" id="t-note" placeholder="ex. Chute du plateau iranien"></label>
        <div class="form-row">
          <label class="check"><input type="checkbox" id="t-discord" ${settings.webhook ? "" : "disabled"}> Annoncer sur Discord</label>
          <button class="primary" id="t-add">Enregistrer ce niveau</button>
        </div>
      </div>

      <div class="card">
        <h2>Historique</h2>
        <table class="grid">
          <tr><th>Date</th><th>Valeur</th><th>Note</th><th></th></tr>
          ${hist.map(h => `<tr><td>${fmtDate(h.date)}</td><td>${h.valeur}</td><td>${esc(h.note || "")}</td>
            <td><button class="icon-btn" data-del-t="${esc(h.date)}" title="Supprimer">✕</button></td></tr>`).join("")}
        </table>
      </div>

      <div class="card">
        <h2>Paliers</h2>
        <p class="muted">Seuil minimal (0–100), nom, description et armes autorisées (une par ligne). Les armes des paliers inférieurs restent autorisées.</p>
        ${t.paliers.map((p, i) => `
          <fieldset class="palier-edit">
            <legend>Palier ${i + 1}</legend>
            <div class="form-row">
              <label>Seuil <input type="number" min="0" max="100" data-path="${i}.seuil" data-kind="num" value="${p.seuil}"></label>
              <label class="grow">Nom <input type="text" data-path="${i}.nom" value="${esc(p.nom)}"></label>
            </div>
            <label>Description <input type="text" data-path="${i}.description" value="${esc(p.description || "")}"></label>
            <label>Armes autorisées <textarea rows="3" data-armes="${i}">${esc((p.armes || []).join("\n"))}</textarea></label>
          </fieldset>`).join("")}
      </div>`;

    $("#t-val").oninput = e => ($("#t-val-out").textContent = e.target.value);
    $("#t-add").onclick = () => {
      const date = $("#t-date").value || today();
      const entry = { date, valeur: +$("#t-val").value, note: $("#t-note").value.trim() };
      const before = palierFor(data, tensionAt(data, null));
      t.historique = t.historique.filter(h => h.date !== date).concat(entry);
      save();
      const after = palierFor(data, tensionAt(data, null));
      if ($("#t-discord").checked) {
        discord({
          title: `Horloge de Tension : ${entry.valeur}/100 — ${after.nom}`,
          description: (before !== after ? `**Changement de palier** : ${before.nom} → ${after.nom}\n` : "") + (entry.note || ""),
          color: 0xd9a441,
        });
      }
      toast("Niveau de tension enregistré.");
      renderTension();
    };
    pane.querySelectorAll("[data-del-t]").forEach(b => b.onclick = () => {
      if (!confirm("Supprimer cette entrée ?")) return;
      t.historique = t.historique.filter(h => h.date !== b.dataset.delT);
      save(); renderTension();
    });
    bindInputs(pane.querySelector(".card:last-child"), () => t.paliers);
    pane.querySelectorAll("[data-armes]").forEach(el => el.onchange = () => {
      t.paliers[+el.dataset.armes].armes = el.value.split("\n").map(s => s.trim()).filter(Boolean);
      save();
    });
  }

  // ---------- Districts ----------
  function renderDistricts() {
    const pane = $("#pane-districts");
    const f = currentDistrict && findDistrict(data, currentDistrict);
    if (!f) {
      pane.innerHTML = `<div class="card"><p>Aucun district. Créez-en un dans l'onglet <strong>Secteurs</strong>.</p></div>`;
      return;
    }
    const { district: d, secteur: s } = f;
    d.civils ||= {}; d.pertes ||= {}; d.effectifs ||= {}; d.historique ||= [];
    const st = districtState(d, null);
    const hist = [...d.historique].sort((a, b) => b.date.localeCompare(a.date));
    const unitRows = faction => (d.effectifs[faction] || []).map((u, i) => `
      <tr><td><input type="text" data-path="effectifs.${faction}.${i}.unite" value="${esc(u.unite)}"></td>
      <td><input type="text" inputmode="numeric" data-path="effectifs.${faction}.${i}.nombre" data-kind="fog" value="${esc(showFog(u.nombre))}"></td>
      <td><button class="icon-btn" data-del-unit="${faction}:${i}" title="Retirer">✕</button></td></tr>`).join("");

    pane.innerHTML = `
      <div class="card sticky-select">
        <label>District à modifier <select id="d-select">${districtOptions(d.id)}</select></label>
      </div>

      <div class="card">
        <h2>${esc(d.nom)} <span class="muted small">· ${esc(s.nom)} · id : ${esc(d.id)}</span></h2>
        <label>Nom <input type="text" data-path="nom" value="${esc(d.nom)}"></label>
        <label>Pays couverts (codes ISO numériques, séparés par des espaces)
          <input type="text" id="d-pays" value="${esc((d.pays || []).join(" "))}" placeholder="Vide = district hors carte (orbital, sous-marin…)"></label>
        <p class="muted small">${(d.pays || []).map(p => esc(countryNames.get(p) || "? " + p)).join(", ") || "District hors carte."}</p>
        <div class="form-row">
          <label class="grow">Ajouter un pays <input type="text" id="d-add-pays" list="pays-list" placeholder="Tapez un nom de pays (en anglais)…"></label>
          <button id="d-add-pays-btn">Ajouter</button>
        </div>
        <datalist id="pays-list">${[...countryNames].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => `<option value="${esc(n)}" data-id="${id}">`).join("")}</datalist>
      </div>

      <div class="card">
        <h2>Contrôle — actuellement ${esc(CONTROLES[st.controle])}, intensité ${st.intensite || 0}/5</h2>
        <div class="form-row">
          <label>Date <input type="date" id="h-date" value="${today()}"></label>
          <label>Contrôle <select id="h-ctrl">${controleOptions(st.controle)}</select></label>
          <label>Intensité (0–5) <input type="number" id="h-int" min="0" max="5" value="${st.intensite || 0}"></label>
          <button class="primary" id="h-add">Enregistrer</button>
        </div>
        <table class="grid">
          <tr><th>Date</th><th>Contrôle</th><th>Intensité</th><th></th></tr>
          ${hist.map(h => `<tr><td>${fmtDate(h.date)}</td><td>${esc(CONTROLES[h.controle] || h.controle)}</td><td>${h.intensite || 0}</td>
            <td><button class="icon-btn" data-del-h="${esc(h.date)}" title="Supprimer">✕</button></td></tr>`).join("")}
        </table>
      </div>

      <div class="card">
        <h2>Chiffres</h2>
        <p class="hint">Brouillard de guerre : laisser <strong>vide</strong> = « Classifié », <strong>?</strong> = « Inconnu », <strong>~12000</strong> = estimation (≈).</p>
        <div class="form-grid">
          <label>Population <input type="text" data-path="civils.population" data-kind="fog" value="${esc(showFog(d.civils.population))}"></label>
          <label>Déplacés <input type="text" data-path="civils.deplaces" data-kind="fog" value="${esc(showFog(d.civils.deplaces))}"></label>
          <label>Victimes civiles <input type="text" data-path="civils.victimes" data-kind="fog" value="${esc(showFog(d.civils.victimes))}"></label>
          <label>Pertes ${esc(data.factions.confederation.nom)} <input type="text" data-path="pertes.confederation" data-kind="fog" value="${esc(showFog(d.pertes.confederation))}"></label>
          <label>Pertes ${esc(data.factions.cultistes.nom)} <input type="text" data-path="pertes.cultistes" data-kind="fog" value="${esc(showFog(d.pertes.cultistes))}"></label>
        </div>
      </div>

      ${["confederation", "cultistes"].map(fac => `
      <div class="card">
        <h2>Effectifs — ${esc(data.factions[fac].nom)}</h2>
        <table class="grid units"><tr><th>Unité</th><th>Nombre</th><th></th></tr>${unitRows(fac)}</table>
        <button data-add-unit="${fac}">+ Ajouter une unité</button>
      </div>`).join("")}

      <div class="card">
        <h2>Rapport / notes</h2>
        <textarea rows="4" data-path="notes" placeholder="Texte libre affiché dans la fiche.">${esc(d.notes || "")}</textarea>
      </div>

      <div class="card danger-zone">
        <button class="danger" id="d-delete">Supprimer ce district</button>
      </div>`;

    $("#d-select").onchange = e => { currentDistrict = e.target.value; renderDistricts(); };
    bindInputs(pane, () => d, el => { if (el.dataset.path === "nom") renderDistricts(); });
    $("#d-pays").onchange = e => {
      d.pays = e.target.value.split(/[\s,;]+/).filter(Boolean).map(x => /^\d+$/.test(x) ? x.padStart(3, "0") : x);
      save(); renderDistricts();
    };
    $("#d-add-pays-btn").onclick = () => {
      const name = $("#d-add-pays").value.trim().toLowerCase();
      const hit = [...countryNames].find(([, n]) => n.toLowerCase() === name);
      if (!hit) return toast("Pays introuvable. Choisissez un nom dans la liste.", true);
      const owner = data.secteurs.flatMap(x => x.districts).find(x => (x.pays || []).includes(hit[0]));
      if (owner && owner !== d && !confirm(`${hit[1]} appartient déjà à « ${owner.nom} ». Le déplacer ici ?`)) return;
      if (owner && owner !== d) owner.pays = owner.pays.filter(p => p !== hit[0]);
      d.pays = [...new Set([...(d.pays || []), hit[0]])];
      save(); renderDistricts();
    };
    $("#h-add").onclick = () => {
      const date = $("#h-date").value || today();
      d.historique = d.historique.filter(h => h.date !== date).concat({
        date, controle: $("#h-ctrl").value, intensite: Math.max(0, Math.min(5, +$("#h-int").value || 0)),
      });
      save(); toast("Statut enregistré."); renderDistricts();
    };
    pane.querySelectorAll("[data-del-h]").forEach(b => b.onclick = () => {
      d.historique = d.historique.filter(h => h.date !== b.dataset.delH);
      save(); renderDistricts();
    });
    pane.querySelectorAll("[data-add-unit]").forEach(b => b.onclick = () => {
      (d.effectifs[b.dataset.addUnit] ||= []).push({ unite: "Nouvelle unité", nombre: 0 });
      save(); renderDistricts();
    });
    pane.querySelectorAll("[data-del-unit]").forEach(b => b.onclick = () => {
      const [fac, i] = b.dataset.delUnit.split(":");
      d.effectifs[fac].splice(+i, 1);
      save(); renderDistricts();
    });
    $("#d-delete").onclick = () => {
      if (!confirm(`Supprimer définitivement le district « ${d.nom} » ?`)) return;
      s.districts = s.districts.filter(x => x !== d);
      data.evenements.forEach(e => { if (e.district === d.id) e.district = null; });
      currentDistrict = data.secteurs.flatMap(x => x.districts)[0]?.id || null;
      save(); renderDistricts();
    };
  }

  // ---------- Événements ----------
  function renderEvents() {
    const pane = $("#pane-events");
    const e = editingEvent ? data.evenements.find(x => x.id === editingEvent) : null;
    const v = e || { date: today(), titre: "", description: "", district: "", gravite: "info" };
    const list = [...data.evenements].sort((a, b) => b.date.localeCompare(a.date));
    pane.innerHTML = `
      <div class="card">
        <h2>${e ? "Modifier l'événement" : "Nouvel événement"}</h2>
        <div class="form-row">
          <label>Date <input type="date" id="e-date" value="${esc(v.date)}"></label>
          <label>Gravité <select id="e-grav">
            ${["info", "important", "critique"].map(g => `<option value="${g}" ${g === v.gravite ? "selected" : ""}>${{ info: "Info", important: "Important", critique: "Critique" }[g]}</option>`).join("")}
          </select></label>
          <label class="grow">District <select id="e-district">${districtOptions(v.district, true)}</select></label>
        </div>
        <label>Titre <input type="text" id="e-titre" value="${esc(v.titre)}"></label>
        <label>Description <textarea id="e-desc" rows="3">${esc(v.description || "")}</textarea></label>
        <div class="form-row">
          <label class="check"><input type="checkbox" id="e-discord" ${settings.webhook ? "" : "disabled"}> Annoncer sur Discord ${settings.webhook ? "" : '<span class="muted small">(webhook non configuré)</span>'}</label>
          ${e ? '<button id="e-cancel">Annuler</button>' : ""}
          <button class="primary" id="e-save">${e ? "Enregistrer" : "Ajouter"}</button>
        </div>
      </div>
      <div class="card">
        <h2>Tous les événements (${list.length})</h2>
        <ul class="admin-events">${list.map(x => {
          const f = x.district && findDistrict(data, x.district);
          return `<li class="event grav-${esc(x.gravite)}">
            <div class="event-meta"><span class="grav">${esc(x.gravite)}</span><span class="muted small">${fmtDate(x.date)}${f ? " · " + esc(f.district.nom) : ""}</span></div>
            <strong>${esc(x.titre)}</strong>
            <div class="row-actions"><button data-edit-e="${esc(x.id)}">Modifier</button>
            <button data-discord-e="${esc(x.id)}" ${settings.webhook ? "" : "disabled"}>Annoncer</button>
            <button class="danger" data-del-e="${esc(x.id)}">Supprimer</button></div>
          </li>`;
        }).join("")}</ul>
      </div>`;

    $("#e-save").onclick = () => {
      const titre = $("#e-titre").value.trim();
      if (!titre) return toast("Le titre est obligatoire.", true);
      const obj = e || { id: uniqueId("e" + Date.now().toString(36), id => data.evenements.some(x => x.id === id)) };
      Object.assign(obj, {
        date: $("#e-date").value || today(), titre, description: $("#e-desc").value.trim(),
        district: $("#e-district").value || null, gravite: $("#e-grav").value,
      });
      if (!e) data.evenements.push(obj);
      save();
      if ($("#e-discord").checked) announceEvent(obj);
      editingEvent = null;
      toast(e ? "Événement modifié." : "Événement ajouté.");
      renderEvents();
    };
    if (e) $("#e-cancel").onclick = () => { editingEvent = null; renderEvents(); };
    pane.querySelectorAll("[data-edit-e]").forEach(b => b.onclick = () => { editingEvent = b.dataset.editE; renderEvents(); window.scrollTo(0, 0); });
    pane.querySelectorAll("[data-discord-e]").forEach(b => b.onclick = () => announceEvent(data.evenements.find(x => x.id === b.dataset.discordE)));
    pane.querySelectorAll("[data-del-e]").forEach(b => b.onclick = () => {
      if (!confirm("Supprimer cet événement ?")) return;
      data.evenements = data.evenements.filter(x => x.id !== b.dataset.delE);
      save(); renderEvents();
    });
  }

  // ---------- Secteurs ----------
  function renderSecteurs() {
    const pane = $("#pane-secteurs");
    pane.innerHTML = `
      <div class="card">
        <h2>Titre du site</h2>
        <input type="text" id="meta-titre" value="${esc(data.meta.titre || "")}">
      </div>
      <p class="hint">Un secteur dont les districts n'ont aucun pays est affiché comme <strong>« hors carte »</strong> (territoires orbitaux, sous-marins, dimensions…) : il reste consultable depuis la liste.</p>
      ${data.secteurs.map((s, i) => `
        <div class="card" data-sec="${i}">
          <div class="form-row">
            <label class="grow">Nom <input type="text" data-path="nom" value="${esc(s.nom)}"></label>
            <span class="muted small">id : ${esc(s.id)}</span>
          </div>
          <label>Description <input type="text" data-path="description" value="${esc(s.description || "")}"></label>
          <label>Cadrage de la carte (longitude/latitude min puis max, facultatif)
            <input type="text" data-cadrage value="${esc(s.cadrage ? s.cadrage.flat().join(" ") : "")}" placeholder="ex. -25 34 60 72"></label>
          <p class="small"><strong>${s.districts.length} districts :</strong> ${s.districts.map(d => `<a href="#" data-goto="${esc(d.id)}">${esc(d.nom)}</a>`).join(", ") || "aucun"}</p>
          <div class="form-row">
            <input type="text" class="grow" data-new-district placeholder="Nom du nouveau district">
            <button data-add-district>+ Ajouter le district</button>
            <button data-up ${i === 0 ? "disabled" : ""} title="Monter">↑</button>
            <button data-down ${i === data.secteurs.length - 1 ? "disabled" : ""} title="Descendre">↓</button>
            <button class="danger" data-del-sec>Supprimer le secteur</button>
          </div>
        </div>`).join("")}
      <div class="card">
        <h2>Nouveau secteur</h2>
        <div class="form-row">
          <input type="text" class="grow" id="new-sec" placeholder="ex. Secteur Orbital">
          <button class="primary" id="add-sec">Créer le secteur</button>
        </div>
      </div>`;

    $("#meta-titre").onchange = e => { data.meta.titre = e.target.value; save(); };
    pane.querySelectorAll("[data-sec]").forEach(card => {
      const i = +card.dataset.sec, s = data.secteurs[i];
      bindInputs(card, () => s);
      card.querySelector("[data-cadrage]").onchange = e => {
        const n = e.target.value.split(/[\s,;]+/).filter(Boolean).map(Number);
        if (n.length === 0) delete s.cadrage;
        else if (n.length === 4 && n.every(x => !isNaN(x))) s.cadrage = [[n[0], n[1]], [n[2], n[3]]];
        else return toast("Le cadrage doit contenir 4 nombres.", true);
        save();
      };
      card.querySelector("[data-add-district]").onclick = () => {
        const nom = card.querySelector("[data-new-district]").value.trim();
        if (!nom) return toast("Indiquez un nom de district.", true);
        const id = uniqueId(slug(nom), districtExists);
        s.districts.push({
          id, nom, pays: [], historique: [{ date: today(), controle: "confederation", intensite: 0 }],
          civils: { population: null, deplaces: 0, victimes: 0 }, effectifs: { confederation: [], cultistes: [] },
          pertes: { confederation: 0, cultistes: 0 }, notes: "",
        });
        save();
        currentDistrict = id;
        showTab("districts");
        toast(`District « ${nom} » créé.`);
      };
      card.querySelector("[data-up]").onclick = () => { data.secteurs.splice(i - 1, 0, data.secteurs.splice(i, 1)[0]); save(); renderSecteurs(); };
      card.querySelector("[data-down]").onclick = () => { data.secteurs.splice(i + 1, 0, data.secteurs.splice(i, 1)[0]); save(); renderSecteurs(); };
      card.querySelector("[data-del-sec]").onclick = () => {
        if (!confirm(`Supprimer « ${s.nom} » et ses ${s.districts.length} districts ?`)) return;
        const ids = new Set(s.districts.map(d => d.id));
        data.evenements.forEach(e => { if (ids.has(e.district)) e.district = null; });
        data.secteurs.splice(i, 1);
        save(); renderSecteurs();
      };
    });
    pane.querySelectorAll("[data-goto]").forEach(a => a.onclick = ev => { ev.preventDefault(); currentDistrict = a.dataset.goto; showTab("districts"); });
    $("#add-sec").onclick = () => {
      const nom = $("#new-sec").value.trim();
      if (!nom) return toast("Indiquez un nom de secteur.", true);
      data.secteurs.push({ id: uniqueId(slug(nom), id => data.secteurs.some(s => s.id === id)), nom, description: "", districts: [] });
      save(); renderSecteurs();
    };
  }

  // ---------- Publication ----------
  function guessRepo() {
    // Sur GitHub Pages (utilisateur.github.io/depot), on devine le dépôt.
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    if (m && !settings.owner) {
      settings.owner = m[1];
      settings.repo = location.pathname.split("/").filter(Boolean)[0] || m[1] + ".github.io";
    }
  }

  function renderPublier() {
    const pane = $("#pane-publier");
    pane.innerHTML = `
      <div class="card">
        <h2>Publier sur le site</h2>
        <p class="muted">Envoie le brouillon dans <code>data.json</code> du dépôt GitHub. Le site se met à jour en 1 à 2 minutes.</p>
        <div class="form-grid">
          <label>Propriétaire <input type="text" data-set="owner" value="${esc(settings.owner)}" placeholder="renardpoule"></label>
          <label>Dépôt <input type="text" data-set="repo" value="${esc(settings.repo)}" placeholder="lastwar"></label>
          <label>Branche <input type="text" data-set="branch" value="${esc(settings.branch)}" placeholder="vide = branche par défaut"></label>
          <label>Fichier <input type="text" data-set="path" value="${esc(settings.path)}"></label>
        </div>
        <label>Jeton GitHub (fine-grained, permission « Contents : Read and write » sur ce dépôt uniquement)
          <input type="password" data-set="token" value="${esc(settings.token)}" autocomplete="off"></label>
        <p class="hint">Le jeton est gardé uniquement dans ce navigateur. N'utilisez pas cette page sur un ordinateur partagé.</p>
        <div class="form-row">
          <label class="grow">Message de publication <input type="text" id="p-msg" value="Mise à jour de la carte"></label>
          <button class="primary" id="p-publish">Publier</button>
        </div>
      </div>

      <div class="card">
        <h2>Sans GitHub</h2>
        <p class="muted">Téléchargez le fichier puis remplacez <code>data.json</code> à la main sur le dépôt.</p>
        <div class="form-row">
          <button id="p-download">Télécharger data.json</button>
          <button class="danger" id="p-reset">Abandonner le brouillon</button>
        </div>
      </div>

      <div class="card">
        <h2>Discord</h2>
        <p class="muted">URL du webhook du salon (Paramètres du salon → Intégrations → Webhooks). Permet d'annoncer les événements et les changements de Tension.</p>
        <label>Webhook <input type="password" data-set="webhook" value="${esc(settings.webhook)}" placeholder="https://discord.com/api/webhooks/…" autocomplete="off"></label>
        <button id="p-test">Envoyer un message de test</button>
      </div>`;

    pane.querySelectorAll("[data-set]").forEach(el => el.onchange = () => {
      settings[el.dataset.set] = el.value.trim();
      store.set(SETTINGS_KEY, settings);
    });
    $("#p-publish").onclick = publish;
    $("#p-download").onclick = () => {
      const blob = new Blob([JSON.stringify(stamp(), null, 1)], { type: "application/json" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "data.json" });
      a.click();
      URL.revokeObjectURL(a.href);
    };
    $("#p-reset").onclick = () => {
      if (!confirm("Effacer toutes les modifications non publiées ?")) return;
      store.del(DRAFT_KEY);
      data = structuredClone(published);
      renderAll();
      toast("Brouillon abandonné.");
    };
    $("#p-test").onclick = () => discord({ title: "Test de la carte de guerre", description: "Le webhook fonctionne.", color: 0x3b82c4 });
  }

  function stamp() {
    data.meta.derniere_maj = today();
    return data;
  }

  async function publish() {
    const { owner, repo, branch, path, token } = settings;
    if (!owner || !repo || !token) return toast("Renseignez le propriétaire, le dépôt et le jeton.", true);
    const btn = $("#p-publish");
    btn.disabled = true; btn.textContent = "Publication…";
    const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
    const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
    try {
      let sha;
      const cur = await fetch(api + (branch ? "?ref=" + encodeURIComponent(branch) : ""), { headers });
      if (cur.ok) sha = (await cur.json()).sha;
      else if (cur.status !== 404) throw new Error(await errMsg(cur));
      const json = JSON.stringify(stamp(), null, 1) + "\n";
      const bytes = new TextEncoder().encode(json);
      let bin = "";
      bytes.forEach(b => (bin += String.fromCharCode(b)));
      const res = await fetch(api, {
        method: "PUT", headers,
        body: JSON.stringify({ message: $("#p-msg").value || "Mise à jour de la carte", content: btoa(bin), branch: branch || undefined, sha }),
      });
      if (!res.ok) throw new Error(await errMsg(res));
      published = structuredClone(data);
      save();
      toast("Publié ! Le site sera à jour d'ici 1 à 2 minutes.");
    } catch (err) {
      toast("Échec de la publication : " + err.message, true);
    } finally {
      btn.disabled = false; btn.textContent = "Publier";
    }
  }

  async function errMsg(res) {
    try { const j = await res.json(); return `${res.status} ${j.message || ""}`; } catch { return String(res.status); }
  }

  // ---------- Discord ----------
  async function discord(embed) {
    if (!settings.webhook) return toast("Aucun webhook Discord configuré (onglet Publier).", true);
    try {
      const res = await fetch(settings.webhook, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.meta.titre || "Carte de guerre", embeds: [embed] }),
      });
      if (!res.ok) throw new Error(res.status);
      toast("Message envoyé sur Discord.");
    } catch (err) {
      toast("Échec de l'envoi Discord : " + err.message, true);
    }
  }

  function announceEvent(e) {
    const f = e.district && findDistrict(data, e.district);
    const siteUrl = new URL("index.html", location.href);
    if (f) siteUrl.hash = "district=" + f.district.id;
    discord({
      title: `${{ info: "ℹ️", important: "⚠️", critique: "🚨" }[e.gravite] || ""} ${e.titre}`,
      description: (e.description || "") + (f ? `\n\n📍 **${f.district.nom}** (${f.secteur.nom})` : ""),
      url: siteUrl.href,
      color: { info: 0x3b82c4, important: 0xe0a526, critique: 0xc0392b }[e.gravite] || 0x888888,
      footer: { text: fmtDate(e.date) },
    });
  }

  // ---------- JSON brut ----------
  function renderJson() {
    const pane = $("#pane-json");
    pane.innerHTML = `
      <div class="card">
        <h2>Édition directe</h2>
        <p class="hint">Pour les modifications en masse. Une erreur de syntaxe est refusée sans rien casser.</p>
        <textarea id="raw" rows="28" spellcheck="false" class="mono">${esc(JSON.stringify(data, null, 1))}</textarea>
        <button class="primary" id="raw-apply">Appliquer</button>
      </div>`;
    $("#raw-apply").onclick = () => {
      try {
        const next = JSON.parse($("#raw").value);
        if (!Array.isArray(next.secteurs) || !next.tension || !Array.isArray(next.evenements)) throw new Error("il manque secteurs, tension ou evenements");
        data = next;
        save(); renderAll();
        toast("JSON appliqué.");
      } catch (err) {
        toast("JSON invalide : " + err.message, true);
      }
    };
  }

  // ---------- Onglets ----------
  const renderers = { tension: renderTension, districts: renderDistricts, events: renderEvents, secteurs: renderSecteurs, publier: renderPublier, json: renderJson };
  let activeTab = "tension";

  function showTab(name) {
    activeTab = name;
    document.querySelectorAll(".admin-tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("active", p.dataset.pane === name));
    renderers[name]();
  }

  function renderAll() {
    if (!findDistrict(data, currentDistrict)) currentDistrict = data.secteurs.flatMap(s => s.districts)[0]?.id || null;
    renderers[activeTab]();
    updateDraftStatus();
  }

  document.querySelector(".admin-tabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]");
    if (b) showTab(b.dataset.tab);
  });

  showTab("tension");
  updateDraftStatus();
})();
