// Fonctions partagées entre la carte (app.js) et l'administration (admin.js).
const WC = (() => {
  const CONTROLES = {
    confederation: "Confédération",
    conteste: "Contesté",
    cultistes: "Cultistes",
  };

  async function loadData(url = "data.json") {
    const res = await fetch(url + "?v=" + Date.now());
    if (!res.ok) throw new Error("Impossible de charger " + url);
    return res.json();
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Brouillard de guerre : null = classifié, "~1234" = estimation, "?" = inconnu.
  function fmt(v) {
    if (v === null || v === undefined || v === "") return '<span class="fog">Classifié</span>';
    if (v === "?") return '<span class="fog">Inconnu</span>';
    if (typeof v === "string" && v.startsWith("~")) {
      const n = Number(v.slice(1));
      return '<span class="estimate" title="Estimation">≈ ' + (isNaN(n) ? esc(v.slice(1)) : n.toLocaleString("fr-FR")) + "</span>";
    }
    const n = Number(v);
    return isNaN(n) ? esc(v) : n.toLocaleString("fr-FR");
  }

  // Valeur numérique approximative (pour les totaux), null si inconnue.
  function num(v) {
    if (v === null || v === undefined || v === "" || v === "?") return null;
    const n = Number(typeof v === "string" && v.startsWith("~") ? v.slice(1) : v);
    return isNaN(n) ? null : n;
  }

  function sum(list) {
    let total = 0, approx = false, missing = false;
    for (const x of list) {
      const n = num(x);
      if (n === null) { missing = true; continue; }
      if (typeof x === "string") approx = true;
      total += n;
    }
    if (missing && total === 0) return null;
    return approx || missing ? "~" + total : total;
  }

  function fmtDate(d) {
    if (!d) return "";
    const t = new Date(d + "T12:00:00");
    return isNaN(t) ? esc(d) : t.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }

  // Dernière entrée d'historique à la date donnée (ou la plus récente si date absente).
  function atDate(hist, date) {
    const sorted = [...(hist || [])].sort((a, b) => a.date.localeCompare(b.date));
    let cur = null;
    for (const h of sorted) {
      if (!date || h.date <= date) cur = h;
    }
    return cur;
  }

  function districtState(d, date) {
    return atDate(d.historique, date) || { controle: "confederation", intensite: 0 };
  }

  function tensionAt(data, date) {
    const h = atDate(data.tension.historique, date);
    return h ? h.valeur : 0;
  }

  function palierFor(data, v) {
    const ps = [...data.tension.paliers].sort((a, b) => a.seuil - b.seuil);
    let p = ps[0];
    for (const x of ps) if (v >= x.seuil) p = x;
    return p;
  }

  function allDistricts(data) {
    return data.secteurs.flatMap(s => s.districts.map(d => ({ ...d, secteur: s })));
  }

  function findDistrict(data, id) {
    for (const s of data.secteurs) {
      const d = s.districts.find(x => x.id === id);
      if (d) return { district: d, secteur: s };
    }
    return null;
  }

  // Toutes les dates connues (historiques + événements), triées.
  function allDates(data) {
    const set = new Set();
    data.tension.historique.forEach(h => set.add(h.date));
    data.evenements.forEach(e => set.add(e.date));
    data.secteurs.forEach(s => s.districts.forEach(d => (d.historique || []).forEach(h => set.add(h.date))));
    return [...set].filter(Boolean).sort();
  }

  function couleur(data, controle) {
    return (data.factions[controle] || data.factions.confederation).couleur;
  }

  return { CONTROLES, loadData, esc, fmt, num, sum, fmtDate, atDate, districtState, tensionAt, palierFor, allDistricts, findDistrict, allDates, couleur };
})();
