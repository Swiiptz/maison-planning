# Maquettes de cadrage

Les maquettes SVG proposent une disposition pour le planning sur ordinateur et téléphone. Leurs dates, membres et compteurs sont des exemples fictifs. Elles ne démontrent pas encore le glisser-déposer ni la synchronisation.

## Direction visuelle

Fond clair légèrement chaud, cartes blanches, coins arrondis et titres lisibles. Une bordure indique la récurrence selon la légende des PDF ; un badge indépendant identifie la pièce. Le nom du responsable et le statut sont affichés sans utiliser une troisième classification de couleurs.

## Planning sur ordinateur

Voir `maquettes/planning-pc.svg`.

- Navigation latérale : aujourd'hui, planning, tâches, réglages.
- En haut : période, retour à aujourd'hui, choix jour / semaine / mois et création.
- Filtres : membre du foyer, pièce, fréquence et statut.
- Panneau « À planifier » à côté des sept jours ; déplacement des cartes à l'aide d'une poignée.
- Les cartes de séance montrent la progression et ouvrent leur checklist. Les cartes individuelles sont cochables directement.
- La vue mois réduit le détail et ouvre la liste d'une journée ; la vue jour reprend la liste du récapitulatif.

## Planning sur téléphone

Voir `maquettes/planning-mobile.svg`.

- Date et choix de vue en haut, puis une bande de sept jours sélectionnables.
- Liste des tâches du jour avec cartes confortables à toucher ; les retards apparaissent dans une section dédiée lorsqu'il y en a.
- Filtres compacts et progression de la journée.
- Poignée pour déplacer une carte ; menu proposant aussi « Déplacer vers… » et « Changer de responsable ».
- Barre de navigation en bas et bouton de création toujours accessible.

## Détail d'une séance

Sur ordinateur, ouvrir un panneau de détail ; sur téléphone, ouvrir un écran dédié. Afficher le titre, la pièce, le responsable, la date et la répétition, puis une checklist ordonnée. Chaque étape porte sa fréquence et sa case à cocher. Proposer les actions déplacer, réattribuer et sortir une action de la séance.

Lors d'une modification d'une série, proposer explicitement « Cette échéance » ou « Celle-ci et les suivantes ». Le glisser-déposer reporte seulement l'échéance sélectionnée ; un message propose d'annuler.

## Aujourd'hui et catalogue

L'écran « Aujourd'hui » présente le récapitulatif personnel ou du foyer, les tâches dues et les retards. Le catalogue présente les groupes des PDF, une recherche et les réglages des répétitions. Les actions sans date ou sans responsable restent faciles à retrouver pour terminer la planification.

## Points restant à régler

Le compte et le service Firebase seront configurés au moment de la réalisation. Les membres et dates de départ seront renseignés au premier usage. Les étapes sans couleur et les fragments de ligne de fréquences différentes devront être résolus pendant la constitution du catalogue.
