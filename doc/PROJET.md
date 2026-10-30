# Didi — Description du projet

## Vision

Didi est un logiciel de dessin pour tablette graphique, à mi-chemin entre Aseprite (pixel art, animation) et Krita (peinture numérique), **intégré directement à Godot**.

Il doit être aussi simple et intuitif que Procreate, avec une interface propre, sobre et bien rangée, à la manière de Blender.

L'intégration avec Godot est la force du logiciel : on dessine et on voit le résultat dans le jeu, en direct.

## Ce qui rend Didi unique

- **Mise à jour en direct** : chaque trait se met à jour dans l'éditeur Godot et dans le jeu en cours d'exécution.
- **Dessiner dans la scène** : utiliser la scène Godot comme référence pour dessiner en contexte.
- **Tester avec les lumières** : prévisualiser un sprite et sa normal map sous l'éclairage de la scène.
- **Aller-retour naturel** : « Éditer dans Didi » depuis Godot, export automatique des sprites, animations et tilesets au bon format.

## Distribution

- **Steam en première cible**, avec Windows comme plateforme principale. Linux (dont le Steam Deck) et macOS sont aussi visés.
- **Pas de version navigateur** : l'intégration à Godot a besoin d'un accès aux fichiers du projet (écriture, surveillance) que le web ne donne pas.
- Le Steam Workshop pourra servir à partager pinceaux, roues, thèmes et plugins.

## Roue rapide

Inspirée de la roue de Krita, mais entièrement personnalisable. Elle libère l'écran : l'essentiel est sous le stylet, en un clic, et c'est l'utilisateur qui décide ce qu'il y met.

- **Contenu libre** : pinceaux, couleurs, outils, n'importe quelle commande, ou une sous-roue.
- **Plusieurs roues** : une par usage (peinture, pixel art, encrage…), on passe facilement de l'une à l'autre.
- **Ouverture** sous le curseur, par un bouton du stylet ou un raccourci, au choix.
- **Partage** : une roue s'exporte avec les pinceaux qu'elle utilise, et on importe celles des autres.

## Principes

- **L'essentiel d'abord** : peu de fonctionnalités au début, mais chacune soignée, rapide et stable.
- **Performance et légèreté** : une latence du stylet imperceptible, 60 fps, une consommation mémoire maîtrisée.
- **Qualité** : chaque composant est testé avant de passer au suivant.
- **Personnalisable** : thèmes, pinceaux et raccourcis sont de simples fichiers, faciles à modifier et à partager.
- **Extensible** : les outils internes reposent sur la même API que les plugins.

## Architecture

- **Cœur indépendant** : document, calques, historique et pinceaux sont du TypeScript pur, sans dépendance à l'UI ni au rendu.
- **Commandes** : toute action passe par un registre central (raccourcis, menus, palette de commandes, plugins, undo/redo).
- **Calques en tuiles** : seules les zones modifiées sont mises à jour et stockées dans l'historique.
- **Couche plateforme** : tout ce qui dépend du système (entrée tablette, fichiers, lien avec Godot) passe par une interface commune. Chaque OS a son implémentation, et les tests utilisent une version simulée.
- **Source d'entrée abstraite** : le moteur de pinceau ne sait pas d'où viennent les points. On utilise la meilleure source par OS : Pointer Events de la webview ou lecture native côté Rust.
- **Tout est donnée** : pinceaux, thèmes, keymaps, roues et palettes sont du JSON (+ PNG), avec un numéro de version.
- **Formats versionnés** : fichier `.didi` (zip de PNG + JSON), avec des migrations entre versions.

## Stack technique

| Domaine     | Choix                                              |
| ----------- | -------------------------------------------------- |
| Application | Tauri 2, SvelteKit (statique), Svelte 5            |
| Rendu       | PixiJS, pixi-viewport                              |
| Couleur     | culori (OKLCH)                                     |
| Interface   | Bits UI, thème par tokens CSS ; Dockview plus tard |
| Raccourcis  | hotkeys-js                                         |
| Fichiers    | fflate (zip), Comlink (Web Workers)                |
| Rust        | notify, image, tokio-tungstenite                   |
| Godot       | plugin éditeur en GDScript, WebSocketPeer natif    |

## Long terme

- Création et partage de pinceaux.
- Système de plugins (avec sandbox et permissions).
- Partage de thèmes et de roues.
- Asset store (pinceaux, roues, thèmes, plugins), par exemple via le Steam Workshop.
- Import de fichiers `.kra` et `.ase`.
