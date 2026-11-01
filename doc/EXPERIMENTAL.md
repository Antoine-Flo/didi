# Didi — Idées expérimentales

Idées à explorer, non validées. Elles ne font pas partie de la roadmap tant qu'elles n'ont pas été testées.

---

## Drawers

Utiliser le stylet pour l'interface : des languettes au bord de l'écran, qu'on tire pour faire descendre un tiroir (outils, pinceaux, couleurs, calques…). L'écran reste libre au lieu d'avoir des panneaux toujours ouverts.

**Hiérarchie envisagée**

1. La roue : sous le stylet, pour l'essentiel.
2. Une mini-barre toujours visible : outils et pinceaux principaux, actions de calque de base.
3. Les drawers : tout le reste, à la demande.

**Points d'attention**

- Ouvrir par glissé (le drawer suit le stylet) ou par simple clic.
- Languettes placables sur n'importe quel bord (écran-tablette, tablette sans écran, gauchers).
- Ouverture uniquement depuis une languette, pour éviter les déclenchements en dessinant.
- Drawer épinglable, qui devient alors un panneau fixe.
- Le drawer passe par-dessus le canvas, sans le déplacer.
- Fermeture rapide : clic sur le canvas ou geste vers le haut.
- Languettes toujours visibles et identifiables.

**Extensions possibles**

- Glisser un élément d'un drawer vers la roue ou la mini-barre.
- Un « espace de travail » partageable regroupant roues, mini-barre et drawers.

**À valider** : prototype à tester en conditions réelles avant de l'intégrer. Une alternative serait la disposition fixe de la phase 4.

---

## Deux bureaux : pixel art et peinture

Didi doit être aussi à l'aise en pixel art qu'en peinture 2D, sans favoriser l'un ou l'autre. Idée : deux « bureaux » au choix, comme 2D / 3D dans Godot, chacun avec ses outils, ses réglages par défaut et sa disposition.

- **Pixel art** : pinceau pixel, pixel-perfect, grille, palettes, zoom entier, pas de lissage.
- **Peinture** : pinceaux doux, pression, lissage, mélange de couleurs.

Le moteur reste commun : mêmes calques, même historique, mêmes outils de base. Seuls les réglages et l'interface changent.

**À valider** : plus tard, une fois les outils de base en place.
