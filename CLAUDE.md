# Carte de guerre — Confédération des Cendres

Site statique (GitHub Pages) qui suit un roleplay SCP sur Discord : la **Confédération des Cendres** (CC, technocratie mondiale) contre les **Cultistes** (Culte de la Vérité Primordiale, dieux Nargal et Izala). L'auteur du RP est Foxy (renardpoule). On lui parle en français.

- Dépôt : `renardpoule/lastwar`, branche **`claude/intelligent-wozniak-z9wmmf`** = branche par défaut et source de Pages (racine). Pousser dessus publie le site.
- En ligne : https://renardpoule.github.io/lastwar/ (carte), `secteurs.html` (dossiers), `admin.html` (admin protégé).
- Aucune étape de build : HTML/CSS/JS à la main, d3 v7 et topojson-client dans `lib/`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `app.js`, `style.css` | Carte : zoom d3, navigation Monde → secteur → district → ville (hash `#secteur/district/ville`), panneau à onglets, tension, chronologie |
| `villes.js` | Illustrations SVG procédurales des villes, déformées selon l'état (0–100 %) |
| `secteurs.html`, `dossiers.js`, `secteurs.css` | Dossiers des secteurs organisationnels (hash `#secteur/page`), page entièrement en terminal : arborescence `tree`, `ls -l`, `cat`, invite de commande (`cd`, `ls`, `help`, complétion Tab), registre du Rapport Confédéral sur l'Anormal. Chaque page de `dossiers{}` autre que `overview` = un sous-dossier |
| `admin.html`, `admin.js`, `admin.css`, `auth.js`, `acces.json` | Admin : édite `data.json` puis publie via l'API GitHub (jeton saisi par l'utilisateur, jamais stocké dans le dépôt). Connexion PBKDF2 + AES-GCM |
| `common.js` | Utilitaires partagés (`C.parse`, `C.fmt`, `C.court`, `C.agrege`, `C.palier`…) |
| `data.json` | **Toutes les données du RP** (voir plus bas) |
| `countries.json` | TopoJSON des pays, retouché : Afrique découpée en "Côte africaine" / "Intérieur africain", France d'outre-mer séparée ("Guyane", "Antilles françaises"), Russie coupée à 60° E ("Russia" = partie européenne, "Sibérie"), "Alaska" séparée des États-Unis |
| `img/` | Images des dossiers (syntaxe `![légende](img/x.webp)` dans le contenu) |
| `LISEZMOI.md` | Mode d'emploi de l'admin pour Foxy |

## data.json

`meta` (dateRP, distorsion 0–100), `tension` (valeur + `paliers` : Veille, Tocsin, Crépuscule, Ganzir, Pizzicato), `secteurs[]` (géographiques ou organisationnels, `geographique: false`) → `districts[]` (`pays` = noms de `countries.json`, `statut`, `influence`, `forces`, `civils`, `pertes`, `air`, `note`), `evenements[]` (du plus ancien au plus récent), `historique[]` (instantanés de la chronologie : statuts, zones, tension, distorsion, `villes` {id: état}, `pertes` = `C.pertesMonde`, `energie`, `stabilite`), `zones[]` (bulles cultistes : `centre`, `rayon` en degrés), `villes[]` ("Too young to die", `capitale: true` = étoile), `detruites[]` (frappes nucléaires d'Afrique, datées du 11 sept.), `sites[]` (étoile par défaut, ou `icone` : labo, lancement, geothermie, reception, telescope, fusion, tda ; `glitch: true` = sphère de laboratoire d'exclusion ; `dossier` = lien vers `secteurs.html#…` ; `etat` = Installé / En fabrication / En recherche ; `fiche` = [[libellé, valeur]…] affichée dans l'infobulle et listée dans le dossier lié), `satellites[]` (`geo` + `coord`, ou orbite inclinée ; `etat`, `dossier`), `flottes[]` (patrouille animée le long de `trajet`, masquée en relecture ; `type` = surface, porte-avions, sous-marins, recherche ; `zone`, `fiche`, `dossier` : `armee/marine` pour les divisions navales, `rd/bismarck` pour la flotte de recherche ; les trajets doivent rester en mer), `communiques[]` (bandeau défilant, filtré par date), `meta.energie` (production, consommation, detruite, detournee, unite), `meta.stabilite` (gouvernement, armee, population en %, bloc de la vue monde), `dossiers{}` (pages des secteurs ; la page `rd/anormal` a un `journal[]` : date, groupe, anomalie, usage = OFFENSIVE / DÉFENSIVE / RESTRUCTURATION, lieu, autorisation, resultat).

Réécrire `data.json` avec `json.dump(d, f, ensure_ascii=False, indent=2)`, sinon le diff explose.

Après toute modification des `pays` d'un district, vérifier que chaque nom existe dans `countries.json` et que chaque pays est attribué une seule fois.

## Règles de cohérence du RP

- Chronologie : la guerre éclate le **8 sept. 2075** (tout a commencé en mai à Baguio). Rien de daté avant ne doit contredire ça. Date actuelle du RP : voir `meta.dateRP`.
- L'influence cultiste d'un district doit correspondre à la **surface réellement couverte par les bulles** (`zones`). Aucun district n'est "perdu" à ce stade.
- L'état d'une ville doit correspondre à sa distance aux bulles.
- Effectifs mondiaux : milices ~4,9 Md, régulière 50 M, forces spéciales 100 000, **Division Phoenix 13 400 au total** (surtout dans les bulles). Marine : 15 divisions, ~78 000 marins, placées face aux bulles cultistes et autour de Ganzir.
- Carte : en vue monde, un seul pion par camp et par district (total des troupes militaires, sans les milices citoyennes) ; le détail des pions n'apparaît qu'une fois le secteur ouvert.
- Afrique : seul le district expérimental est en quarantaine, la côte en est sortie.
- Projets technologiques de la R&D (dossiers `rd/*`, la Smith Technologies Corporation et les accords de Stockholm ne sont plus à mentionner) : installé = CLS, GGP, RESS, Télescope Stockholm, TDA ; en fabrication = Station Arachne ; en recherche = Singularité, SPA (très peu avancé), SPMQN.
- Performances : pas d'animation CSS continue sur les éléments du SVG de la carte ni sur les calques en fondu (chaque image redessinerait toute la carte). Les mouvements lents passent par la boucle à 4 images/s de `app.js` (satellites, flottes, méridien des sphères) ou par des classes posées ponctuellement (soubresauts des sphères, grain de distorsion).
- Les fichiers CSS/JS sont appelés avec `?v=N` : incrémenter N à chaque modification, sinon les navigateurs gardent l'ancienne version.
- En relecture de chronologie, seules les données archivées s'affichent (pas de pions, pas de notes ni de chiffres actuels).
- Ne pas inventer de lore lourd sans le signaler à Foxy.

## Style d'écriture (tous les textes du site)

Écrire comme Foxy (voir le skill Óreiða, section "Le style d'écriture de Foxy") en plus des règles anti-IA d'Everyday Writer :
- phrases longues à virgules, jamais de rafales de fragments courts ;
- ouvertures avec connecteur ("Suite à…", "Alors que…", "Maintenant, concernant…") ;
- un narrateur qui commente et nuance ("va savoir", "ce qui revient probablement au même", "presque") ;
- passé simple pour raconter les événements, présent pour les commentaires ;
- **guillemets droits "…", jamais « »** ;
- deux tirets cadratins au maximum par texte.

## Design

Système Pulse (classes `ds-*`, jetons oklch dans `style.css`), thème sombre violet / bleu nuit. Le site doit rester propre sur téléphone (390 px de large, sans défilement horizontal).

## Tester

```bash
cd /home/user/lastwar && python3 -m http.server 8765   # en arrière-plan
```

Puis des scripts Playwright (Chromium est préinstallé, `NODE_PATH=$(npm root -g) node script.js`), à écrire dans le scratchpad et non dans le dépôt. Vérifier : aucune erreur console, vues monde / secteur / district / ville, relecture de la chronologie, page Secteurs, admin, largeur 390 px.

## Git

- Commits en français, sans identifiant de modèle dans les messages.
- Ne jamais committer d'identifiant, de mot de passe ou de jeton : `acces.json` ne contient que le hash PBKDF2. Foxy détient les identifiants admin.
- Après un push, le déploiement Pages prend une à deux minutes (github.io n'est pas joignable depuis le conteneur ; vérifier via l'API des Actions si besoin).
