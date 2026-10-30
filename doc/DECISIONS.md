# Didi — Décisions techniques

Les choix importants, avec ce qui les justifie. Les plus récents en haut.

---

## Entrée tablette sous Linux : lecture native

**Date** : 2026-10-30 · **Phase** : 0

**Constat** (XP-Pen Artist 16 3rd, KDE Plasma Wayland, page `/lab/tablet`) :

| | WebKitGTK (Pointer Events) | Natif (GTK, côté Rust) | Chromium (référence) |
|---|---|---|---|
| Type de pointeur | souris | stylet / gomme | stylet |
| Pression | 0.5 fixe | ~450 niveaux | oui |
| Inclinaison | 0 | oui | oui |
| Fréquence | ~220 Hz | ~220 Hz | ~240 Hz |
| Latence moyenne | ~6 ms | < 0,5 ms | ~3 ms |

**Décision** : sous Linux, le dessin utilise les événements GTK lus côté Rust et envoyés au front par un canal Tauri. Les événements continuent vers WebKit, l'UI reste utilisable normalement. Le moteur de pinceau reçoit les points via une source d'entrée abstraite. Windows et macOS seront évalués séparément.

**Notes** :

- GTK renvoie l'inclinaison entre -1 et 1 pour -90° à 90°. Elle est convertie en degrés côté Rust.
- Le regroupement des mouvements de GTK est désactivé pour recevoir tous les échantillons.
- Les boutons du stylet dépendent des pilotes : selon la configuration, on reçoit un bouton 2/3, un passage en mode gomme, ou rien. Didi devra permettre d'associer une action à chaque cas.
- Le léger décalage entre la pointe et le trait vient de la calibration de l'écran (identique dans Krita et Brave), pas de Didi.
