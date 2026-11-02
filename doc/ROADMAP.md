# Didi — Roadmap

Règle : on ne passe à la phase suivante que si la précédente est **stable, testée et performante**.

## Où on en est (2026-11-02)

- **Fait** : phases 0 à 4, et la phase 5 sauf la vérification sur machine modeste. Didi tourne sous Linux et Windows (testé).
- **Prochaine étape** : phase 5b, les modes pixel art et peinture (registre d'outils d'abord), puis la phase 5c, les outils essentiels, et le jalon v0.1.
- **Ensuite** : phase 6, le pont Godot.
- **Reporté, à reprendre plus tard** : import de `.myb`, actions des boutons du stylet, rejeu de traits enregistrés (phase 3) ; roue rapide et fenêtre des paramètres `.myb` (phase 4) ; peinture dans un worker pour les pinceaux géants ; lecture native du stylet sous Windows si la comparaison avec Krita le justifie.

---

## Phase 0 — Fondations et validations techniques

- ✅ Structure du dépôt, lint, formatage, CI (tests TS, tests Rust, vérification Svelte).
- ✅ **Prototype tablette** : mesurer pression, inclinaison, événements coalescés et latence via Pointer Events.
- ✅ **Prototype tablette côté Rust** : même mesure en lecture native. Sous Linux, le natif est retenu (voir `DECISIONS.md`). Windows et macOS restent à évaluer.
- ✅ **Prototype rendu** : mesurer les performances de PixiJS dans la webview (tamponnage massif dans une texture).
- ✅ **Prototype relecture GPU → CPU** : peinture sur le GPU, copie CPU par tuile mise à jour en fin de trait.
- ✅ Choix de la source d’entrée sous Linux et de la bibliothèque UI (Bits UI).

**Terminé quand** : chaque choix technique repose sur des mesures réelles.

## Phase 1 — Modèle de document

- ✅ Dessin, calques raster en tuiles, modes de fusion de base (composition CPU de référence).
- ✅ Registre de commandes, historique undo/redo (diffs de tuiles, groupes, limites), calque actif.
- ✅ Notifications de changement précises (calques, propriétés, tuiles).
- ✅ Tests unitaires et tests par propriétés (suites d'actions aléatoires puis annulation).

**Terminé quand** : le cœur fonctionne sans UI ni rendu, avec une bonne couverture de tests.

## Phase 2 — Canvas et viewport

- ✅ Affichage du document avec PixiJS, mises à jour partielles par tuile.
- ✅ Modes de fusion limités à ceux qui sont exacts sur le GPU (normal, écran, addition). Les autres plus tard, si besoin.
- ✅ Zoom, déplacement, rotation. Import d'image (glisser-déposer).
- ✅ Grille de pixels à fort zoom (×8), damier propre en rotation, tuiles hors écran ignorées (culling).

**Terminé quand** : 60 fps sur une grande toile avec de nombreux calques, mémoire mesurée.

## Phase 3 — Saisie et moteur de pinceau

- ✅ Source d'entrée native (Linux) ou DOM, pression, inclinaison, mode gomme du stylet.
- ✅ Moteur de pinceau : libmypaint (WebAssembly), pinceaux `.myb` (toute la collection MyPaint CC0 fournie), smudge et mélange.
- ✅ Crayon pixel (pixel-perfect, sans anticrénelage), gomme et pipette.
- ✅ Un trait = un seul Ctrl+Z, annulation par Échap, clic de fermeture des fenêtres ignoré.
- ✅ Comparaison automatique avec MyPaint (`npm run compare:brushes`) : même rendu à pression égale.
- Reporté (après la phase 4) :
  - Import de pinceaux `.myb` par l'utilisateur. (La gomme pixel passe en phase 5b.)
  - Actions associables aux boutons du stylet et au mode gomme (gomme, roue, déplacer…), car chaque pilote les envoie différemment.
  - Enregistrement de vrais traits au stylet, rejoués dans les tests.

**Terminé quand** : latence imperceptible et rendu sans régression.

## Phase 4 — Interface minimale

- ✅ Interface entièrement en anglais, sans traduction (localisation plus tard).
- ✅ Tout est une commande : outils, vue, pinceau, calques, import passent par le registre.
- ✅ Disposition fixe : la toile occupe toute la fenêtre, les panneaux flottent au-dessus, légèrement décalés du bord (comme Blender). À gauche les outils puis les pinceaux, à droite la couleur et les calques, en haut les options de l'outil et la vue, en bas la barre d'état. Panneaux conçus pour passer à Dockview plus tard.
- ✅ Système de thème par tokens CSS. Valeurs par défaut dans le code pour l'instant, structurées pour être chargées depuis un fichier plus tard.
- ✅ Barre d'outils, panneau calques (renommage par double-clic), réglages du pinceau (taille, opacité) et navigateur de pinceaux avec aperçus.
- ✅ Sélecteur de couleur : carré (saturation, luminosité) + bande de teinte, code hexadécimal.
- ✅ Palettes : création, renommage, suppression, ajout et retrait de couleurs (clic droit), enregistrement automatique (dossier de données de l'app, en attendant la phase 5), import de fichiers `.hex` (format de Lospec, aussi par glisser-déposer). PICO-8 fournie par défaut.
- ✅ Raccourcis (keymap maison, sans hotkeys-js ; valeurs par défaut, configurables plus tard) et palette de commandes (Ctrl+K).
- ✅ Menus déroulants dessinés par l'app (Bits UI), sans popup GTK.
- ✅ Pinceaux en file d'attente avec un budget par frame (comme MyPaint) : un pinceau géant prend du retard au lieu de geler l'interface. Peindre dans un worker reste possible si besoin.
- Reporté : roue rapide v1 (roue personnalisable définie comme un fichier), fenêtre de réglage des paramètres `.myb`.

## Phase 5 — Fichiers et robustesse

- ✅ Format `.didi` (zip : JSON lisible + un PNG par calque + aperçu), sauvegarde et chargement dans un worker. Facile à lire, à étendre, à partager et à versionner (voir `DECISIONS.md`).
- ✅ Palettes : restent globales, pas dans le `.didi`.
- ✅ Écran de démarrage à la Blender : nouveau document (formats pour le jeu vidéo en un clic, taille libre, fond blanc ou transparent), fichiers récents avec aperçu ; clic à côté → toile vide par défaut.
- ✅ Nouveau, Ouvrir, Enregistrer, Enregistrer sous, Export PNG ; titre de fenêtre avec `●` si non enregistré ; confirmation avant de perdre des modifications (nouveau, ouvrir, fermeture).
- ✅ Copie de récupération deux minutes après une modification (jamais dans le fichier de l'utilisateur), proposée au démarrage après un crash.
- ✅ Tests d'aller-retour, de fichiers corrompus (tronqués, octets inversés), de versions trop récentes. Migrations prêtes, aucune encore (version 1).
- Un document à la fois (onglets plus tard).

- Vérification des performances sur une machine modeste (GPU intégré).
- ✅ **Windows** : build et test complet (compilé à la main, voir `DEVELOPPEMENT.md`). Fonctionne bien.
- Windows : le trait suit un peu difficilement quand on va très vite (Pointer Events de WebView2). À comparer côte à côte avec Krita et d'autres logiciels avant de décider s'il faut une lecture native.
- ✅ Barre de titre dessinée par l'app (comme Zed ou Discord) : nom du document, `●` si non enregistré, boutons réduire, agrandir et fermer. À vérifier au stylet et au redimensionnement sous Linux et Windows ; macOS (boutons natifs en surimpression) en phase 10.
- ✅ CI à jour (actions v7, Node 26, Ubuntu 26.04) ; dépendances à jour (SvelteKit 3). Pas de build Windows automatique : chacun compile, la version prête à l'emploi sera sur Steam.

## Phase 5b — Modes pixel art et peinture

Deux modes, chacun ne montrant que ce dont il a besoin, dans une interface commune (voir `DECISIONS.md`).

- ✅ Registre d'outils : chaque outil est une définition (titre, icône, réglages, curseur, comportement) au lieu d'une liste fixe. Aucun changement visible.
- ✅ Registre de modes : outils de la barre, outil du bout gomme, panneaux affichés, raccourcis. Pixel art et Peinture sont les deux premiers. (Les réglages de vue viendront avec le mode pixel art.)
- ✅ Mode enregistré dans le `.didi` (changer de mode est une modification non enregistrée, pas une étape d'annulation), commande pour en changer, sélecteur dans la barre du haut.
- Écran de démarrage : choix pixel art ou peinture clair et visible, formats propres à chaque mode.
- Mode pixel art : pas de navigateur de pinceaux, tailles en pixels entiers, grille et zoom entier, palette mise en avant.
- ✅ Outils des autres modes accessibles (bouton « plus d'outils », palette de commandes). Gomme pixel ajoutée (bout gomme du stylet en pixel art).
- Épingler un outil d'un autre mode dans la barre.

## Phase 5c — Outils essentiels

Ce qu'il faut pour dessiner de vrais assets de jeu sans repasser par un autre logiciel. Peu d'outils, mais soignés et testés, chacun déclaré dans son mode.

- Pot de peinture (remplissage, avec tolérance ; exact au pixel pour le pixel art).
- Gomme pixel (pixel-perfect, sans bords doux).
- Formes : ligne, rectangle, ellipse (au pixel en pixel art).
- Pipette rapide (Alt + clic) avec n'importe quel outil.
- Sélection rectangulaire, déplacement de la sélection ou du calque, copier-coller.
- Retourner horizontalement et verticalement (calque ou sélection).
- Redimensionner la toile (agrandir, recadrer).

**Jalon v0.1** : un logiciel de dessin simple, utilisable au quotidien.

## Phase 6 — Pont Godot v1

- Plugin éditeur Godot connecté à Didi par WebSocket.
- Lier un document à une texture du projet : mise à jour en direct dans l'éditeur, écriture du PNG sur disque.
- « Éditer dans Didi » depuis Godot, synchronisation dans les deux sens.

**Jalon v0.2** : dessiner et voir le résultat dans Godot en direct.

## Phase 7 — Pont Godot v2

- Capture de la scène comme calque de référence pour dessiner en contexte.
- Normal maps et aperçu avec les lumières de la scène.
- Mise à jour en direct dans le jeu en cours d'exécution.
- Export vers SpriteFrames et TileSet.

## Phase 8 — Animation et pixel art

- Timeline, onion skin, tags d'animation.
- Palettes indexées.
- Outils pixel art repris d'Aseprite : jumble (mélange de pixels), contour, ombrage selon la palette, symétrie…

## Phase 9 — Extensibilité

- API de plugins stable et documentée, avec sandbox et permissions.
- Import/export de packs de pinceaux, de roues et de thèmes (une roue embarque les pinceaux qu'elle utilise).
- Les plugins peuvent ajouter leurs propres éléments à la roue.
- Import `.kra` et `.ase`.
- Asset store.

## Phase 10 — Publication Steam

- Intégration Steamworks, builds Windows, Linux (Steam Deck) et macOS.
- Steam Workshop pour le partage de pinceaux, roues, thèmes et plugins.
- Test sur macOS (entrée tablette dans WebKit, lecture native si nécessaire). Barre de titre : garder les boutons natifs de macOS (`titleBarStyle: "Overlay"`) au lieu des nôtres.

---

## En continu

- Budgets de performance vérifiés en CI : temps par frame, latence de saisie, mémoire.
- Documentation tenue à jour à chaque phase.
