# Didi — Décisions techniques

Les choix importants, avec ce qui les justifie. Les plus récents en haut.

---

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

**Décision** : la composition CPU (`src/lib/core/compositing.ts`) suit la spécification W3C Compositing and Blending (comme Photoshop, Krita et les navigateurs), en alpha prémultiplié, avec un arrondi sur 8 bits après chaque calque comme sur le GPU. L'addition est une somme plafonnée, comme sur le GPU.

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
