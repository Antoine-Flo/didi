# Didi — Roadmap

Règle : on ne passe à la phase suivante que si la précédente est **stable, testée et performante**.

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
  - Import de pinceaux `.myb` par l'utilisateur, gomme pixel.
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
- Reporté : roue rapide v1 (roue personnalisable définie comme un fichier), fenêtre de réglage des paramètres `.myb`.

## Phase 5 — Fichiers et robustesse

- Format `.didi`, sauvegarde et chargement dans un worker. Facile à lire, à étendre, à partager et à versionner (voir `PROJET.md`).
- Décider où vivent les palettes (dossier de données de l'app depuis la phase 4) : rester globales, et/ou être embarquées dans le `.didi`.
- Sauvegarde automatique, récupération après crash, export PNG.
- Tests d'aller-retour, de migration et de fichiers corrompus.

- Vérification des performances sur une machine modeste (GPU intégré).
- **Windows** : pages de test tablette et rendu sur WebView2, puis build et test complet.

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

## Phase 9 — Extensibilité

- API de plugins stable et documentée, avec sandbox et permissions.
- Import/export de packs de pinceaux, de roues et de thèmes (une roue embarque les pinceaux qu'elle utilise).
- Les plugins peuvent ajouter leurs propres éléments à la roue.
- Import `.kra` et `.ase`.
- Asset store.

## Phase 10 — Publication Steam

- Intégration Steamworks, builds Windows, Linux (Steam Deck) et macOS.
- Steam Workshop pour le partage de pinceaux, roues, thèmes et plugins.
- Test sur macOS (entrée tablette dans WebKit, lecture native si nécessaire).

---

## En continu

- Budgets de performance vérifiés en CI : temps par frame, latence de saisie, mémoire.
- Documentation tenue à jour à chaque phase.
