# Didi — Développement

Comment le code est organisé, et comment travailler dessus.

---

## Commandes

| Commande                  | Rôle                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `npm run tauri dev`       | Lance l'application (recompile aussi la partie Rust).       |
| `npm test`                | Tests (Vitest), environ 5 s.                                |
| `npm run lint`            | Formatage (Prettier, rustfmt) et lint (ESLint).             |
| `npm run check`           | Vérification des types (TypeScript, Svelte).                |
| `npm run format`          | Reformate tout le code (TypeScript, Svelte, Rust).          |
| `npm run compare:brushes` | Compare le rendu des pinceaux avec MyPaint (voir plus bas). |

Si l'interface perd ses styles ou que des fichiers renvoient des 404 après de gros changements : `rm -rf node_modules/.vite` puis relancer `npm run tauri dev`. Si les 404 visent d'anciens chemins (fichiers déplacés), c'est le cache de WebKitGTK : `rm -rf ~/.local/share/com.af.didi/WebKitCache`, l'app fermée. Le serveur de dev envoie `Cache-Control: no-store` (`vite.config.js`) pour que ça n'arrive plus.

## Intégration continue (GitHub Actions)

- **CI** (`ci.yml`) : lint, types et tests (TypeScript), puis formatage, clippy et tests (Rust), à chaque push. Linux uniquement (Ubuntu, Node 26), pour économiser les minutes : pas de build Windows automatique.

## Prérequis

- Node 26 (LTS) et Rust stable.
- Linux : les paquets de développement de WebKitGTK 4.1 (voir la CI ou la [doc Tauri](https://v2.tauri.app/start/prerequisites/)).

## Compiler sous Windows

1. Installer Node 26, Rust (rustup, chaîne MSVC) et les « Build Tools for Visual Studio » (charge de travail « Développement Desktop en C++ »). WebView2 est déjà présent sur Windows 10 et 11.
2. Cloner le dépôt, puis `npm ci`.
3. `npm run tauri dev` pour lancer l'application, ou `npm run tauri build -- --no-bundle` pour un exécutable seul : `src-tauri/target/release/didi.exe`.

La lecture native du stylet n'existe que sous Linux pour l'instant : sous Windows, le dessin passe par les Pointer Events de WebView2 (à évaluer, voir la roadmap).

## Organisation

| Dossier             | Contenu                                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/core/`     | Le cœur, en TypeScript pur, sans interface ni rendu : tuiles, dessin, calques, historique, commandes, notifications, composition, crayon pixel, couleurs et palettes, PNG et format `.didi`. Une règle de lint y interdit tout import de Svelte, PixiJS ou Tauri. |
| `src/lib/mypaint/`  | Le moteur de pinceau (libmypaint en WebAssembly), la lecture des `.myb` et les pinceaux fournis.                                                                                                                                                                  |
| `src/lib/render/`   | L'affichage avec PixiJS : caméra (zoom, rotation), tuiles, grille, contour du pinceau.                                                                                                                                                                            |
| `src/lib/app/`      | L'éditeur (`EditorApp.svelte`), rangé par rôle, voir ci-dessous.                                                                                                                                                                                                  |
| `src/lib/platform/` | Ce qui dépend du système : entrée tablette native, fichiers de données de l'utilisateur (`storage.ts`).                                                                                                                                                           |
| `src/lib/lab/`      | Utilitaires des pages de test.                                                                                                                                                                                                                                    |
| `src/routes/lab/`   | Pages de test : tablette, rendu, stress (lien « Lab » en bas de l'éditeur).                                                                                                                                                                                       |
| `src-tauri/`        | Partie Rust : lecture native du stylet sous Linux (`tablet.rs`), fichiers de données (`storage.rs`).                                                                                                                                                              |
| `native/mypaint/`   | Compilation de libmypaint en WebAssembly.                                                                                                                                                                                                                         |
| `tools/`            | Outils de développement (comparaison avec MyPaint).                                                                                                                                                                                                               |

Dans `src/lib/core/`, rangé du plus simple au plus haut niveau (hors tests, chaque dossier n'utilise que ceux d'avant) :

| Sous-dossier | Contenu                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------- |
| (racine)     | Briques communes : `emitter.ts` (notifications), `geometry.ts` (rectangles), `test-utils.ts`.   |
| `document/`  | Le dessin en mémoire : tuiles, calques, dessin, composition, conversions d'alpha (`pixels.ts`). |
| `history/`   | Annuler et refaire : modifications (`edits.ts`) et historique.                                  |
| `editor/`    | Le document ouvert : `editor.ts`, registre de commandes (`commands.ts`), commandes du document. |
| `brush/`     | Tracé des pinceaux dans les tuiles, crayon pixel.                                               |
| `color/`     | Couleurs et palettes.                                                                           |
| `file/`      | Format `.didi` et PNG.                                                                          |

Dans `src/lib/app/`, chaque test est à côté du fichier qu'il teste :

| Sous-dossier | Contenu                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `shell/`     | La fenêtre et l'apparence : barre de titre, thème (`theme.ts`), styles de base (`ui.css`).                                                 |
| `widgets/`   | Composants génériques, sans logique métier (`Select`, `Slider`).                                                                           |
| `panels/`    | Les panneaux flottants : pinceaux, couleur, palette, calques, barre d'outils (`ToolBar`) et barre d'état (`StatusBar`).                    |
| `dialogs/`   | Ce qui s'ouvre par-dessus : écran de démarrage, confirmation, palette de commandes.                                                        |
| `canvas/`    | La toile : affichage (`CanvasView.svelte`), liaison entre le stylet et l'outil actif (`painter.ts`).                                       |
| `tools/`     | Les outils : définition et registre (`tool.ts`), outils fournis (`builtin.ts`), un fichier par famille (pinceaux MyPaint, pixel, pipette). |
| `modes/`     | Les modes (pixel art, peinture) : définition et registre (`mode.ts`), modes fournis (`builtin.ts`).                                        |
| `commands/`  | Commandes de l'interface (`app-commands.ts`) et raccourcis (`keymap.ts`, `default-keymap.ts`).                                             |
| `files/`     | Document ouvert et fichiers (`session.svelte.ts`, `files.ts`, `file-worker.ts`), récents, import d'images, palettes enregistrées.          |

Imports (SvelteKit 3) : `#lib/…` au lieu de `$lib/…`, avec l'extension `.js` (ex. `#lib/core/editor/editor.js`). La configuration de SvelteKit est dans `vite.config.js` (plus de `svelte.config.js`).

## Principes du cœur

- **Tuiles** de 256 × 256, RGBA 8 bits, alpha prémultiplié. Une tuile vide n'existe pas ; une tuile stockée n'est jamais modifiée sur place.
- **Chaque modification** renvoie de quoi l'annuler ; l'historique ne stocke que les tuiles touchées.
- **Chaque changement est notifié** (calque, propriété, tuiles), et l'affichage ne met à jour que ça.
- **Toute action est une commande** du registre (`layer.add`, `history.undo`…), utilisable depuis un raccourci, un menu ou un plugin. Les boutons de l'interface exécutent des commandes, ils n'agissent jamais directement.

## Interface

- **Textes en anglais**, sans traduction (voir `DECISIONS.md`).
- **Couleurs et tailles** : uniquement les variables du thème (`var(--panel)`…), jamais de couleur en dur.
- **Nouveau mode** : une description (outils de la barre, outil du bout gomme, panneaux, raccourcis) ajoutée à `modes/builtin.ts`. Sa commande `mode.<id>` et son bouton viennent seuls.
- **Nouvel outil** : une définition (`defineTool`) avec ses réglages, ses contrôles pour la barre d'options, son curseur et son tracé, ajoutée à `builtin.ts`. Sa commande `tool.<id>` et son bouton viennent seuls.
- **Nouvelle action** : l'enregistrer comme commande (titre en anglais), puis l'associer à une touche dans `default-keymap.ts` si besoin. Elle apparaît alors dans la palette de commandes (Ctrl+K).

## Le moteur de pinceau (libmypaint)

- libmypaint 1.6.1, compilé par `native/mypaint/build.sh` (Emscripten, installé dans `~/emsdk`). Le résultat, `src/lib/mypaint/libmypaint.mjs`, est commité : Emscripten n'est nécessaire que pour le recompiler (`source ~/emsdk/emsdk_env.sh` puis `native/mypaint/build.sh`).
- `native/mypaint/didi-surface.c` : notre surface. Pendant un trait, libmypaint dessine dans ses tuiles 64 × 64 en 15 bits, chargées depuis le calque à la demande et recopiées en 8 bits dans nos tuiles à chaque frame.
- Utilisation alignée sur MyPaint 2 : API version 2, 256 seaux de smudge, zoom et rotation de la vue transmis, pinceau posé sans peindre au début du trait, horodatages identiques répartis dans le temps. Détails et raisons dans `DECISIONS.md`.
- Pinceaux : toute la collection officielle MyPaint (CC0) dans `src/lib/mypaint/brushes/<série>/`, aperçus dans `static/brushes/`.

## Comparer avec MyPaint

`npm run compare:brushes` dessine les mêmes traits (plusieurs pinceaux, plusieurs profils de pression) avec Didi et avec le code de MyPaint, puis écrit une planche dans `tools/brush-compare/out/sheet.png` : Didi, MyPaint, et les différences en rouge. Le rapport (quantité d'encre, écart maximal) s'affiche avec `--silent=false`.

Nécessite MyPaint installé en paquet système (`/usr/lib64/mypaint`). Sans lui, le test est ignoré, notamment en CI. Pour ajouter un cas : liste `cases()` dans `src/lib/mypaint/reference.test.ts`.

## Tests

- **Tests par propriétés** (fast-check) pour le cœur : des centaines de scénarios aléatoires comparés à un modèle simple (image plate, pile d'états, miroir construit depuis les notifications…).
- **Validation par bugs volontaires** : chaque nouveau test est vérifié en introduisant un défaut dans le code pour s'assurer qu'il le détecte.
- **Déterminisme** : un même trait donne toujours le même résultat, pour les 196 pinceaux.
- Garder les tests rapides : générateurs bornés, et toujours lancer les tests avec une limite de temps (`testTimeout` de 30 s dans `vite.config.js`).
- **Vérifier l'interface sans l'app** : `npx vite dev --port 1430` (pas 1420, réservé à `npm run tauri dev`), puis un Chromium headless piloté par le protocole DevTools pour cliquer et faire des captures. Les fichiers, dialogues et le stylet natif ne marchent que dans l'app Tauri.
