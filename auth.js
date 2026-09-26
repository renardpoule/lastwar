// Accès au poste de commandement : identifiant + mot de passe, secrets chiffrés.
// Le dépôt ne contient qu'une empreinte PBKDF2 (acces.json) ; le mot de passe n'est jamais stocké.
// Limite : le site est statique, cette porte protège l'interface et chiffre les secrets locaux.
// La barrière qui empêche réellement de modifier la carte reste le jeton GitHub.
const AUTH = (() => {
  const CLE_SESSION = 'cendres-session', CLE_CONFIG = 'cendres-config', CLE_ECHECS = 'cendres-echecs';
  const DUREE_SESSION = 8 * 3600 * 1000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const deb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const lire = (st, k) => { try { return JSON.parse(st.getItem(k)); } catch (e) { return null; } };
  const ecrire = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } };

  async function pbkdf2(texte, sel, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(texte), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations }, base, 256);
  }
  const egal = (a, b) => { a = new Uint8Array(a); b = new Uint8Array(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };

  // Clé de chiffrement des secrets : dérivée du mot de passe avec un sel distinct de l'empreinte
  async function cleDepuis(id, mdp, acces) {
    const sel = new Uint8Array([...deb64(acces.sel), ...enc.encode('|chiffrement')]);
    return pbkdf2(id + ':' + mdp, sel, acces.iterations);
  }
  const importer = brut => crypto.subtle.importKey('raw', brut, 'AES-GCM', false, ['encrypt', 'decrypt']);

  let cle = null;

  async function chiffrer(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, enc.encode(JSON.stringify(obj)));
    return { v: 1, iv: b64(iv), data: b64(data) };
  }
  async function dechiffrer(bloc) {
    const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(bloc.iv) }, cle, deb64(bloc.data));
    return JSON.parse(dec.decode(clair));
  }

  // Réglages (jeton GitHub, webhook) : toujours chiffrés au repos ; un ancien réglage en clair est migré
  async function lireConfig() {
    const brut = lire(localStorage, CLE_CONFIG);
    if (!brut) return {};
    if (brut.v === 1 && brut.iv) {
      try { return await dechiffrer(brut); } catch (e) { return {}; }
    }
    await ecrireConfig(brut);
    return brut;
  }
  async function ecrireConfig(config) { ecrire(localStorage, CLE_CONFIG, await chiffrer(config)); }

  async function ouvrirSession(id, brut) {
    cle = await importer(brut);
    ecrire(sessionStorage, CLE_SESSION, { id, cle: b64(brut), expire: Date.now() + DUREE_SESSION });
    document.body.classList.remove('verrouille');
    return { id };
  }

  async function chargerAcces() {
    const r = await fetch('acces.json?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('acces.json introuvable');
    return r.json();
  }

  async function verifier(id, mdp, acces) {
    const emp = await pbkdf2(id + ':' + mdp, deb64(acces.sel), acces.iterations);
    return id === acces.identifiant && egal(emp, deb64(acces.empreinte));
  }

  // Nouvel identifiant / mot de passe : renvoie le contenu du nouvel acces.json et rechiffre les réglages
  async function creerAcces(id, mdp, config) {
    const sel = crypto.getRandomValues(new Uint8Array(16)), iterations = 310000;
    const emp = await pbkdf2(id + ':' + mdp, sel, iterations);
    const acces = { identifiant: id, sel: b64(sel), iterations, empreinte: b64(emp) };
    return {
      acces,
      appliquer: async () => { await ouvrirSession(id, await cleDepuis(id, mdp, acces)); await ecrireConfig(config); }
    };
  }

  function deconnexion() {
    try { sessionStorage.removeItem(CLE_SESSION); } catch (e) { /* idem */ }
    location.reload();
  }

  const pret = new Promise(async resolve => {
    document.body.classList.add('verrouille');
    const s = lire(sessionStorage, CLE_SESSION);
    if (s && s.expire > Date.now() && s.cle) {
      try { return resolve(await ouvrirSession(s.id, deb64(s.cle))); } catch (e) { /* session invalide */ }
    }
    const form = document.getElementById('connexion');
    const err = document.getElementById('cxErreur');
    const bouton = form.querySelector('button[type=submit]');
    form.hidden = false;
    document.getElementById('cxId').focus();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;
      const echecs = lire(localStorage, CLE_ECHECS) || { n: 0, jusqua: 0 };
      if (echecs.jusqua > Date.now()) {
        err.textContent = `Trop d'essais. Réessayez dans ${Math.ceil((echecs.jusqua - Date.now()) / 1000)} secondes.`;
        err.hidden = false; return;
      }
      bouton.disabled = true; bouton.textContent = 'Vérification…';
      const id = document.getElementById('cxId').value.trim(), mdp = document.getElementById('cxMdp').value;
      try {
        const acces = await chargerAcces();
        if (await verifier(id, mdp, acces)) {
          try { localStorage.removeItem(CLE_ECHECS); } catch (x) { /* idem */ }
          form.hidden = true;
          return resolve(await ouvrirSession(id, await cleDepuis(id, mdp, acces)));
        }
        echecs.n++;
        if (echecs.n >= 5) { echecs.jusqua = Date.now() + 60000; echecs.n = 0; }
        ecrire(localStorage, CLE_ECHECS, echecs);
        await new Promise(r => setTimeout(r, 1200));
        err.textContent = 'Identifiant ou mot de passe incorrect.';
      } catch (x) {
        err.textContent = 'Impossible de vérifier l\'accès : ' + x.message;
      }
      err.hidden = false;
      bouton.disabled = false; bouton.textContent = 'Se connecter';
    });
  });

  return { pret, lireConfig, ecrireConfig, creerAcces, deconnexion };
})();
