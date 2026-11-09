// Keyboard shortcuts: a keymap binds key chords to commands (with optional params).
//
// Keymaps are plain data, so they can later be loaded from a file. A chord is written like
// "ctrl+shift+z", "]" or "f2": modifiers in the order ctrl, alt, shift, then the key, all
// lowercase. Cmd (macOS) counts as ctrl.
//
// Keys are matched by the character they type (`KeyboardEvent.key`), not by their position,
// so shortcuts follow the user's layout (AZERTY…). For symbols and digits, Shift and AltGr
// are part of how the character is typed, not modifiers: "0" works on AZERTY, where it
// needs Shift, and "[" where it needs AltGr.

import { m } from "#lib/paraglide/messages.js";

export interface Binding {
  /** Key chord, e.g. "ctrl+z". */
  keys: string;
  command: string;
  /** JSON-serializable params for the command. */
  params?: unknown;
}

export interface Keymap {
  version: 1;
  bindings: Binding[];
}

/** The parts of a KeyboardEvent a chord depends on. */
export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** AltGr is down (`getModifierState("AltGraph")`). */
  altGraph?: boolean;
}

const MODIFIERS = ["ctrl", "alt", "shift"] as const;
type Modifier = (typeof MODIFIERS)[number];

/** Names for keys whose `KeyboardEvent.key` is unclear or ambiguous in a chord. */
const KEY_NAMES: Record<string, string> = {
  " ": "space",
  "+": "plus",
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  arrowdown: "down",
  esc: "escape",
  del: "delete",
};

const MODIFIER_KEYS = new Set(["control", "alt", "altgraph", "shift", "meta", "os"]);

function keyName(key: string): string {
  const lower = key.toLowerCase();
  return KEY_NAMES[lower] ?? lower;
}

/** A single character that is not a letter: typed with Shift or AltGr on some layouts. */
function isSymbol(key: string): boolean {
  return [...key].length === 1 && key.toLowerCase() === key.toUpperCase();
}

/** Normalizes a written chord ("Shift+Ctrl+Z" → "ctrl+shift+z"). Throws if invalid. */
export function normalizeChord(chord: string): string {
  // "ctrl++" and "+" mean the plus key.
  const text = chord.trim().toLowerCase();
  const parts = (text === "+" ? "plus" : text.replace(/\+\+$/, "+plus")).split("+");
  const key = keyName(parts.pop()!);
  const modifiers = new Set<Modifier>();
  for (const part of parts) {
    const modifier = part === "cmd" || part === "meta" ? "ctrl" : part;
    if (!MODIFIERS.includes(modifier as Modifier)) {
      throw new Error(`Invalid modifier "${part}" in "${chord}"`);
    }
    modifiers.add(modifier as Modifier);
  }
  if (!key || MODIFIER_KEYS.has(key)) {
    throw new Error(`Invalid key in "${chord}"`);
  }
  return [...MODIFIERS.filter((m) => modifiers.has(m)), key].join("+");
}

/** The chord of a key press, or null for a modifier key alone. */
export function chordOf(e: KeyInput): string | null {
  const key = keyName(e.key);
  if (MODIFIER_KEYS.has(key) || key === "dead" || key === "unidentified") {
    return null;
  }
  const symbol = isSymbol(e.key) && key !== "space";
  // With AltGr, some systems also report Ctrl and Alt (Windows).
  const altGraph = symbol && e.altGraph;
  const parts: string[] = [];
  if ((e.ctrlKey || e.metaKey) && !altGraph) {
    parts.push("ctrl");
  }
  if (e.altKey && !altGraph) {
    parts.push("alt");
  }
  if (e.shiftKey && !symbol) {
    parts.push("shift");
  }
  parts.push(key);
  return parts.join("+");
}

/** Shows a chord to the user: "ctrl+shift+z" → "Ctrl+Shift+Z". */
export function formatChord(chord: string): string {
  const LABELS: Record<string, string> = {
    ctrl: m.key_ctrl(),
    alt: m.key_alt(),
    shift: m.key_shift(),
    plus: "+",
    space: m.key_space(),
    escape: m.key_esc(),
    delete: m.key_del(),
    enter: m.key_enter(),
    backspace: m.key_backspace(),
    left: "←",
    right: "→",
    up: "↑",
    down: "↓",
  };
  return chord
    .split("+")
    .map((part) => LABELS[part] ?? part.charAt(0).toUpperCase() + part.slice(1))
    .join("+");
}

/** Fast lookup of a keymap's bindings. Later bindings for the same chord win. */
export class KeymapIndex {
  private byChord = new Map<string, Binding>();

  constructor(keymap: Keymap) {
    for (const binding of keymap.bindings) {
      this.byChord.set(normalizeChord(binding.keys), binding);
    }
  }

  /** The binding for a key press, if any. */
  match(e: KeyInput): Binding | undefined {
    const chord = chordOf(e);
    return chord === null ? undefined : this.byChord.get(chord);
  }

  /** Each bound command with its chords, in keymap order (params ignored). */
  shortcuts(): { command: string; chords: string[] }[] {
    const byCommand = new Map<string, string[]>();
    for (const [chord, b] of this.byChord) {
      const chords = byCommand.get(b.command);
      if (chords) {
        chords.push(chord);
      } else {
        byCommand.set(b.command, [chord]);
      }
    }
    return [...byCommand].map(([command, chords]) => ({ command, chords }));
  }

  /** The chords bound to a command with these params, in keymap order. */
  chordsFor(command: string, params?: unknown): string[] {
    const wanted = JSON.stringify(params);
    return [...this.byChord]
      .filter(([, b]) => b.command === command && JSON.stringify(b.params) === wanted)
      .map(([chord]) => chord);
  }
}
