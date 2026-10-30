# Didi — Décisions techniques

Les choix importants, avec ce qui les justifie. Les plus récents en haut.

---

## Pixels : GPU pour peindre, copie CPU par tuile

**Date** : 2026-10-30 · **Phase** : 0

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

**Décision** : PixiJS en WebGL est retenu pour le rendu et le tamponnage. Les dabs sont accumulés pendant la frame et appliqués en un seul lot dans la texture du calque.

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
