# Front des Cendres — carte du conflit

Carte interactive du conflit entre la Confédération des Cendres et les Cultistes.

- `index.html` : la carte publique (lien à partager sur Discord)
- `secteurs.html` : les dossiers des secteurs organisationnels, présentés comme un terminal (un dossier par secteur, un sous-dossier par thématique : Atmosphère, Rapport Confédéral sur l'Anormal, Ganzir, Phoenix…). On clique dans l'arborescence, ou on tape `cd armee/phoenix` dans l'invite en bas de page.
- `admin.html` : le poste de commandement, pour faire les mises à jour
- `data.json` : toutes les données (modifiées par `admin.html`)
- `app.js`, `villes.js`, `dossiers.js`, `admin.js`, `common.js`, `style.css`, `admin.css`, `secteurs.css` : le code
- `countries.json`, `lib/`, `logo.png` : fond de carte simplifié, bibliothèques et sceau de la CC (inclus, aucun service extérieur requis)

---

## Mise en ligne (une seule fois, environ 2 minutes)

Les fichiers sont déjà sur le dépôt GitHub `renardpoule/lastwar`.

1. Dans le dépôt : **Settings → Pages**.
2. *Source* : **Deploy from a branch**. *Branch* : la branche par défaut du dépôt (`claude/intelligent-wozniak-z9wmmf`), dossier **/ (root)**. Cliquez sur **Save**.
3. Une à deux minutes plus tard, la carte est en ligne à l'adresse
   `https://renardpoule.github.io/lastwar/`.

### 3. Créer le jeton de publication (pour le bouton "Publier")
1. GitHub → photo de profil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Nom : `carte`. Expiration : au choix (un an, par exemple).
3. *Repository access* : **Only select repositories**, puis choisissez `lastwar`.
4. *Permissions → Repository permissions → Contents* : **Read and write**.
5. Cliquez sur **Generate token** et copiez le jeton.
6. Ouvrez `https://renardpoule.github.io/lastwar/admin.html`, onglet **Réglages**, collez le jeton, puis cliquez sur **Tester la connexion**.

Le jeton reste uniquement dans votre navigateur. Ne le partagez pas : quelqu'un qui l'a peut modifier la carte.
La page `admin.html` est publique, mais sans jeton elle ne peut rien publier.

### 4. (Optionnel) Annonces Discord
Salon Discord → **Modifier le salon → Intégrations → Webhooks → Nouveau webhook → Copier l'URL**.
Collez l'URL dans **Réglages → Annonces Discord** et cliquez sur "Envoyer un message de test".

---

## Accès au poste de commandement
L'onglet **Administratif** du site mène au poste de commandement, protégé par un identifiant et un mot de passe.
Le dépôt ne contient qu'une empreinte du mot de passe (`acces.json`), jamais le mot de passe lui-même.
Pour le changer : **Réglages → Accès au poste de commandement** (il faut que le jeton GitHub soit configuré).
Le jeton GitHub et le webhook Discord sont chiffrés dans le navigateur avec une clé tirée du mot de passe.

Limite à connaître : le site est statique. L'écran de connexion protège l'interface et les secrets enregistrés,
mais la vraie barrière contre toute modification de la carte reste le jeton GitHub : ne le partagez jamais.

## Faire une mise à jour
1. Ouvrez `admin.html`.
2. **Situation** : changez la date du RP.
3. **Événements** : ajoutez ce qui s'est passé (portée, gravité, conséquences, effet sur la tension). Les **communiqués** qui défilent dans le bandeau de la carte se gèrent en bas du même onglet.
4. **Districts** : ajustez statut, influence cultiste, effectifs et pertes des zones touchées.
5. **Situation** : réglez la tension, la distorsion la **stabilité** (gouvernement, armée, population) et l'**énergie mondiale** (production, consommation, production détruite, production détournée) si besoin.
6. **Villes** : état (0 à 100 %) et garnison des villes "Too young to die". L'état colore le point et déforme l'illustration.
7. **Zones** : zones cultistes et zones détruites (frappes, bombardements). La case "Cordon de quarantaine" trace une barrière tout autour d'une zone cultiste, avec sa date et sa description dans l'infobulle.
8. **Dossiers** : textes de la page Secteurs.
9. Cliquez sur **Publier**. La carte se met à jour pour tout le monde en une à deux minutes.

Tant que vous n'avez pas publié, votre travail est gardé comme brouillon dans le navigateur.

**Chiffres** : `12000` · `~12000` (estimation, affichée "~12 000") · `?` ou `CLASSIFIÉ` (donnée masquée).

**Liens partageables** : chaque zone a sa propre adresse, par exemple
`…/lastwar/#europe/eu-est` ouvre directement le District de l'Est, `…/lastwar/#europe/eu-est/kazan` la fiche de Kazan,
`…/lastwar/secteurs.html#renseignement/atmosphere` le dossier Atmosphère.

**Plan de guerre** : les pions des unités sont calculés à partir des effectifs des districts (Forces régulières, Forces spéciales, Division Phoenix, forces cultistes). Leur taille suit l'effectif ; il n'y a rien à placer à la main. En vue monde, chaque district n'affiche que deux pions, un pour la CC et un pour les cultistes, qui résument toutes ses troupes ; le détail apparaît quand on clique sur un secteur.

**Bandeau de la carte** : le compteur de pertes additionne tout seul les pertes et les décès civils de tous les districts. Le détail des tués confédérés par corps (régulières, milices, forces spéciales, Phoenix) se règle dans l'onglet Situation. À chaque publication, les pertes et l'énergie sont archivées avec le point de chronologie, donc la relecture les affiche à la bonne date.

**Flottes** : chaque division navale a un `type` (`surface`, `porte-avions`, `sous-marins`, `recherche`), une `zone`, une `fiche` et un `trajet` (liste de points [longitude, latitude] parcourue en boucle, à garder en mer).

**Installations** (laboratoires, GGP, TDA, réacteurs à fusion, CLS…), **satellites** et **flottes** : ils se modifient directement dans `data.json` (listes `sites`, `satellites`, `flottes`), pas encore dans l'admin. Un site avec `"glitch": true` reçoit la sphère de confinement des laboratoires d'exclusion, `"dossier": "rd/arcology"` le relie à son dossier, et `"etat"` s'affiche dans l'infobulle. `"fiche"` (liste de paires `["Personnel", "3 200"]`) donne les précisions techniques, affichées dans l'infobulle et en bas du dossier lié.

**Dossiers** : dans les textes, `**gras**`, `*italique*`, `## Titre`, `- puce` et `![légende](img/fichier.webp)` pour une image (déposée dans le dossier `img/`).

**Sans jeton GitHub** : cliquez sur "Télécharger data.json" dans l'admin, puis dans le dépôt GitHub utilisez **Add file → Upload files** pour remplacer `data.json`.
