# Cahier des charges — Planning de la maison

Version 0.5 — proposition de cadrage, 5 octobre 2026.

Décision utilisateur : utiliser Firebase pour le stockage avec une contrainte de coût nul. La configuration du compte interviendra après le cadrage.

Précision utilisateur : conserver Firebase pour la V1, en préparant une migration future de la base de données et de l'authentification vers sa solution PostgreSQL et Keycloak. Supabase reste une option ultérieure ; aucun remplacement ni déploiement de Supabase ou Keycloak n'est demandé à ce stade.

Décisions utilisateur : affectation à un membre et à une date dès la V1 ; tâches individuelles et séances avec checklist. Les tâches initiales sont récurrentes selon les fréquences des PDF ; les étapes sans fréquence explicite restent à traiter séparément.

Ce document cadre la réalisation. Une première version locale est maintenant implémentée ; la configuration Firebase et la publication GitHub Pages sont en cours de préparation. Les points indiqués « à décider » restent ouverts.

## 1. Objectif

Créer une application web en français, agréable à utiliser sur téléphone et ordinateur, pour organiser les tâches de la maison dans un planning, déplacer les tâches facilement et suivre ce qu'il reste à faire chaque jour et chaque semaine.

La première version couvre la planification et le suivi. L'organisation du code et des données doit permettre d'ajouter des fonctionnalités sans refaire le planning.

## 2. Documents sources

- `EDT MAINTENIR LA MAISON PROPRE.pdf` : 7 pages, tâches par pièce et légende des fréquences.
- `EDT MAINTENIR LA MAISON PROPRE Tache tranverse.pdf` : 2 pages, tâches communes à la maison.

Les textes, les regroupements et les fréquences des PDF servent de base au catalogue initial. Les PDF décrivent des fréquences, pas un calendrier daté complet. Les dates de démarrage seront choisies dans l'application.

### Fréquences et couleurs

| Couleur du document | Fréquence |
| --- | --- |
| Bleu clair | Tous les jours |
| Vert | Toutes les semaines |
| Jaune | Toutes les deux semaines |
| Orange | Tous les mois |
| Rose / magenta | Tous les deux mois |

Chaque carte présente deux repères distincts : une bordure et un libellé colorés pour la récurrence, un badge coloré portant le nom de la pièce. Le statut et le membre responsable restent des informations séparées. La palette pourra être adoucie en gardant les correspondances des fréquences et un texte lisible.

### Couleurs des pièces

Demande utilisateur : identifier aussi les tâches par la couleur de leur pièce. Les PDF regroupent les tâches par pièce, mais ne donnent pas de légende de couleurs propre aux pièces. La palette suivante est une proposition d'interface, indépendante des fréquences.

| Pièce / espace | Couleur proposée du badge |
| --- | --- |
| Salle de bain | Turquoise |
| Notre chambre | Lavande |
| Chambre bleue | Bleu |
| Salle de jeu / chambre d'appoint | Corail |
| Cuisine | Ambre |
| Salon | Prune |
| Entrée | Beige |
| Débarras du bas | Ardoise |
| Mezzanine | Indigo |
| Couloir à l'étage | Taupe |
| Jardin | Vert sauge |

Les catégories transversales utilisent un badge neutre avec leur nom. Les noms visibles permettent de distinguer les groupes même lorsque les couleurs se ressemblent. Prévoir le changement de couleur d'une pièce dans les réglages, sans changer les couleurs de récurrence.

Exemple : « Nettoyer le lavabo » porte un badge turquoise « Salle de bain » et une bordure verte « Hebdomadaire ». Une tâche quotidienne de la même pièce garde le badge turquoise et prend une bordure bleue.

### Groupes à reprendre

**Pièces / espaces (11)** : salle de bain, notre chambre, chambre bleue, salle de jeu / chambre d'appoint, cuisine, salon, entrée, débarras du bas, mezzanine, couloir à l'étage, jardin.

**Tâches transversales (5)** : linge / lessive, collecte / tri, stock, entretien du matériel, administration de la maison.

**Contraintes explicites** : poubelle jaune le dimanche soir ; poubelle marron le mercredi soir. Ces deux sorties sont distinctes du vidage des poubelles à l'intérieur de la cuisine.

### Particularités à traiter lors de la reprise

- Les étapes sans couleur, notamment préparer et ranger le matériel, n'ont pas de fréquence explicitement définie. Proposition : étapes de checklist associées à une séance, à confirmer.
- Certaines lignes comportent plusieurs couleurs, par exemple remettre les tapis et les objets dans la chambre bleue. Les séparer en actions lorsque les fréquences diffèrent ; conserver le lien avec le texte source.
- Ne pas déduire la fréquence d'une tâche de celle d'une tâche voisine. Les éventuelles couleurs ambiguës sont à confirmer.
- La description du nettoyage du pommeau de douche est incomplète dans le PDF : conserver l'intitulé et demander le complément si nécessaire.
- Conserver l'ordre des étapes lorsque plusieurs actions sont regroupées dans une séance.
- Prévoir les fréquences indiquées même lorsqu'elles paraissent inhabituelles ; elles restent modifiables par l'utilisateur.

## 3. Périmètre de la première version

### Catalogue des tâches

- Fournir les tâches issues des deux documents, regroupées par pièce ou catégorie transversale.
- Créer et modifier une tâche : titre, groupe, description facultative, fréquence, date de départ et responsable habituel.
- Archiver une tâche pour arrêter sa planification future en conservant l'historique.
- Filtrer et rechercher les tâches par titre, groupe et fréquence.
- Afficher les tâches dont la fréquence ou la date initiale reste à renseigner dans une liste « À configurer ».

### Planning

- Proposer des vues jour, semaine et mois ; semaine du lundi au dimanche.
- Afficher sur chaque carte le titre, le groupe, la fréquence, le membre responsable et le statut ; pour une séance, ajouter le nombre d'étapes réalisées / prévues.
- Placer une tâche sur une date depuis le catalogue et déplacer une occurrence entre deux dates.
- Sur ordinateur : glisser-déposer à la souris.
- Sur téléphone : déplacement tactile avec poignée dédiée, sans empêcher le défilement ; action « Déplacer vers… » toujours disponible.
- Offrir la même action sans glisser-déposer pour le clavier et les technologies d'assistance.
- En vue mois, afficher quelques cartes et un bouton ouvrant la liste complète lorsque le jour est chargé.
- Garder les tâches sans date dans une liste « À planifier », distincte des tâches en retard.
- Prévoir une action pour annuler un déplacement accidentel.

### Répétition des tâches

- Prendre en charge les cinq fréquences des documents. Le catalogue initial est récurrent ; permettre aussi de créer une tâche ponctuelle si nécessaire.
- Générer les occurrences à partir d'une date de départ explicite.
- Une répétition mensuelle suit le calendrier : le 31 devient le dernier jour des mois plus courts, puis revient au 31 lorsqu'il existe. Même principe pour tous les deux mois.
- Les répétitions toutes les deux semaines suivent un intervalle de 14 jours, à partir de la date choisie.
- Déplacer une occurrence ne modifie pas les prochaines échéances par défaut. Exemple : une tâche du lundi déplacée au mardi reste prévue le lundi suivant.
- Pour une modification de fréquence ou de date habituelle, proposer « Cette occurrence » ou « Celle-ci et les suivantes ». Conserver les occurrences passées et terminées.
- Cocher une tâche valide uniquement l'occurrence concernée ; la prochaine occurrence reste à faire.
- Éviter toute création de doublon lors d'un rechargement ou d'une navigation entre les vues.
- Stocker les dates du planning comme dates civiles ; une ouverture sur un autre appareil ne doit pas décaler une tâche d'un jour.

### Suivi et récapitulatifs

- Cocher et décocher une occurrence facilement.
- Afficher « Aujourd'hui » et « Cette semaine » avec les tâches à faire et le compteur réalisées / prévues.
- Garder les tâches échues non réalisées visibles dans une section « En retard » ; les proposer au report sans les déplacer automatiquement.
- Permettre de masquer les tâches terminées tout en gardant leur historique consultable.
- Recalculer les récapitulatifs après chaque création, déplacement ou changement de statut.

### Affectation aux membres — retenue pour la V1

- Gérer les membres du foyer et attribuer chaque tâche ou séance à un membre et à une date. Conserver temporairement les éléments non attribués dans une liste permettant de terminer la répartition.
- Définir un responsable habituel pour une série récurrente ; les nouvelles occurrences héritent de ce responsable.
- Permettre de réattribuer une occurrence à un autre membre sans changer les prochaines. Proposer aussi une modification pour « Celle-ci et les suivantes », en conservant l'historique.
- Filtrer les vues jour, semaine et mois par membre ; proposer un récapitulatif « Mes tâches » et un récapitulatif du foyer.
- Distinguer le responsable prévu et le membre qui a effectivement coché la tâche, pour conserver un historique fidèle.
- Les membres autorisés peuvent consulter le planning commun et cocher une tâche du foyer.

### Tâches individuelles et séances — les deux retenues pour la V1

- Une tâche individuelle correspond à une action planifiable et cochable, par exemple « Sortir la poubelle jaune ».
- Une séance regroupe plusieurs actions dans une checklist ordonnée, par exemple « Ménage cuisine ». La séance possède une date, un responsable habituel et une répétition ; chaque action conserve sa propre fréquence.
- Afficher uniquement les actions dues à la date de la séance, plus les étapes de préparation / rangement retenues. Les actions moins fréquentes ne doivent pas être proposées à chaque séance hebdomadaire.
- Une action due à une date sans séance correspondante reste visible comme tâche individuelle. Le regroupement ne doit ni masquer une échéance ni modifier implicitement sa fréquence.
- Permettre de regrouper des actions planifiées dans une séance et d'en sortir une action pour la déplacer ou l'attribuer séparément.
- Les actions d'une séance héritent de son responsable sauf affectation explicite à un autre membre.
- Déplacer une séance déplace les actions qu'elle contient pour cette occurrence ; leurs répétitions futures restent inchangées. Une action déjà terminée conserve sa date de réalisation et son historique.
- Une action présente dans une séance ne doit pas aussi produire une seconde occurrence indépendante pour la même échéance.
- La progression d'une séance repose sur ses étapes ; sa clôture ne doit pas valider silencieusement les actions non cochées.
- Les compteurs des récapitulatifs comptent les actions à réaliser ; une séance est un regroupement et n'ajoute pas une tâche supplémentaire au total.
- Exemple : la séance « Cuisine » peut être hebdomadaire, mais « Nettoyer le four » ne rejoint la checklist que lorsque son échéance tous les deux mois est due. Terminer cette action ne valide pas son échéance suivante.

## 4. Écrans et ergonomie

| Écran | Usage principal |
| --- | --- |
| Aujourd'hui | Voir les actions du jour, les retards et cocher les tâches |
| Planning | Organiser la semaine ou le mois et déplacer les tâches |
| Tâches | Consulter le catalogue, rechercher, créer et modifier |
| Détail d'une tâche / séance | Lire les consignes, régler la répétition, consulter la checklist |
| Réglages | Configurer le foyer et ses membres, exporter et importer les données |

Sur ordinateur, la vue semaine peut présenter sept colonnes et un panneau de tâches à planifier. Sur téléphone, privilégier une liste par jour avec navigation dans la semaine ; la grille mensuelle sert de repère et ouvre le détail d'un jour.

L'interface doit rester lisible à partir de 360 px de large, utiliser des zones tactiles confortables, afficher les libellés longs sans perdre leur sens et rendre les principaux gestes accessibles au clavier. Les informations doivent rester compréhensibles sans distinguer les couleurs.

Les premières maquettes de cadrage sont décrites dans `docs/MAQUETTES.md` et représentées dans `docs/maquettes/planning-pc.svg` et `docs/maquettes/planning-mobile.svg`. Elles illustrent les dispositions proposées avec des données fictives ; elles ne constituent pas une application fonctionnelle.

## 5. Données et hébergement

### Stockage retenu et contrainte de coût

Firebase Cloud Firestore est retenu pour le stockage du planning et sa synchronisation entre appareils. L'interface reste destinée à GitHub Pages.

**Exigence : coût nul, projet Firebase au forfait Spark, sans compte de facturation lié.** Ne pas basculer vers Blaze ni activer un essai nécessitant une facturation. Si les quotas sont atteints, accepter une indisponibilité temporaire du service plutôt qu'une dépense.

- Utiliser une seule base Cloud Firestore Standard bénéficiant des quotas gratuits : 1 Gio de données, 50 000 lectures, 20 000 écritures et 20 000 suppressions par jour ; 10 Gio de transfert sortant par mois. Ces limites ont été vérifiées le 5 octobre 2026.
- Proposer Firebase Authentication avec connexion Google comme option initiale, à confirmer lors du choix du mode d'accès ; ne pas utiliser l'authentification par SMS.
- Restreindre les accès aux membres autorisés du foyer par des règles Firestore ; ne pas laisser la base en mode test ouvert.
- Prévoir une gestion du foyer et des membres pour le contrôle d'accès et l'affectation des tâches.
- Limiter les lectures aux dates et aux données utiles ; calculer les répétitions côté application, sans Cloud Functions. Ne pas générer une quantité illimitée d'occurrences futures.
- Conserver les PDF comme sources du catalogue ; aucun stockage de fichiers Firebase n'est nécessaire pour la V1.
- Prévoir un export manuel des données ; les sauvegardes gérées payantes de Firestore ne sont pas utilisées.
- Afficher un message explicite si une opération de synchronisation échoue, avec possibilité de réessayer. Ne pas présenter une modification comme synchronisée tant que son enregistrement n'est pas confirmé.

Sources : [forfaits Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [quotas Cloud Firestore](https://firebase.google.com/docs/firestore/quotas).

### Comparaison des modes de stockage

| Mode | Fonctionnement | Conséquence |
| --- | --- | --- |
| Local par appareil | Données enregistrées dans le navigateur ; export / import de sauvegardes | Simple, mais un téléphone et un PC ont chacun leur planning sans synchronisation automatique |
| Planning partagé | Données communes au foyer dans un stockage distant avec contrôle d'accès | Synchronisation entre appareils et personnes ; nécessite un service complémentaire |

GitHub Pages peut héberger les fichiers HTML, CSS et JavaScript de l'interface. Il fournit un hébergement statique ; le partage des données devra donc passer par un service distinct si ce mode est retenu. Source : [documentation GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Avant réalisation, préciser : accès au foyer, connexion des utilisateurs et règle pour deux modifications simultanées. Une sauvegarde distante doit afficher son succès ou son échec, avec possibilité de réessayer.

Prévoir un export / import des données avec numéro de version et validation avant import. Les données personnelles du planning doivent être stockées dans le navigateur ou le service dédié, plutôt que dans les fichiers publiés avec le site.

### Structure proposée pour permettre les évolutions

Séparer le catalogue, les règles de répétition, les occurrences planifiées et l'historique de réalisation. Une occurrence possède sa propre date et son propre statut : modifier ou terminer une occurrence ne modifie pas la définition de la tâche.

Entités principales : foyer, membre, groupe / pièce, définition de tâche, règle de répétition, occurrence, réalisation, modèle de séance et séance planifiée. Conserver une identité unique pour chaque occurrence d'action, qu'elle soit affichée individuellement ou dans une séance.

Séparer les écrans, les règles métier du planning et l'accès aux données. Le stockage local ou distant passe par une interface commune. Prévoir des identifiants stables et des migrations de données pour préserver les plannings lors des mises à jour.

### Services dédiés et migration future

**Exigence de migrabilité :** remplacer la base et l'authentification sans réécrire les écrans ni les règles du planning. Le choix des implémentations se fait dans un point de configuration unique. La reprise des données et des comptes constitue une étape distincte, à préparer par des formats documentés et des identifiants indépendants du fournisseur.

- Centraliser l'accès aux données dans des services dédiés : planning, catalogue et foyer. Centraliser la connexion, la déconnexion et l'observation de la session dans un service d'authentification distinct.
- L'interface et les règles de récurrence utilisent des contrats et des modèles propres à l'application. Aucun composant d'interface ne doit importer le SDK Firebase, utiliser ses objets ou appeler directement Firestore ou Firebase Authentication.
- Fournir les implémentations Firebase derrière ces contrats pour la V1. Les futures implémentations Supabase ou API PostgreSQL / Keycloak remplaceront ces adaptateurs ; l'interface continue à appeler les mêmes services.
- Utiliser des identifiants métier stables pour les membres, foyers, tâches et occurrences. Une correspondance séparée relie le membre de l'application à son identité Firebase, puis à sa future identité Keycloak. Les affectations et l'historique ne dépendent pas directement de l'identifiant du fournisseur d'authentification.
- Convertir les dates, références et erreurs spécifiques à Firebase dans l'adaptateur. Les modèles exposés utilisent des identifiants simples, des dates civiles et des valeurs sérialisables.
- Prévoir un export métier versionné qui conserve les relations entre entités ; cet export facilitera la transformation des documents Firestore en tables PostgreSQL.
- Les autorisations restent vérifiées côté backend : règles Firestore en V1, puis contrôles de l'API et de la base dans la solution auto-hébergée. Une restriction dans l'interface seule ne suffit pas.
- La migration future nécessite une conversion des données, une correspondance des comptes et une adaptation des autorisations ; elle ne se résume pas à remplacer une URL. Le maintien des mots de passe ou des connexions existantes sera étudié à ce moment-là.

Le détail des responsabilités et de la trajectoire de migration figure dans `docs/ARCHITECTURE_ET_MIGRATION.md`.

Le framework sera choisi après les décisions fonctionnelles ; le stockage utilisera Firebase Cloud Firestore au forfait Spark. La publication devra prendre en compte le chemin du dépôt GitHub Pages, l'ouverture directe d'une page et le rechargement du navigateur.

## 6. Critères de validation de la V1

1. Les tâches des deux PDF sont reprises ; leurs fréquences sont conformes aux couleurs et les cas ambigus sont résolus ou explicitement signalés.
2. Une tâche peut être créée, placée sur une date puis déplacée sur PC et téléphone ; l'action est aussi possible sans glisser-déposer.
3. Les vues jour, semaine et mois montrent les mêmes occurrences et les mêmes statuts.
4. Cocher puis recharger conserve la réalisation ; décocher remet l'occurrence à faire.
5. Cocher une tâche récurrente ne coche pas l'occurrence suivante.
6. Reporter une occurrence ne déplace pas sa série ; modifier les échéances futures conserve le passé.
7. Les tâches mensuelles aux fins de mois et celles toutes les deux semaines suivent les règles décrites, sans doublons.
8. Les récapitulatifs distinguent les tâches du jour / de la semaine et les retards.
9. Une tâche archivée ne génère plus d'échéances futures, mais son historique reste consultable.
10. L'application reste utilisable sur écran de téléphone et ordinateur, avec des titres longs, beaucoup de tâches et un mois chargé.
11. Une réalisation faite sur téléphone est visible sur PC et par les autres membres autorisés après synchronisation.
12. Un export peut être réimporté sans perdre les dates, les répétitions ni l'historique.
13. Le site publié fonctionne depuis son URL GitHub Pages, y compris après rechargement.
14. Les services utilisés fonctionnent au forfait Firebase Spark sans compte de facturation lié ; l'application traite les erreurs de quota sans nécessiter de passage à une offre payante.
15. Une réattribution ponctuelle change le responsable de cette occurrence uniquement ; une modification des responsables futurs préserve l'historique.
16. Les séances et les tâches individuelles peuvent coexister sans doubler les occurrences ni les compteurs ; les actions moins fréquentes apparaissent uniquement lorsqu'elles sont dues.
17. Déplacer une séance déplace ses actions à faire sans modifier leurs prochaines échéances ; sortir une action de la séance conserve son identité et son statut.
18. Une carte permet de lire simultanément la récurrence et la pièce grâce à deux repères distincts ; les libellés restent compréhensibles sans les couleurs.
19. Les imports et appels Firebase sont limités aux adaptateurs et à leur initialisation ; les écrans et les règles du planning utilisent uniquement les contrats de l'application.
20. Un export métier versionné conserve les identifiants, les relations, les affectations, les répétitions et l'historique, sans exposer de jetons ou de mots de passe.
21. Les droits du foyer sont contrôlés côté backend ; un utilisateur non membre ne peut ni lire ni modifier son planning.
22. Les mêmes opérations du planning fonctionnent avec un adaptateur de test, sans modification des écrans ou des règles métier ; la sélection de l'adaptateur se fait au point d'initialisation unique.

## 7. Évolutions possibles après la V1

Rappels, installation comme application web, mode hors connexion synchronisé, estimation des durées, répartition de la charge entre personnes, statistiques, listes de courses, suivi des stocks et autres routines de la maison.

Migration de la base et de l'authentification vers la solution de l'utilisateur : PostgreSQL et Keycloak, avec Supabase comme option si retenue plus tard. Cette migration sera traitée quand l'infrastructure sera disponible, sur la base des services et exports préparés dès la V1.

Ces éléments restent hors du périmètre initial sauf décision explicite. L'affectation aux membres et les séances sont incluses dans la V1.

## 8. Décisions ouvertes

1. Firebase gratuit retenu pour le stockage partagé ; mode de connexion et accès au foyer à préciser.
2. Date de départ des répétitions, membres et répartition initiale : à renseigner au premier paramétrage.
3. Étapes sans couleur et lignes avec fréquences multiples : valider les règles de reprise avant de figer le catalogue.

Après ces décisions : mettre à jour le cahier des charges, proposer les maquettes principales, puis réaliser et vérifier l'application avant sa publication.
