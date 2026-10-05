# Cahier des charges — Planning de la maison

Version 0.7 — cadrage et améliorations après essais, 5 octobre 2026.

Décision utilisateur : utiliser Firebase pour le stockage avec une contrainte de coût nul. La configuration du compte interviendra après le cadrage.

Précision utilisateur : conserver Firebase pour la V1, en préparant une migration future de la base de données et de l'authentification vers sa solution PostgreSQL et Keycloak. Supabase reste une option ultérieure ; aucun remplacement ni déploiement de Supabase ou Keycloak n'est demandé à ce stade.

Décisions utilisateur : affectation à un membre et à une date dès la V1 ; tâches individuelles et séances avec checklist. Les tâches initiales sont récurrentes selon les fréquences des PDF ; les étapes sans fréquence explicite restent à traiter séparément.

Ce document cadre la réalisation. Une première version locale est maintenant implémentée. Le code a été envoyé sur GitHub. Après les essais locaux, l'utilisateur demande maintenant de préparer les comptes, Firestore et le déploiement GitHub Pages. Le fonctionnement multi-famille doit être finalisé avant la publication. Les points indiqués « à décider » restent ouverts.

### Décisions issues du dernier essai

- Conserver le fonctionnement général et l'ergonomie actuels, qui conviennent à l'utilisateur.
- Corriger la redondance lorsqu'une tâche quotidienne est déplacée sur un jour qui contient déjà la même tâche. Il s'agit d'une collision entre occurrences de la même tâche, pas d'une fusion automatique de titres similaires.
- Permettre de configurer une liste facultative de sous-tâches à l'intérieur d'une tâche. Cocher toute cette liste ne termine pas la tâche principale.
- Tester une configuration des tâches regroupée par pièce dans des sections dépliables.
- Utiliser les durées estimées pour proposer une réorganisation sur une semaine ou un mois, avant confirmation, afin d’alléger les journées chargées.
- Garder le nom « Maison » et la direction actuelle, tout en explorant davantage de personnalité et d'originalité, avec une attention aux polices et à la lisibilité.
- Prévoir plus tard un hub permettant de choisir entre le ménage, les repas / recettes et les courses. Ces nouveaux espaces ne sont pas à développer maintenant.

## 1. Objectif

Créer une application web en français, agréable à utiliser sur téléphone et ordinateur, pour organiser les tâches de la maison dans un planning, déplacer les tâches facilement et suivre ce qu'il reste à faire chaque jour et chaque semaine.

La première version couvre la planification et le suivi. L'organisation du code et des données doit permettre d'ajouter des fonctionnalités sans refaire le planning.

## 2. Documents sources

- `EDT MAINTENIR LA MAISON PROPRE.pdf` : 7 pages, tâches par pièce et légende des fréquences.
- `EDT MAINTENIR LA MAISON PROPRE Tache tranverse.pdf` : 2 pages, tâches communes à la maison.

Les textes, les regroupements et les fréquences des PDF servent de base au catalogue historique de M&Ms et à la démonstration ; les nouvelles familles commencent sans tâches. Les PDF décrivent des fréquences, pas un calendrier daté complet. Les dates de démarrage seront choisies dans l'application.

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
- Ajouter une durée estimée facultative configurable en minutes (1 à 1440). Cette estimation sert aux propositions d’équilibrage ; sa saisie ne déclenche pas de déplacement automatique. Ne pas présenter une durée proposée comme une donnée des PDF. À la demande de l’utilisateur, des estimations de travail actif sont proposées pour le catalogue historique de M&Ms, modifiables avant leur enregistrement. Le champ vide signifie « inconnue », jamais zéro minute.
- Dans Aujourd'hui, Agenda et Tâches, proposer les filtres « 15 min ou moins », « 16 à 30 min », « Plus de 30 min » et « Durée à renseigner », ainsi qu'un tri du plus court au plus long et l'inverse. Dans le catalogue, trier à l'intérieur de chaque pièce. Dans l'agenda, trier les cartes à l'intérieur de chaque jour sans modifier leurs dates ; les séances utilisent la somme de leurs actions. Les durées inconnues ou incomplètes restent en fin de tri.
- Afficher l'estimation sur les tâches, les séances et leur détail ; afficher le temps restant estimé des tâches filtrées pour le jour ou la période. Additionner les durées des tâches principales, sans ajouter de temps pour le regroupement en séance ni pour les sous-tâches. Si des durées manquent, signaler une estimation partielle (« Au moins… ») et le nombre de durées manquantes.
- Regrouper la liste de configuration par pièce ou catégorie dans des sections dépliables avec un nombre de tâches. Tester « Tout déplier / Tout replier » et l'ouverture automatique des sections contenant les résultats d'une recherche.
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

### Collisions lors des déplacements — correction prioritaire

- Cas signalé : déplacer une occurrence quotidienne sur un jour contenant déjà une occurrence de la même tâche affiche deux fois cette tâche.
- Un déplacement par glisser-déposer, formulaire ou séance ne doit pas laisser deux actions à réaliser pour la même tâche sur le même jour, ni doubler les compteurs.
- Identifier les collisions par l'identité métier de la tâche et le jour cible. Deux tâches distinctes portant le même titre ne sont pas automatiquement fusionnées.
- Décision utilisateur : proposer de regrouper les deux occurrences, avec un avertissement et une confirmation explicite avant toute modification. Permettre d'annuler pour conserver le planning tel qu'il était avant le déplacement.
- L'avertissement explique que cette tâche existe déjà au jour cible et que le regroupement ne laissera qu'une action à réaliser ce jour-là. Exemple de message : « Cette tâche est déjà prévue ce jour-là. Regrouper les deux occurrences en une seule ? »
- Règle retenue pour la première implémentation : conserver l'occurrence du jour cible, son responsable et son statut, même si elle est déjà terminée. Enregistrer les occurrences absorbées avec un lien de regroupement, sans les compter ni les afficher comme actions supplémentaires. L'avertissement présente ces conséquences. Les autres actions d'une séance sont déplacées normalement.
- Permettre d'annuler le déplacement confirmé, regroupement compris, tant que le planning n'a pas été modifié entre-temps. Le traitement des progressions de sous-tâches différentes sera précisé lors de leur implémentation.
- Conserver les prochaines échéances de la série et appliquer le même comportement sur téléphone et PC.

### Sous-tâches facultatives à l'intérieur d'une tâche

- Permettre d'ajouter, modifier, ordonner et retirer une liste de sous-tâches dans la configuration d'une tâche. Une tâche peut fonctionner sans cette liste.
- Exemple : « Réunir le matériel » peut contenir une liste personnalisée de matériel à préparer.
- Les cases de cette liste servent au suivi interne. Même lorsque toutes sont cochées, la tâche principale reste à faire jusqu'à sa validation explicite.
- Ces sous-tâches sont distinctes des actions planifiables regroupées en séance ; elles n'ajoutent pas de tâches au compteur du planning.
- Enregistrer leur progression pour l'occurrence concernée, sans valider les sous-tâches des prochaines répétitions.
- Éditeur amélioré : une ligne de saisie par sous-tâche, bouton « Ajouter une étape », suppression et commandes pour monter / descendre une ligne, y compris pour une tâche « À configurer — sans échéance ». La liste est facultative et ordonnée ; ses cases sont accessibles dans le détail d'une occurrence planifiée. Retirer les lignes vides à l'enregistrement.
- Les deux validations sont indépendantes : cocher / décocher la tâche principale ne change pas les cases internes, et modifier les cases internes ne change pas le statut principal, même après réalisation de la tâche.
- Une modification de tâche récurrente conserve les définitions passées par le mécanisme existant de nouvelle série. L'éditeur conserve l'identifiant d'une sous-tâche lors d'un renommage ou d'un changement d'ordre ; une nouvelle ligne crée un nouvel identifiant. Les progressions, durées et listes sont conservées dans l'export métier.

### Répétition des tâches

- Prendre en charge les cinq fréquences des documents. Le catalogue initial est récurrent ; permettre aussi de créer une tâche ponctuelle si nécessaire.
- Permettre de choisir un ou plusieurs jours parmi lundi à dimanche dans la configuration d'une routine quotidienne, hebdomadaire ou toutes les deux semaines. Présenter sept boutons de sélection et les raccourcis « Tous » / « Lun–Ven », avec un récapitulatif lisible. Exiger au moins un jour pour ces routines.
- Pour la fréquence quotidienne ou hebdomadaire, planifier uniquement les jours sélectionnés à partir de la date de départ. Pour toutes les deux semaines, utiliser les jours sélectionnés une semaine sur deux, en ancrant les semaines du lundi au dimanche sur la semaine de la date de départ. Ne pas créer d'échéance antérieure à cette date.
- Conserver les répétitions mensuelles, bimestrielles et ponctuelles basées sur la date de départ ; désactiver le sélecteur hebdomadaire et expliquer ce fonctionnement pour ces fréquences. Les tâches existantes sans liste de jours conservent leur calcul actuel.
- Stocker les jours sous forme de liste métier `weekdays` (0 = lundi, 6 = dimanche), incluse dans l'export. Une modification de configuration utilise la séparation des séries pour préserver le passé et les réalisations ; un déplacement ponctuel conserve les jours des prochaines échéances.
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
- La progression d'une séance repose sur ses tâches principales. Décision utilisateur : ajouter une case explicite pour terminer toutes les tâches de cette séance à cette date ; décocher remet ses tâches à faire. Les prochaines répétitions et les sous-tâches internes restent inchangées. Cocher la séance conserve les informations de réalisation des actions déjà terminées. Cette commande porte sur toute la séance, même si un filtre masque certaines actions.
- Lorsque toutes ses actions sont faites, barrer le titre de la séance dans l'agenda et son détail, y compris en vue mois. Décocher une action retire cet état. Les sous-tâches internes ne participent pas à ce calcul : le statut explicite des tâches principales fait foi.
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

### Direction visuelle à explorer

Conserver le nom « Maison », l'ambiance claire et chaleureuse et les repères actuels. Apporter davantage de personnalité par des détails graphiques, des icônes ou illustrations discrètes et une typographie cohérente. Les choix précis restent à tester ; aucun changement complet d'identité n'est décidé.

Privilégier des textes et commandes lisibles sur téléphone comme sur PC, une hiérarchie claire et des contrastes suffisants. Garder les éléments décoratifs au service de la lecture et des actions. La future identité doit convenir à l'ensemble du foyer, y compris aux espaces repas et courses.

Sur téléphone, le bouton d'ajout de tâche est circulaire, vert doux et aligné avec le titre, avec une cible tactile de 44 px et un léger retour à l'appui. Son nom accessible reste « Nouvelle tâche » ; sur ordinateur, conserver le bouton avec son libellé.

### Ajustements à essayer — récapitulatifs et accès rapides

- Dans l'onglet Aujourd'hui uniquement, conserver la carte d'origine avec son cercle de pourcentage, le nombre d'actions réalisées et une estimation discrète du temps restant. Un simple choix « Aujourd'hui » / « Cette semaine » affiche les tâches et séances du jour actuel ou de la semaine en cours, présentées par journée. Ouvrir le jour courant par défaut. Ne pas ajouter ce bloc à la grille principale de l'agenda, ni de navigation vers d'autres dates.
- Le récapitulatif porte uniquement sur le jour actuel, ou sur la semaine en cours du lundi au dimanche. Le membre connecté est imposé dans Aujourd’hui ; les filtres de pièce, fréquence et durée sont pris en compte ; masquer les tâches terminées ne doit pas retirer les réalisations du récapitulatif. Les durées inconnues sont signalées plutôt que comptées comme zéro.
- Après essai, supprimer le bandeau avec barre de progression, les sept repères de navigation et le détail par personne. Revenir au cercle de pourcentage et conserver uniquement le choix du jour actuel ou de la semaine en cours, sans changer la date ni la vue de l'agenda.
- Dans Aujourd'hui, afficher la semaine en cours en grille avec une colonne par jour du lundi au dimanche et ses tâches / séances dessous. Sur les écrans étroits, permettre le défilement horizontal des colonnes, sans faire déborder la page. Conserver le cercle de pourcentage et la liste habituelle pour le jour actuel.
- Aujourd'hui est une vue personnelle : montrer uniquement les occurrences assignées au membre connecté, y compris ses retards, son pourcentage et son temps estimé. Dans les séances partagées, le détail, les compteurs et la case de validation portent uniquement sur ses actions ; terminer la séance depuis cette vue ne coche pas les actions des autres. Retirer le filtre de membre et le bouton bascule « Mes tâches » de cette vue. L'agenda conserve l'accès aux tâches du foyer et son filtre par membre.
- Sur téléphone, replier les options derrière « Filtrer ». Garder les filtres actifs visibles sous forme de pastilles supprimables et proposer une réinitialisation. Sur PC, conserver les filtres directement accessibles.
- Dans l'éditeur, afficher une phrase de synthèse de la récurrence et de la durée facultative avant d'enregistrer. Actualiser cette phrase lorsque les jours, la fréquence, la date de départ ou la durée changent ; conserver la règle de date pour les récurrences mensuelles.
- Distinguer discrètement les séances des tâches individuelles avec un fond légèrement teinté et une petite icône, sans agrandir les indications de responsable.
- Ajouter « Dupliquer » dans le catalogue : ouvrir une nouvelle tâche modifiable reprenant pièce, responsable, consignes, récurrence, durée et sous-tâches. Utiliser une nouvelle date de départ, de nouveaux identifiants et aucun historique de réalisation ; la copie n'est pas automatiquement intégrée à la séance d'origine. Ne rien créer avant la validation du formulaire.
- Réduire les notifications de réussite ordinaires à un message clair, discret et bref. Garder les erreurs et les notifications avec une action d'annulation plus visibles et plus longtemps.
- Restaurer la présentation habituelle de l'agenda : grille PC inchangée, estimation du temps en haut et compteur de la période dans le panneau calendrier repliable. Réserver le nouveau sélecteur Jour / Semaine à Aujourd'hui. Les retards affichés dans Aujourd'hui restent séparés du programme et ne dupliquent pas les actions de la période choisie.

### Reports, configuration et équilibrage — première implémentation à essayer

- Dans les séances personnelles, afficher « Mes actions · 2/3 » ; nommer la case « Terminer mes actions » pour préciser qu'elle ne valide pas celles des autres membres.
- Ajouter un bouton discret de report sur les cartes non terminées : « Demain » (ou « Le lendemain » pour une date future) et choix d'une date. Utiliser le même avertissement de collision, la même confirmation de regroupement et la même annulation que le glisser-déposer. Seules les actions encore à faire sont reportées, sans modifier les prochaines répétitions.
- Conserver les champs principaux, les jours de récurrence et la durée directement accessibles. Regrouper consignes et sous-tâches dans une section facultative dépliable, repliée par défaut. Regrouper les retards dans « À rattraper », replié par défaut avec leur nombre.
- Retirer le bandeau « Aperçu interactif / Données d'exemple locales » et « Exemple local » du planning. Le mode de stockage reste expliqué dans Réglages : retirer le bandeau ne connecte pas l'application à Firebase.
- Ajouter « Équilibrer » dans Aujourd'hui et Agenda : semaine ou mois complet correspondant à la date affichée. Dans Aujourd'hui, limiter la proposition au membre connecté ; dans Agenda, permettre de choisir le foyer ou un membre. Les autres filtres de l'écran ne limitent pas la proposition, ce qui est indiqué dans le formulaire.
- Répartir le temps estimé des actions encore à faire entre les jours ; à gain de temps équivalent, réduire l'écart du nombre d'actions. Le total de tâches et de temps estimé ne diminue pas. L'algorithme propose une amélioration, sans promettre un optimum mathématique.
- Protéger les actions quotidiennes, les tâches marquées « Jour fixe », les actions terminées et les dates passées. Respecter les jours de semaine sélectionnés, les bornes de la série, l'ordre des occurrences et l'absence de doublons. Les actions hebdomadaires / bimensuelles restent dans leur semaine d'origine, même en mode mois.
- Conserver ensemble les actions déplaçables d'une même séance à une date ; les actions fixes ou attribuées à un autre membre restent en place. Les prochaines répétitions et les progressions de sous-tâches sont conservées ; les responsables restent identiques hors des changements explicitement proposés dans la portée « Tout le foyer ».
- Pour les durées inconnues, proposer explicitement une hypothèse configurable (15 min par défaut), montrer le nombre d'actions concernées et ne pas enregistrer cette hypothèse comme durée de la tâche.
- Montrer l'avant / après par journée, les charges maximales et la liste des reports. N'écrire aucun changement avant « Appliquer les reports ». Appliquer les positions finales en une seule opération, sans fusion, et refuser une proposition périmée si le planning a changé. Proposer une annulation immédiate, protégée contre les modifications ultérieures.
- Vérifier les parcours au clavier et les cibles tactiles dans le code. L'essai sur un téléphone physique reste à effectuer avant publication.

### Fluidité des interactions — retenue après essai

- Animer discrètement l'ouverture et la fermeture des fenêtres, y compris la fermeture par Échap et clic hors de la fenêtre. Rendre le focus à la commande d'origine lorsque celle-ci est toujours disponible.
- Animer les sections dépliables sans reconstruire l'ensemble de la page ; conserver leur état pendant la modification des tâches.
- Préserver autant que possible le focus, la sélection dans un champ, le défilement de la page et celui de la semaine lors des actualisations du planning.
- Montrer un indicateur d'enregistrement sur le bouton utilisé et empêcher sa soumission répétée pendant l'opération.
- Adoucir les retours des boutons, les progressions et les notifications ; renforcer le repère du jour cible pendant un déplacement.
- Garder des animations courtes (environ 140 à 200 ms) et les désactiver lorsque l'utilisateur demande une réduction des mouvements. Vérifier le ressenti réel sur téléphone et PC.
- Personnaliser également les menus de sélection (membres, pièces, fréquences et formulaires) : liste arrondie, option choisie marquée d'une coche, couleurs des pièces / fréquences et ouverture discrète. Conserver le clavier, la fermeture par Échap et les valeurs des formulaires.
- Pour la recherche, remplacer le cadre de focus carré autour du texte par un contour arrondi sur l'ensemble du champ, sans retirer le repère de focus.
- Permettre de replier le volet de navigation gauche en une barre d'icônes accessible, puis de le rouvrir. Permettre également de masquer / réafficher le panneau calendrier et récapitulatif pour donner plus de place à l'agenda. Ces choix ne modifient pas les données du foyer.
- Après essai, revenir à la grille PC précédente à la demande de l'utilisateur : sept colonnes de largeur habituelle, cartes sans troncature des titres, défilement de la page plutôt qu'une zone verticale limitée. Conserver les durées estimées et les autres fonctionnalités ; la variante avec colonnes élargies, en-têtes fixes et cartes compactes n'est pas retenue.
- Renforcer les affectations : noms visibles et compte d'actions par membre sur les cartes de séance, synthèse « Qui fait quoi » dans leur détail et responsable clairement marqué sur chaque action. Éviter le seul libellé « 2 responsables » qui ne précise pas la répartition.
- Replier la navigation sans reconstruire ses éléments, avec une transition de largeur et un effacement progressif des libellés ; préserver le focus et le défilement horizontal / vertical de l'agenda.

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
23. Déplacer une tâche quotidienne sur un jour contenant déjà cette même tâche propose un regroupement avec avertissement et confirmation. Après confirmation, il ne reste qu'une action à réaliser et le compteur n'est pas doublé ; l'historique est préservé. Annuler conserve le planning antérieur au déplacement.
24. Une tâche peut avoir ou non une liste de sous-tâches. Cocher toutes les sous-tâches ne termine pas automatiquement la tâche principale ; leur progression reste propre à chaque occurrence.
25. La configuration par pièces dépliables permet de retrouver, consulter et modifier une tâche sur PC et téléphone, y compris après une recherche.
26. Une durée estimée peut être renseignée et conservée dans les données de la tâche et dans l'export ; sa saisie seule ne déplace aucune tâche.
27. Le récapitulatif jour / semaine suit les filtres et les validations, sans perdre les actions faites lorsque leurs cartes sont masquées ; le choix de période affiche les tâches et séances du jour actuel ou de la semaine en cours dans Aujourd'hui, avec un cercle de pourcentage et sans navigation vers d'autres dates.
28. La duplication ne modifie pas la tâche d'origine, ne reprend pas ses réalisations et ne crée une tâche indépendante qu'après validation.
29. Sur téléphone, les filtres peuvent être ouverts, retirés individuellement ou réinitialisés, sans modifier les données du foyer.
30. Une proposition semaine / mois n’écrit rien avant confirmation, conserve les identités, réalisations et répétitions, n’applique que les changements de responsable annoncés, refuse un état périmé et peut être annulée immédiatement.
31. Reporter une tâche depuis sa carte utilise les mêmes règles de collision que le glisser-déposer ; les options facultatives et les retards sont repliables.
32. Stats calcule les réalisations à partir des validations enregistrées, distingue auteur et responsable, signale les données inconnues, ne double pas les regroupements et conserve les versions archivées. La consultation, les filtres et l’export ne modifient pas le planning.

## 7. Évolutions possibles après la V1

### Équilibrage — évolutions ultérieures

Une première proposition d'équilibrage semaine / mois est désormais implémentée dans le périmètre courant, avec aperçu, confirmation et annulation. Les contraintes retenues sont décrites plus haut.

Pour la suite : budgets de temps par jour, disponibilités et préférences de week-end, contraintes d'espacement plus précises et réduction des changements entre propositions. Une préférence d'alternance après réalisation est incluse dans les propositions explicites ; une rotation stricte hors de ce parcours reste hors périmètre.

### Regroupement par pièce et alternance — première implémentation

- Décision utilisateur : l'alternance intervient uniquement lorsque l'on clique sur « Équilibrer ». C'est une préférence secondaire : plusieurs réalisations par la même personne restent possibles, sans rotation stricte ni réattribution au moment de cocher.
- Favoriser un regroupement modéré des tâches d'une même pièce après l'équilibrage du temps. Limiter la charge maximale au pic de l'équilibrage seul plus une marge de 15 min ou 10 % (la plus grande), et limiter le coût en dispersion du temps pour chaque regroupement. Respecter les jours fixes, les jours choisis et les contraintes des occurrences. La proposition permet de désactiver ce regroupement.
- Tous les membres participent par défaut ; dans les options facultatives d'une tâche, permettre de restreindre les participants et de désactiver la préférence d'alternance. Une alternance activée nécessite au moins un participant.
- Décision utilisateur : la personne qui coche est considérée comme ayant effectué la tâche, via `completedBy`. La dernière validation sert de référence, même si le responsable assigné était différent.
- Dans la portée « Tout le foyer », proposer si possible un autre membre pour la première prochaine occurrence future d'une série après une réalisation. Privilégier un participant différent du dernier auteur, sans déséquilibrer fortement la charge de ce membre. L'affectation change seulement après validation explicite de la proposition.
- Décision utilisateur : une occurrence restée à faire garde son responsable. Conserver les réalisations, les tâches du jour, les retards, les responsables déjà enregistrés dans une exception et les occurrences futures précédées d'une occurrence encore à faire. Ne pas forcer la rotation des suivantes sans nouvelle réalisation.
- Dans Aujourd'hui ou une portée limitée à un membre, ne pas réattribuer les tâches à d'autres membres ; l'alternance est réservée aux propositions pour le foyer complet.
- L'aperçu liste chaque changement de responsable avec le dernier auteur et la date. Une proposition sans déplacement de date peut néanmoins être appliquée si elle contient un changement de responsable. L'annulation restaure dates et affectations.
- Conserver un identifiant de série optionnel lors des modifications des récurrences pour relier les réalisations aux nouvelles définitions. Ne pas déduire une identité commune de titres similaires. Les nouvelles options sont conservées dans l'export et validées indépendamment de Firebase.

### Statistiques du foyer — première implémentation

Demande utilisateur : un onglet Stats riche en détails, agréable visuellement, avec de l'humour léger. Cette fonctionnalité fait désormais partie du périmètre réalisé ; les données sont dérivées du planning déjà chargé, sans service externe d'analyse ni dépendance Firebase dans les calculs.

- Ajouter une cinquième destination « Stats » dans la navigation PC et mobile. Conserver l'agenda et le récapitulatif personnel existants.
- Choisir semaine en cours, mois en cours, année en cours ou toutes les réalisations enregistrées. Filtrer par personne ayant coché, pièce / catégorie et fréquence. Les graphiques par personne et pièce sont cliquables pour appliquer ces filtres.
- Présenter actions réalisées, temps estimé connu / partiel, actions planifiées encore à faire, retards, jours actifs et séries de jours consécutifs. Le cercle représente l'avancement des actions assignées sur la période, distinct du nombre de validations effectuées pendant cette période.
- Afficher des barres par personne et pièce, un calendrier coloré de l'activité dont les jours actifs ouvrent leur détail, la répartition par jour de semaine et la ponctualité. Pour les longues périodes, limiter le calendrier visuel aux 84 derniers jours, avec les semaines alignées.
- Ajouter des clins d'œil fondés sur les chiffres : « Le plumeau d'or », « Le balai voyageur » et « La série qui brille ». Prévoir des états vides chaleureux et ne pas inventer de réalisations, de scores ou de durées.
- Détailler les tâches par série (versions réunies), nombre de réalisations, durée estimée, participants réels et dernière date ; détailler aussi les fréquences, les tâches actives / archivées / non configurées, séances, sous-tâches et exceptions de report / regroupement / affectation.
- Ajouter un carnet des réalisations avec recherche, chargement progressif, et détail en lecture seule : auteur de la validation, responsable assigné, pièce, date réelle / estimée, date prévue après report, échéance d'origine, estimation et progression des sous-tâches actuellement sauvegardée.
- Exporter l'historique filtré en CSV lisible dans un tableur, en protégeant les cellules contre l'interprétation des titres ou noms comme formules.
- Attribuer les réalisations à `completedBy`, pas au responsable assigné. Utiliser la date locale de `completedAt` pour les graphiques ; en son absence, indiquer une date estimée et exclure la réalisation du calcul de ponctualité. Garder les auteurs inconnus distincts.
- Exclure les occurrences absorbées par regroupement et les validations futures. Une action décochée ne compte plus comme réalisée. Conserver les archives dans les réalisations, avec l'identifiant de série pour réunir leurs versions.
- Les temps sont estimés à partir des définitions sauvegardées, jamais mesurés ; les durées manquantes ne valent pas zéro. Les reports et affectations décrivent l'état actuel des exceptions, pas un journal de tous les changements. Le panneau explicatif précise ces limites.
- En mode « Tout », inclure toutes les réalisations conservées ; calculer les compteurs des actions planifiées sur les 365 derniers jours pour limiter le volume, et l'indiquer explicitement.
- Vérifier l'affichage et les gestes sur un téléphone physique avant publication. Les calculs et interactions en lecture seule sont couverts par des tests automatiques.

### Hub Maison — ultérieur

Prévoir un accueil central permettant de choisir un espace : ménage / planning, repas / recettes ou courses. L'application a vocation à couvrir plusieurs besoins du foyer. Les fonctionnalités et les liens entre repas, recettes et courses restent à cadrer ; ne pas ajouter ces espaces ni leurs données maintenant.

Autres pistes : rappels, installation comme application web, mode hors connexion synchronisé, répartition de la charge entre personnes, approfondissement des statistiques et historique des modifications, suivi des stocks et autres routines de la maison.

Migration de la base et de l'authentification vers la solution de l'utilisateur : PostgreSQL et Keycloak, avec Supabase comme option si retenue plus tard. Cette migration sera traitée quand l'infrastructure sera disponible, sur la base des services et exports préparés dès la V1.

Ces éléments restent hors du périmètre initial sauf décision explicite. L'affectation aux membres et les séances sont incluses dans la V1.

## 8. Décisions ouvertes

1. Firebase gratuit retenu pour le stockage partagé ; mode de connexion et accès au foyer à préciser.
2. Date de départ des répétitions, membres et répartition initiale : à renseigner au premier paramétrage.
3. Étapes sans couleur et lignes avec fréquences multiples : valider les règles de reprise avant de figer le catalogue.
4. Collision de deux occurrences d'une même tâche sur un jour : le regroupement proposé avec avertissement conserve le statut et le responsable du jour cible, avec un lien enregistré vers les occurrences absorbées. Préciser plus tard le traitement des progressions de sous-tâches différentes.
5. Sous-tâches : validation principale et cases internes indépendantes dans la première implémentation. Affiner après essai l'édition des listes et le traitement des progressions différentes lors d'un regroupement.
6. Durée estimée : champ facultatif, filtres, tris et estimations retenus dans l'interface actuelle. Tester la première proposition semaine / mois et affiner les contraintes de disponibilité ultérieurement.
7. Tester les sections de configuration par pièce et préciser la direction graphique sans remettre en cause l'ergonomie générale.

Après ces décisions : mettre à jour le cahier des charges, proposer les maquettes principales, puis réaliser et vérifier l'application avant sa publication.

## Comptes et plusieurs familles — préparation au déploiement

Demande utilisateur : chaque membre utilise son propre compte. Un compte peut créer une famille et rejoindre d'autres familles par invitation. L'utilisateur choisit la famille active et peut définir une famille favorite, ouverte par défaut à sa prochaine connexion. Les tâches, séances, affectations et statistiques restent propres à la famille active.

Conserver Firebase Authentication et Firestore sur le forfait Spark pour la V1. Utiliser une base partagée avec des espaces de données séparés par identifiant de famille et protégés par les règles Firestore ; une base physique par famille n'est pas nécessaire. Les quotas gratuits restent communs au projet.

Le code actuel ne gère qu'un rattachement de famille par compte. Le multi-famille et la préférence favorite sont maintenant implémentés et testés localement ; les règles et la connexion restent à activer et vérifier sur le projet Firebase réel. Le bloc « Démonstration locale » doit devenir un bloc affichant le compte réel, son adresse et la famille active dans l'application connectée. L'aperçu hors ligne reste clairement identifié comme local.

Propositions à valider :
- Créateur administrateur de sa famille ; membres invités autorisés à utiliser le planning, administration des accès réservée à l'administrateur.
- Invitations réservées à une adresse vérifiée, expirantes et utilisables une seule fois ; aucun mot de passe créé pour autrui.
- Un compte ne peut être lié qu'à un membre par famille ; rejoindre une famille conserve toutes les autres appartenances.
- Le changement de famille ferme les abonnements précédents et réinitialise les filtres, détails et actions en attente pour éviter tout mélange.
- Quitter ou perdre l'accès à sa favorite demande un nouveau choix de famille autorisée.
- Google seul ou Google et email/mot de passe : choix demandé à l'utilisateur.

Avant publication : tester les accès avec deux familles, un membre commun, un membre exclusif et un compte extérieur ; vérifier les refus côté règles, les invitations, la favorite et la synchronisation. Confirmer Firestore, les fournisseurs de connexion, les domaines autorisés et GitHub Pages.

### Correction mobile avant publication

À la suite du chevauchement signalé sur un écran de 375 px, le calendrier et son récapitulatif sont empilés jusqu'à 600 px ; les colonnes intermédiaires conservent des enfants réductibles. Les commandes de période reviennent sur plusieurs lignes sur téléphone. Les actions des fenêtres se replient, les champs utilisent une taille de texte de 16 px et le contenu réserve l'espace de la navigation et de la zone de sécurité inférieure. La grille PC est conservée. Ces corrections de styles doivent encore être validées visuellement sur téléphone, notamment avec le clavier ouvert.

### Préparation réalisée — comptes et familles

Connexion Google conservée pour cette étape, email/mot de passe restant une extension possible. L'application connectée affiche « Mon compte », l'adresse et la famille active, avec un accès « Mes familles » utilisable sur mobile. La navigation PC comporte aussi le sélecteur de famille. Chaque famille conserve un membre métier par compte ; la création et l'acceptation d'invitation préservent les autres appartenances. La favorite ne change pas quand une nouvelle famille est rejointe ; la première famille créée devient la favorite.

Les invitations sont liées à une adresse vérifiée, expirent après sept jours et sont consommées dans la même transaction que le rattachement. Un membre déjà lié ne peut recevoir un autre compte. Seul le créateur prépare les membres et les invitations ; chacun peut renommer son propre membre. Les actions, filtres et détails en attente sont réinitialisés au changement de famille.

Validation : tests métier et de sélection de famille ; tests des règles dans l'émulateur Firestore pour deux familles, accès extérieur refusé, appartenance multiple, préférence favorite, adresse non vérifiée, invitation consommée/expirée et tentative de changement de propriétaire. Ces tests n'attestent pas de la configuration du projet réel ni du rendu mobile.

### Configuration Firebase confirmée par l'utilisateur

L'utilisateur a terminé la création de Firestore en mode production après le choix de la base `(default)` et la recommandation de Paris ; il confirme la publication des règles, l'activation de Google et l'ajout des domaines autorisés. La CLI locale continue de recevoir une erreur de permissions : ces réglages sont confirmés par l'utilisateur, pas contrôlés administrativement depuis cet environnement. La connexion réelle, la création d'une famille et une invitation restent à tester après publication.

### Invitations retrouvables

Le créateur peut rouvrir « Invitation » à côté d'un membre pour retrouver le code encore valide, son destinataire et son expiration, et le copier. Réouvrir ou soumettre de nouveau ne remplace pas une invitation en attente. Les invitations acceptées ou expirées ne sont pas proposées comme actives. L'action n'apparaît pas sur son propre membre ; l'adresse du compte connecté est refusée à la saisie, dans l'adaptateur et par les règles Firestore. Seul le propriétaire peut rechercher les invitations de son foyer, avec une requête limitée à ce foyer. La nouvelle règle doit être republiée sur le projet réel pour activer cette recherche.

### Familles vides, affectations facultatives et durées de M&Ms

Clarification utilisateur : « supprimer » désigne ici le retrait de l'affiliation à une personne, sans suppression des tâches. Ajouter « Retirer les responsables » dans la configuration des tâches et les vues jour/semaine/mois. Dans le catalogue, retirer les responsables de toutes les tâches actives et des exceptions non réalisées correspondantes ; dans l'agenda, traiter les actions non réalisées de la période selon les filtres actifs. Confirmation avec portée et nombre, refus en cas de modification concurrente, annulation immédiate. Les réalisations conservent leur responsable et auteur historiques.

Les nouvelles tâches sont « À attribuer » par défaut. Toute nouvelle famille, y compris une famille portant le même nom qu'une autre, démarre sans tâches ni séances automatiques. Les données déjà sauvegardées de M&Ms restent intactes. Les pièces du catalogue restent disponibles pour faciliter la création.

Pour M&Ms, proposer les durées actives des 187 tâches d'origine, avec aperçu éditable et enregistrement groupé. Exemples : préparation du matériel 3 min, nettoyage du lavabo 4 min, lancement de machine 5 min, pliage du linge 20 min, tonte 45 min. Les cycles de machine, le séchage et le trempage sont exclus. Ne pas écraser une estimation existante et ne pas attribuer une estimation à une tâche personnalisée non reconnue. Ces durées sont des propositions et dépendent de la taille du logement.

### Retirer une tâche d'un jour

Ajouter « Retirer de ce jour » dans les options d'une carte et sur chaque action non réalisée du détail d'une séance. Après confirmation, retirer uniquement cette occurrence du programme et des compteurs de ce jour. La tâche du catalogue, ses récurrences et les autres actions de la séance restent conservées. Une occurrence reportée est retirée de son jour actuel sans réapparaître à sa date d'origine. Le retrait est exporté comme une exception explicite, sans réalisation fictive. Préserver l'historique des actions réalisées, refuser les propositions périmées et proposer l'annulation immédiate si aucune autre modification n'est intervenue.
