# Didi — Décisions techniques

Les choix importants, avec ce qui les justifie. Les plus récents en haut.

---

## Barre de titre dessinée par l'app

**Date** : 2026-11-01 · **Phase** : 5

**Décision** : la barre de titre du système est désactivée (`decorations: false`) ; l'app dessine la sienne (`Titlebar.svelte`, dans le layout racine, donc aussi sur les pages lab), comme Zed ou Discord : fine (32 px), couleur du fond, nom du document à gauche avec `●` si non enregistré, boutons plats à droite dans le style de Windows 11 (fermer en rouge au survol).

**Pourquoi** : une interface plus propre et identique sur tous les systèmes, au lieu d'une barre GTK ou Windows qui détonne avec le thème.

**Notes** :

- Glisser la barre déplace la fenêtre, un double-clic l'agrandit (`startDragging`, `toggleMaximize`). Fermer passe par la demande de fermeture habituelle (proposition d'enregistrer).
- La barre reste au-dessus des fenêtres de dialogue : on peut toujours déplacer ou fermer la fenêtre.
- Le titre de la fenêtre reste mis à jour pour la barre des tâches.
- Le stylet natif (Linux) n'est pas concerné : il ne dessine que si la pointe est sur la toile.
- Redimensionnement par les bords : assuré par Tauri (et l'ombre de fenêtre sous Windows).
- macOS (plus tard) : garder les boutons natifs en surimpression (`titleBarStyle: "Overlay"`).

## Format `.didi` et gestion des fichiers

**Date** : 2026-11-01 · **Phase** : 5

**Décision** : un `.didi` est un zip que n'importe quel outil sait ouvrir :

- `mimetype` (`application/x-didi`, en premier et non compressé, pour reconnaître le fichier) ;
- `document.json`, lisible et versionné : taille, calque actif, et pour chaque calque nom, fichier, visibilité, verrouillage, opacité, mode de fusion ;
- `layers/1.png`, `layers/2.png`… : un PNG standard par calque, de bas en haut, alpha non prémultiplié ;
- `thumbnail.png` : aperçu de 256 px maximum, pour les fichiers récents.

**Pourquoi** : lisible (on peut extraire et retoucher un calque dans un autre logiciel), facile à étendre et à versionner. Format proche du `.kra` de Krita et de l'ORA.

**Notes** :

- `extensions` dans `document.json` est réservé aux données des modules (lien Godot…) : conservé tel quel, même s'il n'est pas compris. Les autres champs inconnus sont ignorés.
- Les versions plus anciennes sont migrées à la lecture (`MIGRATIONS` dans `didi-file.ts`) ; une version plus récente est refusée avec un message clair.
- Un calque manquant ou mal formé donne un message précis ; les réglages absents prennent leur valeur par défaut.
- PNG encodé et décodé par notre code (`core/file/png.ts`, avec fflate) : marche dans un worker et dans les tests. Le décodeur lit les formats courants (gris, RGB, palette, 1 à 16 bits, transparence `tRNS`), vérifiés contre PIL.
- Enregistrement et ouverture dans un worker (Comlink) : environ 1,3 s pour écrire et 0,5 s pour lire un document 2048 × 2048 de 3 calques, sans bloquer l'interface.
- Écriture atomique côté Rust (fichier temporaire puis renommage) : un crash pendant l'enregistrement ne laisse jamais un fichier à moitié écrit.
- Modifications non enregistrées : `History.marker` identifie l'état courant ; annuler jusqu'à l'état enregistré rend le document « propre ».
- Récupération : une copie dans le dossier de données, deux minutes après une modification, supprimée à l'enregistrement et à la fermeture normale. Au démarrage, une copie laissée par un crash est mise de côté (`recovery-previous.didi`) et proposée jusqu'à ce que l'utilisateur la récupère ou la jette.
- Les fichiers sont lus et écrits par des commandes Rust qui acceptent n'importe quel chemin (choisi dans un dialogue ou dans les récents). À restreindre quand les plugins arriveront (phase 9).

## Pinceaux : file d'attente et budget par frame (comme MyPaint)

**Date** : 2026-11-01 · **Phase** : 4

**Constat** : chaque événement du stylet était peint tout de suite, sur le fil principal. Avec un airbrush géant et un geste rapide, un seul événement coûtait jusqu'à 290 ms (pinceau de 1 000 px, 300 px entre deux événements) : l'interface gelait, puis le trait sautait.

**Décision** : comme MyPaint, les points attendent dans une file, avec leur heure d'origine (la vitesse vue par libmypaint ne change pas). À chaque frame, on en peint pendant 8 ms environ, puis on affiche. Le trait suit le stylet avec du retard au lieu de geler l'interface. Après le lever du stylet, la file continue de se vider ; le trait devient une étape d'historique une fois entièrement peint. Échap l'annule à tout moment ; une commande (Ctrl+Z…) termine d'abord le trait en cours.

**Notes** :

- Un segment trop coûteux (longueur × taille du pinceau) est découpé en sous-segments interpolés (position, pression, inclinaison, heure). Sans effet sous ~40 px de pinceau.
- Copie des tuiles optimisée (chargement par tuile au lieu de par pixel, table de conversion) : pixels identiques, vérifié par empreinte, et comparaison MyPaint inchangée.
- Mesures (CPU rapide, airbrush) : à 200 px, frames de ~10 ms ; à 500 px, ~20 ms ; à 1 000 px, ~65-80 ms, car une seule empreinte de 1 000 px coûte à elle seule ~60 ms. Les pinceaux géants restent donc lents (~12 fps), mais sans gel ni saut.
- Testé : SIMD WebAssembly (`-msimd128`), pixels identiques mais seulement ~20 % plus rapide ; non retenu (risque de WebView sans SIMD).
- Si besoin plus tard : peindre dans un worker, pour que l'interface reste à 60 fps même avec un pinceau géant.

## Palettes : fichier JSON dans le dossier de données

**Date** : 2026-11-01 · **Phase** : 4

**Décision** : les palettes de l'utilisateur sont globales (pas liées à un document) et enregistrées automatiquement dans `palettes.json`, dans le dossier de données de l'app (`~/.local/share/<identifiant>/` sous Linux). Format lisible et versionné : `{ "version": 1, "active": 0, "palettes": [{ "name": "PICO-8", "colors": ["#000000", …] }] }`. Import des fichiers `.hex` de Lospec (une couleur `rrggbb` par ligne).

**Notes** :

- Côté Rust, deux commandes (`data_read`, `data_write`) n'acceptent qu'un nom de fichier simple : le front ne peut rien lire ni écrire hors de ce dossier. L'écriture est atomique (fichier temporaire puis renommage).
- Un fichier illisible n'est jamais écrasé en silence : il est copié dans `palettes-unreadable.json` et l'utilisateur est prévenu.
- Hors de Tauri (serveur de dev), le stockage passe par `localStorage`.
- Phase 5 : décider si un `.didi` embarque aussi ses palettes (voir la roadmap).
- Le sélecteur de couleur travaille en HSV (code maison, testé), comme Krita et Procreate. culori n'est pas utilisé pour l'instant.

## Interface : panneaux flottants, style sobre

**Date** : 2026-11-01 · **Phase** : 4

**Décision** : la toile occupe toute la fenêtre ; les panneaux flottent au-dessus, décalés du bord d'une unité d'espacement (comme Blender). Style sobre, inspiré de Godot 4 et d'Ableton : gris neutres, sélection en gris clair plutôt qu'en couleur, accent discret réservé au focus, coins légèrement arrondis, une seule taille de police, espacements tous dérivés d'une unité (`--space`) et une hauteur de contrôle commune (`--control-height`).

**Notes** :

- Les styles de base (`src/lib/app/shell/ui.css`) sont enveloppés dans `:where()` : n'importe quelle classe d'un composant les remplace.
- « Ajuster à la fenêtre » et le zoom au clavier se centrent sur la zone visible entre les panneaux, pas sur toute la fenêtre.
- Pas de `<select>` natif : les menus déroulants sont ceux de Bits UI (`Select.svelte`). Le menu natif de WebKitGTK ouvre un popup GTK qui détonne et provoque un avertissement sous Wayland (« Tried to map a popup with a non-top most parent »).
- Pendant qu'un menu est ouvert, et 250 ms après sa fermeture, un contact sur la toile ne dessine pas (`dismissal.ts`) : le clic qui ferme le menu ne doit pas laisser de trait.

## Interface en anglais, sans traduction pour l'instant

**Date** : 2026-11-01 · **Phase** : 4

**Décision** : tous les textes visibles (interface, messages, noms de calques et d'étapes d'historique, pages de test) sont en anglais. Aucune traduction : les pinceaux gardent leur nom d'origine (`2B pencil`, pas « Crayon 2B »). La localisation viendra plus tard, d'un seul tenant. La documentation reste en français.

## Raccourcis : keymap maison, tout passe par les commandes

**Date** : 2026-11-01 · **Phase** : 4

**Décision** : chaque action de l'interface est une commande du registre (`tool.brush`, `view.zoomIn`, `layer.moveUp`…). Boutons, raccourcis et palette de commandes ne font qu'exécuter des commandes. Les raccourcis sont une liste de données (`src/lib/app/commands/default-keymap.ts` : touches → commande + paramètres), sans hotkeys-js.

**Pourquoi** : une seule source pour les actions (raccourcis, palette, future roue, plugins). Un keymap en données pourra être chargé depuis un fichier sans changer le code.

**Notes** :

- Les touches sont reconnues par le caractère tapé (`KeyboardEvent.key`), pas par leur position : les raccourcis suivent la disposition du clavier (AZERTY…). Pour les chiffres et symboles, Maj et AltGr font partie de la frappe et ne sont pas des modificateurs : « 0 » marche en AZERTY, « [ » aussi.
- Les commandes qui exigent des paramètres (`layer.move`, `layer.update`…) sont marquées `needsParams` et n'apparaissent pas dans la palette ; elles ont des variantes sans paramètres (`layer.moveUp`).
- Aucune commande ne s'exécute pendant un trait.

## Thème : tokens CSS

**Date** : 2026-11-01 · **Phase** : 4

**Décision** : les composants n'utilisent que des variables CSS (`--panel`, `--text`, `--selected`…) définies par un thème (`src/lib/app/shell/theme.ts`). Un seul thème sombre par défaut pour l'instant, en données, pour pouvoir le charger depuis un fichier plus tard.

## Précision des calques : 8 bits

**Date** : 2026-10-31 · **Phase** : 3

**Décision** : les calques restent en 8 bits par canal. Pendant un trait, libmypaint travaille en 15 bits (smudge précis) ; le résultat est arrondi en 8 bits à la fin du trait.

**Pourquoi** : suffisant pour l'art 2D de jeu (écrans, PNG et textures Godot sont en 8 bits), deux fois moins de mémoire, format par défaut de Krita, Photoshop et Procreate.

**Plus tard, si besoin** : une option « haute précision » à la création du document (échelle 15 bits de libmypaint, comme le 16 bits de Photoshop), pour les glacis très doux ou les cartes de hauteur.

## Moteur de pinceau : libmypaint

**Date** : 2026-10-31 · **Phase** : 3

**Décision** : un seul moteur de pinceau, **libmypaint** 1.6.1 (utilisé par MyPaint, Krita et GIMP), compilé en WebAssembly. Les pinceaux sont des fichiers `.myb` ; toute la collection officielle MyPaint est fournie (196 pinceaux, CC0 : la politique du dépôt n'accepte que le domaine public), avec un groupe « Essentiels » en tête. Notre pinceau rond maison est supprimé. Le crayon pixel reste un outil à part (Bresenham, pixel-perfect, couleurs exactes), comme le crayon d'Aseprite.

**Pourquoi** : ne pas réinventer la roue. Smudge, mélange de couleurs et dynamiques riches (pression, vitesse, inclinaison, aléatoire…) éprouvés depuis quinze ans, et des centaines de pinceaux libres compatibles. Licence ISC, compatible avec une distribution commerciale.

**Intégration** :

- Compilation : `native/mypaint/build.sh` (Emscripten), qui télécharge la version publiée en vérifiant son empreinte. Le module produit (`src/lib/mypaint/libmypaint.mjs`, ~100 Ko, WebAssembly intégré) est commité : Emscripten n'est nécessaire que pour le recompiler. Il tourne aussi dans Node, donc dans les tests.
- Pas de json-c : les `.myb` sont lus en TypeScript et transmis par l'API de libmypaint, avec la même logique que MyPaint.
- Surface : pendant un trait, libmypaint dessine dans ses propres tuiles (64 px, 15 bits, pour un smudge de qualité), chargées depuis le calque à la demande et recopiées en 8 bits dans nos tuiles à chaque frame. Un trait reste une seule étape d'historique.
- L'opacité choisie dans l'interface s'applique au trait entier (mélange entre l'avant et le résultat du pinceau), car chaque pinceau construit son opacité différemment.
- Un tap sans mouvement pose une marque (libmypaint ne peint qu'en se déplaçant).

**Utilisation alignée sur MyPaint 2** (code de MyPaint et de Krita consulté) :

- API version 2 (`mypaint_brush_stroke_to_2`), comme MyPaint 2 : la densité et l'opacité des empreintes suivent les dynamiques du pinceau. L'ancienne API (celle de Krita) donnait des traits plus clairs.
- 256 seaux de smudge par pinceau, comme MyPaint.
- Zoom et rotation de la vue transmis : libmypaint mesure la vitesse du trait à l'écran.
- Au début de chaque trait, le pinceau est posé sans peindre (pression 0, long délai), comme MyPaint : sinon le lissage de trajectoire part de l'ancienne position.
- Échantillons au même horodatage répartis dans le temps, comme MyPaint : sinon la vitesse calculée devient infinie.
- Déterminisme : libmypaint lit de la mémoire non initialisée (allocations remises à zéro) et utilise `rand()` pour le smudge (réinitialisé à chaque trait). Un même trait donne toujours le même résultat.

**Vérification** : `npm run compare:brushes` fait dessiner les mêmes traits à Didi et au code de MyPaint (sa bibliothèque Python, installée sur la machine), puis compare les images (`tools/brush-compare/out/sheet.png`). Sur 7 pinceaux × 4 profils de pression, la quantité d'encre est identique à 1 % près ; seuls diffèrent la position des grains aléatoires et quelques pixels de bord. Confirmé à l'usage, au stylet, face à MyPaint.

**Différence restante** : MyPaint 2 peint par défaut en lumière linéaire (mode « 2.x »), Didi en sRGB, comme Krita et Photoshop (équivalent au mode « 1.x » de MyPaint). Les mélanges et les bords semi-transparents diffèrent un peu. Option envisageable : calculer chaque trait en lumière linéaire tout en gardant des calques sRGB.

## Peinture sur le CPU (remplace « Pixels : GPU pour peindre »)

**Date** : 2026-10-31 · **Phase** : 3

**Constat** (tamponnage d'empreintes rondes et douces, trait rapide à 3 000 px/s, espacement 10 %) : 3 ms de CPU par seconde de trait pour un pinceau de 10 px, 9 ms à 40 px, 29 ms à 150 px, 78 ms à 400 px, 193 ms à 1 000 px.

**Décision** : les pinceaux peignent directement dans les tuiles, sur le CPU (libmypaint en WebAssembly pour les pinceaux, code TypeScript pour le crayon pixel). Le GPU ne fait qu'afficher les tuiles modifiées, comme pour le reste.

**Pourquoi** : exact au pixel (indispensable au pixel art), testable sans navigateur (rejeu de traits enregistrés), plus simple (pas de relecture GPU, même code pour l'affichage et l'export). Même un pinceau de 400 px n'occupe que 8 % d'un cœur pendant un trait rapide.

**Notes** :

- Les pinceaux géants (1 000 px et plus) restent le cas limite : si besoin, le tamponnage pourra passer dans un worker ou sur le GPU.
- La décision « Pixels : GPU pour peindre » ci-dessous ne s'applique plus à la peinture ; la copie CPU par tuile devient la seule source des pixels.

## Modes de fusion : la norme W3C comme référence

**Date** : 2026-10-31 · **Phase** : 1

**Constat** : dans PixiJS, les modes normal, écran et addition suivent la norme, mais le mode produit (multiply) donne du noir sur un fond transparent, et incrustation, assombrir et éclaircir passent par des filtres séparés.

**Décision** : la composition CPU (`src/lib/core/document/compositing.ts`) suit la spécification W3C Compositing and Blending (comme Photoshop, Krita et les navigateurs), en alpha prémultiplié, avec un arrondi sur 8 bits après chaque calque comme sur le GPU. L'addition est une somme plafonnée, comme sur le GPU.

**Mise à jour (phase 2)** : seuls les modes normal, écran et addition sont proposés, car les fonctions de mélange GPU de PixiJS donnent exactement les formules de la référence. Produit, incrustation, assombrir et éclaircir sont retirés plutôt que laissés approximatifs : ce n'est pas une priorité pour du dessin de jeu vidéo. Ils reviendront implémentés des deux côtés (shader GPU + CPU) et vérifiés par comparaison d'images.

**Notes** :

- Performance mesurée : environ 0,75 s pour 2 calques pleins en 4096 × 4096. Suffisant pour l'export et l'envoi vers Godot (en arrière-plan) ; l'affichage reste sur le GPU.

## Pixels : GPU pour peindre, copie CPU par tuile (remplacé)

**Date** : 2026-10-30 · **Phase** : 0

> **Remplacé en phase 3** par « Peinture sur le CPU » : les pixels vivent sur le CPU, le GPU les affiche. Les mesures de relecture ci-dessous restent valables.

**Constat** (page `/lab/render`, toile 4096 × 4096, machine haut de gamme) :

| Zone        | Lecture bloquante | Lecture async (blocage / disponible après) |
| ----------- | ----------------- | ------------------------------------------ |
| 256 × 256   | ~0-1 ms           | 1 ms / 14 ms                               |
| 1024 × 1024 | ~3 ms             | 5 ms / 16 ms                               |
| 4096 × 4096 | ~30 ms            | 78 ms / 91 ms                              |

**Décision** :

- Les pixels sont affichés et peints sur le GPU.
- Une copie CPU par tuile est mise à jour en fin de trait, en relisant uniquement les tuiles touchées (lecture bloquante).
- L'état « avant le trait » est déjà dans la copie CPU : l'annulation ne demande aucune relecture. Sauvegarde, export et remplissage partent aussi de la copie CPU.

**Notes** :

- La lecture async (tampon GPU + fence) n'apporte rien sous WebKitGTK, elle bloque même davantage. Abandonnée.
- WebKitGTK arrondit `performance.now()` à la milliseconde : les petites valeurs sont approximatives.
- À revérifier sur une machine modeste avant la v0.1.

## Interface : Bits UI

**Date** : 2026-10-30 · **Phase** : 0

**Décision** : Bits UI (composants Svelte sans style) plutôt que Skeleton, pour garder un contrôle total sur l'apparence. Le thème est un système maison de tokens CSS, chargé depuis un fichier, donc facile à modifier et à partager.

## Rendu : PixiJS (WebGL) dans WebKitGTK

**Date** : 2026-10-30 · **Phase** : 0

**Constat** (page `/lab/render`, même machine) : fps stables entre 57 et 60 dans tous les cas testés, jusqu'à 20 000 dabs par frame (plus d'un million par seconde) sur une toile 8192 × 8192, et avec 20 calques en 4096 × 4096. Le temps CPU du tamponnage reste autour de 3 ms, avec un pic à 11 ms à la première frame (création des sprites). Le p95 du temps de frame est de 17 à 20 ms.

**Décision** : PixiJS en WebGL est retenu pour le rendu. (Le tamponnage, mesuré ici sur le GPU, se fait finalement sur le CPU : voir « Peinture sur le CPU ».)

**Notes** :

- Un trait réel demande quelques milliers de dabs par seconde : la marge est très large.
- Seul le temps CPU est mesuré. Les fps stables montrent que le GPU suit.
- La relecture GPU → CPU a été mesurée séparément (voir « Pixels » ci-dessus).

## Entrée tablette sous Linux : lecture native

**Date** : 2026-10-30 · **Phase** : 0

**Constat** (XP-Pen Artist 16 3rd, KDE Plasma Wayland, page `/lab/tablet`) :

|                  | WebKitGTK (Pointer Events) | Natif (GTK, côté Rust) | Chromium (référence) |
| ---------------- | -------------------------- | ---------------------- | -------------------- |
| Type de pointeur | souris                     | stylet / gomme         | stylet               |
| Pression         | 0.5 fixe                   | ~450 niveaux           | oui                  |
| Inclinaison      | 0                          | oui                    | oui                  |
| Fréquence        | ~220 Hz                    | ~220 Hz                | ~240 Hz              |
| Latence moyenne  | ~6 ms                      | < 0,5 ms               | ~3 ms                |

**Décision** : sous Linux, le dessin utilise les événements GTK lus côté Rust et envoyés au front par un canal Tauri. Les événements continuent vers WebKit, l'UI reste utilisable normalement. Le moteur de pinceau reçoit les points via une source d'entrée abstraite. Windows et macOS seront évalués séparément.

**Notes** :

- GTK renvoie l'inclinaison entre -1 et 1 pour -90° à 90°. Elle est convertie en degrés côté Rust.
- Le regroupement des mouvements de GTK est désactivé pour recevoir tous les échantillons.
- Les boutons du stylet dépendent des pilotes : selon la configuration, on reçoit un bouton 2/3, un passage en mode gomme, ou rien. Didi devra permettre d'associer une action à chaque cas.
- Le léger décalage entre la pointe et le trait vient de la calibration de l'écran (identique dans Krita et Brave), pas de Didi.
