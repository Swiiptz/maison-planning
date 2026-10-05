# Maison — Planning du foyer

Application web en français, adaptée à l'ordinateur et au téléphone. Les tâches peuvent être affichées seules ou regroupées en séances, attribuées aux membres, déplacées et cochées dans un agenda jour / semaine / mois.

## Essayer l'application

Pour un aperçu immédiat sans serveur ni Firebase, lancer `npm run apercu` puis ouvrir `apercu.html` directement dans Firefox ou Chrome. Ce fichier contient l'interface réelle avec les membres et données de démonstration. Il fonctionne hors connexion ; la connexion au vrai foyer se fait dans l'application normale décrite ci-dessous.

Depuis ce dossier, avec Node.js 22.14 ou plus récent :

```sh
npm run dev
```

Ouvrir `http://127.0.0.1:5173`. Aucun `npm install` n'est nécessaire : l'application utilise les modules JavaScript du navigateur et charge le SDK Firebase officiel uniquement pour le planning partagé.

La page d'accueil propose la connexion Google ou « Essayer avec un exemple ». Le mode de démonstration conserve ses données uniquement dans ce navigateur ; ses membres sont fictifs. On peut également l'ouvrir à `http://127.0.0.1:5173/?demo=1`.

L'adresse du serveur local ne sera pas accessible depuis un téléphone extérieur à l'ordinateur. Le téléphone utilisera l'adresse HTTPS GitHub Pages après publication.

## Fonctionnalités réalisées

- Agenda jour / semaine / mois et récapitulatif du jour avec retards.
- 187 actions issues des deux PDF, dans 11 pièces / espaces et 5 catégories transversales.
- Répétitions quotidiennes, hebdomadaires, toutes les deux semaines, mensuelles et tous les deux mois ; tâches ponctuelles possibles.
- Fréquence indiquée par la bordure et son libellé ; pièce identifiée par un badge indépendant.
- Affectations aux membres ; modification d'une échéance ou des suivantes.
- Séances avec checklist, séparation d'une action, regroupement désactivable.
- Déplacement par poignée à la souris ou au toucher ; déplacement par formulaire disponible pour le clavier et les autres modes d'accès.
- Création, modification et archivage des tâches ; ajout et renommage des membres, couleurs de pièces personnalisables.
- Export / import métier versionné ; contrôle des données avant import.
- Connexion Google, création d'un foyer et invitations réservées à l'email du compte, via Firebase.

23 étapes n'ont pas de fréquence explicite dans les PDF : elles restent dans le catalogue à configurer. Le nettoyage du pommeau de douche conserve une consigne signalée comme incomplète. Voir [les points du catalogue à vérifier](docs/CATALOGUE_A_VERIFIER.md).

## Activer le projet Firebase

La configuration publique du projet `mmsplann` est intégrée dans `app/config.js`. Le SDK est isolé dans `app/adapters/firebase.js`. Le projet doit rester au forfait **Spark**, sans compte de facturation lié. Analytics, Cloud Storage et Cloud Functions ne sont pas nécessaires.

La configuration web ne suffit pas à activer le backend. Dans la console Firebase :

1. Activer le fournisseur Google dans Authentication et choisir l'email d'assistance.
2. Créer une base Firestore **Standard**, identifiant **(default)**, en mode production, de préférence en Europe.
3. Ouvrir Firestore → Règles, remplacer le contenu par [firestore.rules](firestore.rules), puis publier les règles.
4. Dans Authentication → Paramètres → Domaines autorisés, ajouter `127.0.0.1` pour l'essai local et le domaine `<compte>.github.io` après publication. Le domaine ne contient ni protocole, ni chemin du dépôt. Ajouter `localhost` aussi si cette adresse est utilisée.
5. Dans l'application, se connecter avec Google, créer son foyer puis répartir les dates et les responsables.

Pour inviter une personne : créer ou renommer son membre dans Réglages, cliquer sur Inviter, saisir son email et lui transmettre le code. Cette personne se connecte avec ce compte et choisit « Rejoindre un foyer ». L'application ne lui envoie aucun email automatiquement. La création d'invitations est réservée au créateur du foyer par les règles backend.

Les étapes de console sont guidées une à une dans la conversation. Les règles et la connexion doivent encore être vérifiées sur le projet réel avant de considérer la synchronisation comme validée.

## Publier sur GitHub Pages

Le workflow [pages.yml](.github/workflows/pages.yml) vérifie le projet, prépare `dist/` et publie uniquement ce dossier. Le catalogue et la configuration publique du navigateur sont publiés ; les données privées du foyer restent dans Firestore.

1. Créer un dépôt GitHub **public** pour rester sur GitHub Free, puis y envoyer les fichiers du projet, sans `dist/` ni sauvegardes personnelles.
2. Ouvrir Settings → Pages et sélectionner **GitHub Actions** comme source.
3. Envoyer la branche `main`, ou lancer le workflow « Publier le planning » manuellement.
4. Ajouter le domaine GitHub Pages aux domaines autorisés dans Firebase Authentication.

Les chemins des ressources sont relatifs ; le site fonctionne aussi sous le chemin d'un dépôt, sans réécriture serveur ni route nécessitant une configuration spéciale.

Source : [workflows GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

La publication n'a pas encore été effectuée : le dépôt GitHub et son accès ne sont pas configurés dans cet environnement.

## Vérification

```sh
npm run check
npm test
npm run build
```

Les tests couvrent les dates de fin de mois, les répétitions, les changements ponctuels et futurs, l'historique, les séances, la concurrence entre onglets, l'import / export et la frontière entre l'interface et ses services.

La vérification des écrans par les tests porte sur la génération des vues et leurs gestionnaires, sans moteur de navigateur. Les gestes tactiles, le rendu CSS et les règles Firestore doivent également être vérifiés en conditions réelles.

## Architecture et migration

```text
app/main.js                   Écrans et interactions
app/domain/                   Dates, répétitions et modèles indépendants du fournisseur
app/services/                 Contrats et opérations de l'application
app/services/bootstrap.js     Sélection et assemblage des adaptateurs
app/adapters/firebase.js      Firestore et Firebase Authentication
app/adapters/demo.js          Exemple local et adaptateur de test
app/data/catalog.json         Catalogue issu des PDF
```

La base et l'authentification passent par des services dédiés. Les écrans ne font aucun appel au SDK Firebase. Les membres ont des identifiants propres à l'application ; la correspondance avec les comptes Firebase reste séparée. Les modèles utilisent des dates civiles et des références simples, et l'export conserve les relations et l'historique.

La future solution PostgreSQL / Keycloak aura ses adaptateurs derrière ces mêmes services. La migration demandera une reprise des données et des comptes ainsi qu'une API vers PostgreSQL. Voir [l'architecture et la migration](docs/ARCHITECTURE_ET_MIGRATION.md) et le [cahier des charges](docs/CAHIER_DES_CHARGES.md).

Références : [SDK Firebase web officiel](https://firebase.google.com/docs/web/alt-setup), [connexion Google](https://firebase.google.com/docs/auth/web/google-signin), [règles Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).
