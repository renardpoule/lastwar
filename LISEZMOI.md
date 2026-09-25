# Carte de guerre — mode d'emploi

Carte interactive du conflit entre la **Confédération des Cendres** et les **Cultistes**.

- `index.html` : la carte publique (à partager aux joueurs).
- `admin.html` : le panneau d'administration (pour mettre à jour sans toucher au code).
- `data.json` : toutes les données (secteurs, districts, événements, Tension).

## 1. Mettre le site en ligne (une seule fois, ~5 min)

1. Sur GitHub, ouvrez le dépôt **lastwar** → **Settings** → **Pages**.
2. Dans **Build and deployment** : Source = *Deploy from a branch*, choisissez la branche qui contient ces fichiers et le dossier `/ (root)`, puis **Save**.
3. Après 1 à 2 minutes, le site est disponible à l'adresse :
   `https://renardpoule.github.io/lastwar/`
   L'administration se trouve à : `https://renardpoule.github.io/lastwar/admin.html`

> La page d'administration est visible par tout le monde, mais personne ne peut **publier** sans votre jeton GitHub.

## 2. Autoriser la publication depuis l'administration (une seule fois)

1. Allez sur <https://github.com/settings/personal-access-tokens/new> (jeton *fine-grained*).
2. **Repository access** : *Only select repositories* → `lastwar`.
3. **Permissions** → *Repository permissions* → **Contents : Read and write**.
4. Générez le jeton, copiez-le, puis collez-le dans l'onglet **Publier** de l'administration.

Le jeton reste uniquement dans votre navigateur. Ne l'utilisez pas sur un ordinateur partagé.

## 3. Mettre à jour la carte

Toutes les modifications sont d'abord gardées comme **brouillon** dans votre navigateur (indicateur orange en haut à droite). Rien n'est visible des joueurs tant que vous n'avez pas cliqué sur **Publier**.

| Onglet | Ce qu'on y fait |
|---|---|
| **Tension** | Régler l'horloge (0–100) à une date donnée, modifier les paliers et les armes autorisées. |
| **Districts** | Contrôle (Confédération / Contesté / Cultistes) et intensité des combats, population, pertes, unités, notes, pays couverts. |
| **Événements** | Ajouter, modifier ou supprimer un événement et l'annoncer sur Discord. |
| **Secteurs** | Créer des secteurs et des districts, modifier le cadrage de la carte, le titre du site. |
| **Publier** | Envoyer sur GitHub, télécharger `data.json`, configurer le webhook Discord. |
| **JSON brut** | Modifier toutes les données d'un coup (pour les utilisateurs avancés). |

### Brouillard de guerre

Dans les champs chiffrés :

- laisser **vide** → affiché « Classifié » ;
- `?` → affiché « Inconnu » ;
- `~12000` → affiché « ≈ 12 000 » (estimation).

### Secteurs hors carte

Un district sans aucun pays (station orbitale, base sous-marine, autre dimension…) n'apparaît pas sur la carte, mais reste accessible depuis la liste des secteurs, avec une fiche complète.

### Chronologie

Chaque changement de contrôle, niveau de Tension et événement est daté. Le curseur en bas de la carte permet de revenir à n'importe quelle date, et le bouton ▶ rejoue toute l'évolution du conflit.

## 4. Discord (facultatif)

Dans le salon Discord : **Paramètres du salon → Intégrations → Webhooks → Nouveau webhook**, copiez l'URL et collez-la dans l'onglet **Publier**. Vous pourrez alors cocher « Annoncer sur Discord » en ajoutant un événement ou en réglant la Tension.

## 5. Liens partageables

Le bouton **🔗 Partager** d'une fiche copie un lien qui ouvre directement ce district (et la date affichée, si vous remontez la chronologie).

## Détails techniques

Site statique, sans serveur. Bibliothèques incluses dans `lib/` (d3 v7, topojson-client v3). Fond de carte : `countries-50m.json` (Natural Earth via world-atlas). Pour tester en local : `python3 -m http.server` dans ce dossier, puis ouvrir <http://localhost:8000>.
