# Carte de guerre — Confédération des Cendres

Site statique (GitHub Pages) qui suit un roleplay SCP sur Discord : la **Confédération des Cendres** (CC, technocratie mondiale) contre les **Cultistes** (Culte de la Vérité Primordiale, dieux Nargal et Izala). L'auteur du RP est Foxy (renardpoule). On lui parle en français.

- Dépôt : `renardpoule/lastwar`, branche **`claude/intelligent-wozniak-z9wmmf`** = branche par défaut et source de Pages (racine). Pousser dessus publie le site.
- En ligne : https://renardpoule.github.io/lastwar/ (carte), `secteurs.html` (dossiers), `admin.html` (admin protégé).
- Aucune étape de build : HTML/CSS/JS à la main, d3 v7 et topojson-client dans `lib/`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `carte.css` | Page de la carte, en "salle d'opérations" : la carte prend tout l'écran, les panneaux flottent dessus (barre haute, ruban pertes / énergie / transmissions, outils, rapport latéral repliable, chronologie). Sur téléphone, le rapport est une feuille qu'on tire du bas |
| `moteur.js` | Moteur de la carte (`CARTE`) : scènes (`CARTE.scene(i)` = état de la carte en direct ou à un index de l'historique), projection (globe orthographique en vue monde, qui se déplie en planisphère quand on ouvre un secteur), caméra, pointeur, cibles de survol, quatre canvas empilés (`base`, `vie`, `sym`, `fx`) |
| `calques.js` | Dessin du fond (terres par statut, relief, nuit, frontières) et de la matière vivante (zones cultistes : veines pour Nargal, éclats pour Izala ; brouillard, dents du front, cicatrices nucléaires avec retombées, bombardements, cordons) |
| `symboles.js` | Symboles statiques : voies, lignes de front, flèches d'offensive, sites, villes en silhouette, pions à jauge, pictogrammes d'événements, étiquettes sans chevauchement |
| `animations.js` | Calque animé : navires, convois, satellites, raids aériens par vagues, salves de la marine, explosions, sphères des laboratoires, distorsion localisée |
| `glyphes.js` | Tracés vectoriels de tous les symboles (`GLYPHES`) |
| `app.js` | Page : navigation Monde → secteur → district → ville (hash `#secteur/district/ville`), rapport à onglets, fiches de renseignement (infobulles), bandeau, tension, chronologie |
| `modes.js` | Film de la chronologie, briefing de la semaine (`index.html?briefing` l'ouvre directement), bascule de palier, rideau de comparaison, courbes de la guerre, recherche (touche `/`), calques et légende |
| `pulse.css`, `style.css` | `pulse.css` = jetons et composants ds-* du système Pulse, seul chargé par la carte ; `style.css` l'importe et garde la mise en page des pages Secteurs et Admin |
| `relief.json` | Relief Natural Earth simplifié (fleuves, lacs, massifs, déserts, sommets), domaine public |
| `villes.js` | Illustrations SVG procédurales des villes, déformées selon l'état (0–100 %) |
| `secteurs.html`, `dossiers.js`, `secteurs.css` | Dossiers des secteurs organisationnels (hash `#secteur/page`), page entièrement en terminal : arborescence `tree`, `ls -l`, `cat`, invite de commande (`cd`, `ls`, `help`, complétion Tab), registre du Rapport Confédéral sur l'Anormal. Chaque page de `dossiers{}` autre que `overview` = un sous-dossier |
| `admin.html`, `admin.js`, `admin.css`, `auth.js`, `acces.json` | Admin : édite `data.json` puis publie via l'API GitHub (jeton saisi par l'utilisateur, jamais stocké dans le dépôt). Connexion PBKDF2 + AES-GCM |
| `common.js` | Utilitaires partagés (`C.parse`, `C.fmt`, `C.court`, `C.agrege`, `C.palier`…) |
| `data.json` | **Toutes les données du RP** (voir plus bas) |
| `countries.json` | TopoJSON des pays, retouché : Afrique découpée en "Côte africaine" / "Intérieur africain", France d'outre-mer séparée ("Guyane", "Antilles françaises"), Russie coupée à 60° E ("Russia" = partie européenne, "Sibérie"), "Alaska" séparée des États-Unis, Indonésie coupée à l'équateur ("Indonésie du Nord", "Indonesia" = sud), Malaisie coupée en deux ("Malaisie orientale" = Sabah et Sarawak, "Malaysia" = péninsule). Appelé avec `?v=N` dans `app.js` |
| `img/` | Images des dossiers (syntaxe `![légende](img/x.webp)` dans le contenu) |
| `LISEZMOI.md` | Mode d'emploi de l'admin pour Foxy |

## data.json

`meta` (dateRP, distorsion 0–100), `tension` (valeur + `paliers` : Veille, Tocsin, Crépuscule, Ganzir, Pizzicato), `secteurs[]` (géographiques ou organisationnels, `geographique: false`) → `districts[]` (`pays` = noms de `countries.json`, `statut`, `influence`, `forces`, `civils`, `pertes`, `air`, `note`), `evenements[]` (du plus ancien au plus récent), `historique[]` (instantanés de la chronologie : statuts, zones, tension, distorsion, `villes` {id: état}, `pertes` = `C.pertesMonde`, `energie`, `stabilite`), `zones[]` (bulles cultistes : `centre`, `rayon` en degrés ; `cordon`, `cordonDepuis`, `cordonInfo` = cordon de quarantaine tracé autour), `villes[]` ("Too young to die", `capitale: true` = étoile), `detruites[]` (frappes nucléaires d'Afrique, datées du 11 sept.), `sites[]` (étoile par défaut, ou `icone` : labo, lancement, geothermie, reception, telescope, fusion, tda ; `glitch: true` = sphère de laboratoire d'exclusion ; `dossier` = lien vers `secteurs.html#…` ; `etat` = Installé / En fabrication / En recherche ; `fiche` = [[libellé, valeur]…] affichée dans l'infobulle et listée dans le dossier lié), `satellites[]` (`geo` + `coord`, ou orbite inclinée ; `etat`, `dossier`), `flottes[]` (patrouille animée le long de `trajet`, masquée en relecture ; `type` = surface, porte-avions, sous-marins, recherche ; `zone`, `fiche`, `dossier` : `armee/marine` pour les divisions navales, `rd/bismarck` pour la flotte de recherche ; les trajets doivent rester en mer), `traverseurs[]` (grandes lignes ferroviaires : `voie` = gares [lon, lat], `boucle`, `branches`, `periode`, `info`, `fiche`, `dossier` = `administration/traverseurs` ; les tronçons à moins de 1,1 × rayon d'une bulle ou d'une zone frappée sont tracés coupés, le convoi fait la navette sur le plus long tronçon en service ; `travaux` = [{centre, rayon}] tracés en reconstruction ; masqués en relecture), `communiques[]` (bandeau défilant, filtré par date), `meta.energie` (production, consommation, detruite, detournee, unite), `meta.stabilite` (gouvernement, armee, population en %, bloc de la vue monde), `dossiers{}` (pages des secteurs ; la page `rd/anormal` a un `journal[]` : date, groupe, anomalie, usage = OFFENSIVE / DÉFENSIVE / RESTRUCTURATION, lieu, autorisation, resultat). Champs facultatifs lus par la carte : `depeches{}` (date du tour → texte de la dépêche de la semaine ; à défaut, un relevé automatique des événements du tour s'affiche) et `communiques[].camp = "cult"` (interception cultiste, affichée brouillée dans les transmissions).

Réécrire `data.json` avec `json.dump(d, f, ensure_ascii=False, indent=2)`, sinon le diff explose.

Après toute modification des `pays` d'un district, vérifier que chaque nom existe dans `countries.json` et que chaque pays est attribué une seule fois.

## Règles de cohérence du RP

- Un tour de RP = une semaine. Nouveau tour : changer `meta.dateRP`, ajouter les événements, puis un instantané dans `historique[]` (mêmes champs que celui de l'admin à la publication).
- Tension : palier Crépuscule (moins de 60) jusqu'au 25 oct. ; le palier Ganzir est atteint le 1er nov. 2075 (64). Foxy laisse Claude régler la tension et les statuts des districts.
- Chronologie : la guerre éclate le **8 sept. 2075** (tout a commencé en mai à Baguio). Rien de daté avant ne doit contredire ça. Date actuelle du RP : voir `meta.dateRP`.
- L'influence cultiste d'un district doit correspondre à la **surface réellement couverte par les bulles** (`zones`). Le District Austral est "perdu" depuis le 1er nov. 2075 (80 %) ; les autres restent contestés tant que les cultistes n'en tiennent pas l'essentiel.
- L'état d'une ville doit correspondre à sa distance aux bulles.
- Effectifs mondiaux (27 sept.) : plus de milices depuis le 25 oct. (elles ont compté ~4,9 Md), régulière 47,5 M, forces spéciales 350 000 (majorité en Amérique du Sud), **Division Phoenix 12 600 au total**, en deux divisions de 6 300 (Amérique du Sud contre les entités faibles, Asie contre les fortes). Tués confédérés par corps : `meta.tuesParCorps`. Marine : 15 divisions, ~78 000 marins, toutes rassemblées autour de l'Amérique du Sud depuis le 15 nov. (Chili, Argentine, côtes de Nargal), où elles bombardent en continu (`flottes[].tir` = id du bombardement visé, salves animées) ; la flotte de recherche Bismarck reste à part.
- Carte : en vue monde, un seul pion par camp et par district (total des troupes militaires, sans les milices citoyennes) ; le détail des pions n'apparaît qu'une fois le secteur ouvert, et une grosse formation ne se répartit en plusieurs pions qu'une fois son district ouvert. Chaque pion porte une jauge (effectif restant, pertes en rouge sombre, d'après les tués du district), en direct seulement.
- Quarantaines : en Afrique, seul le district expérimental (la côte en est sortie) ; en Asie, le District Philippin (Philippines, nord de l'Indonésie, Malaisie orientale, Brunei), depuis le 20 sept. ; en Amérique du Sud, un cordon (barrière) autour du foyer de Nargal du 22 sept. au 8 nov. (`cordon: true` dans les instantanés), remplacé le 15 nov. par la **ligne AMAZONE** (`lignes[]` `l-amazone-*` : fortement fortifiée à l'est, faiblement au nord et à l'ouest), resserrée sur les terres reprises.
- Projets technologiques de la R&D (dossiers `rd/*`, la Smith Technologies Corporation et les accords de Stockholm ne sont plus à mentionner) : installé = CLS, GGP, RESS, Télescope Stockholm, TDA ; en fabrication = Station Arachne, ancre de réalité d'EUCRYNOMOS (27 sept. 2075 → 20 mars 2076, 25 tours, semaine 8 au 15 nov.) ; ARCOLOGY en état d'urgence depuis le 15 nov. (défenses automatisées et ancres de réalité actives) ; Fusion Santiago désactivée à distance le 15 nov. ; en recherche = Singularité, SPA (très peu avancé), SPMQN.
- Performances : toute la carte est peinte sur canvas. `base` et `sym` ne sont redessinés que si la vue ou la date change ; `vie` (zones qui respirent) une dizaine de fois par seconde tant qu'une zone est à l'écran ; `fx` à chaque image, mais il ne contient que ce qui bouge. En planisphère, les tracés sont mis en cache (`I.forme`) et le zoom passe par la transformation du canvas ; sur le globe, tout est reprojeté à chaque rotation, d'où la géométrie simplifiée (`_geoS`) et allégée pendant le mouvement (`_geoM`). Ne pas ajouter de `d3.geoContains` ou de `d3.geoDistance` en boucle dans un dessin sans mise en cache. Les raids massifs se règlent par `bombardements[].escadrilles` (`formations`, `parFormation`). Trois garde-fous à ne pas défaire : (1) pas de `backdrop-filter` sur les panneaux `.verre` (le flou obligeait à reflouter chaque panneau à chaque image de la carte, d'où un verre presque opaque) ; (2) niveau de détail : passer par `I.fg(cle, objet, champ)` pour tracer une géométrie de pays, qui choisit `_geo` / `_geoN` / `_geoS` selon le zoom (`I.niv()`) ; (3) tampons de mouvement (`I.viaTampon` dans `moteur.js`) : pendant un glissement ou un zoom sur le planisphère, `base` et `vie` sont recopiés depuis un canvas hors écran plus grand que la vue et retracés nets à l'arrêt, ce qui suppose d'appeler `invalider('vue')` quand seule la caméra bouge et `invalider()` quand le contenu change. Un régulateur (`reguler`) baisse la résolution de rendu par paliers si la cadence reste sous 30 images par seconde (`CARTE._.resolution()` pour voir où il en est).
- Altitude : la vue a trois paliers (`I.palier()` : 0 stratégique, 1 opératif, 2 tactique) qui décident de ce qui s'affiche ; les calques Militaire / Anormal / Infrastructure / Civil se coupent depuis le tiroir de légende.
- Les fichiers CSS/JS sont appelés avec `?v=N` : incrémenter N à chaque modification, sinon les navigateurs gardent l'ancienne version.
- En relecture de chronologie, seules les données archivées s'affichent (pas de notes ni de chiffres actuels). Les pions suivent `historique[].forces` (effectifs archivés par district, sans milices ; avant le 20 sept., `forcesEstimees: true` = déploiement du 20 sept. et cultistes en nombre inconnu).
- Chaque événement a `icone` (percee, contre, reprise, nucleaire, plieur, plieur-mort, entite, maladie, phoenix, quarantaine, fortification, front, combat, foule, evacuation, renfort, commando, signal, machine, science, rail, ville), `lieux` = [[lon, lat]…] (absent pour un événement mondial sans lieu) et éventuellement `camp` (cult / cc / neutre / feu). Les pictogrammes de la semaine affichée (depuis l'instantané précédent) sont posés sur la carte.
- `axes[]` : flèches d'offensive d'une semaine (`date` = date de l'instantané, `camp` = cult ou cc, `trace` = [lon, lat]…, `nom`), visibles seulement à cette date.
- Autres calques datés : `bombardements[]` (napalm / missiles, centre + rayon ou `zone` + `marge`, avions animés), `lignes[]` (stabilisee, fortifiee, renforcee ; `jusqu`), `contestations[]`, `reprises[]` (terres reprises par la CC, retirées des zones) ; `zones[].contour` = percée tracée à la main, `pleine: true` = bordure contestée tombée.
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

Système Pulse (classes `ds-*`, jetons oklch dans `pulse.css`), thème sombre violet / bleu nuit. Sur la carte, les panneaux sont en verre fumé (`.verre`), les cartouches et les chiffres en JetBrains Mono, et les couleurs du canvas sont dans `I.COL` (`calques.js`). Le site doit rester propre sur téléphone (390 px de large, sans défilement horizontal).

## Tester

```bash
cd /home/user/lastwar && python3 -m http.server 8765   # en arrière-plan
```

Puis des scripts Playwright (Chromium est préinstallé, `NODE_PATH=$(npm root -g) node script.js`), à écrire dans le scratchpad et non dans le dépôt. Vérifier : aucune erreur console, vues monde (globe et planisphère) / secteur / district / ville, relecture de la chronologie, film, briefing, rideau de comparaison, courbes, recherche, page Secteurs, admin, largeur 390 px.

## Git

- Commits en français, sans identifiant de modèle dans les messages.
- Foxy veut que chaque modification soit publiée : pousser à la fois sur la branche de travail et sur `claude/intelligent-wozniak-z9wmmf`, sans redemander.
- Ne jamais committer d'identifiant, de mot de passe ou de jeton : `acces.json` ne contient que le hash PBKDF2. Foxy détient les identifiants admin.
- Après un push, le déploiement Pages prend une à deux minutes (github.io n'est pas joignable depuis le conteneur ; vérifier via l'API des Actions si besoin).
