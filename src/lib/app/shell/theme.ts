// Interface theme: a set of named tokens (colors, sizes, fonts), applied as CSS variables
// (`--bg`, `--text`…). Components only use these variables, never raw colors, so a theme
// file can later restyle the whole interface.

export const TOKENS = [
  /** Window background, behind the canvas. */
  "bg",
  /** Floating panels and bars. */
  "panel",
  /** Popups and dialogs, above panels. */
  "popup",
  /** Lines around panels and between sections. */
  "border",
  /** Text fields, menus, slider tracks. */
  "field",
  "field-border",
  "text",
  /** Labels, values, section titles. */
  "text-muted",
  /** Hints, placeholders, disabled items. */
  "text-faint",
  /** Hovered buttons and list items. */
  "hover",
  /** Selected tool, brush, layer, highlighted item. */
  "selected",
  /** Accent: focus rings, checkboxes. Used sparingly. */
  "accent",
  "danger",
  /** Close button of the title bar, when hovered. */
  "window-close",
  "window-close-text",
  /** Around the drawing. */
  "canvas-bg",
  /** Behind popups and dialogs. */
  "overlay",
  /** Under floating panels and popups. */
  "shadow",
  "font",
  /** One text size for the whole interface. */
  "font-size",
  /** Space unit: gaps between panels, panel padding. Smaller gaps are half of it. */
  "space",
  /** Height of buttons, fields and list rows. */
  "control-height",
  /** Height of the window's title bar: a bar as tall as the others (control height plus
   * space), and the space above it. */
  "titlebar-height",
  /** Corners of panels and popups. */
  "radius",
  /** Corners of buttons, fields and list items. */
  "radius-small",
  /** Icons in buttons and lists. */
  "icon-size",
  /** Chevrons and other small marks beside a text. */
  "icon-size-small",
  /** Icons of large buttons, e.g. the start screen's modes. */
  "icon-size-large",
  /** A percentage between two buttons, e.g. the zoom. It depends on the text size. */
  "percent-width",
] as const;

export type Token = (typeof TOKENS)[number];

export interface Theme {
  version: 1;
  name: string;
  /** Color scheme of native controls (scrollbars, color dialogs…). */
  scheme: "dark" | "light";
  tokens: Record<Token, string>;
}

/** A size that follows the interface size chosen by the user (`--ui-scale`). */
const scaled = (px: number) => `calc(${px}px * var(--ui-scale))`;

/** The dark theme, in neutral grays (see buildTheme for the tint). */
export const DARK_THEME: Theme = {
  version: 1,
  name: "Dark",
  scheme: "dark",
  tokens: {
    bg: "#1c1c1c",
    panel: "#262626",
    popup: "#2c2c2c",
    border: "#333333",
    field: "#1e1e1e",
    "field-border": "#3c3c3c",
    text: "#d4d4d4",
    "text-muted": "#9a9a9a",
    "text-faint": "#6a6a6a",
    hover: "#ffffff0f",
    selected: "#ffffff1f",
    accent: "#7a9cc6",
    danger: "#d97a7a",
    "window-close": "#c42b1c",
    "window-close-text": "#ffffff",
    "canvas-bg": "#1c1c1c",
    overlay: "#00000059",
    shadow: "0 2px 10px #00000040",
    font: "system-ui, sans-serif",
    "font-size": scaled(12),
    space: scaled(8),
    "control-height": scaled(26),
    "titlebar-height": scaled(42),
    radius: scaled(6),
    "radius-small": scaled(4),
    "icon-size": scaled(16),
    "icon-size-small": scaled(14),
    "icon-size-large": scaled(20),
    "percent-width": "4.5em",
  },
};

/** The light version: the same sizes and font, light grays and dark text. */
export const LIGHT_THEME: Theme = {
  version: 1,
  name: "Light",
  scheme: "light",
  tokens: {
    ...DARK_THEME.tokens,
    bg: "#d4d4d4",
    panel: "#e0e0e0",
    popup: "#e6e6e6",
    border: "#c4c4c4",
    field: "#e9e9e9",
    "field-border": "#b6b6b6",
    text: "#262626",
    "text-muted": "#5e5e5e",
    "text-faint": "#828282",
    hover: "#0000000d",
    selected: "#0000001a",
    accent: "#4a72a8",
    danger: "#c0392b",
    "canvas-bg": "#d4d4d4",
    overlay: "#00000033",
    shadow: "0 2px 10px #00000026",
  },
};

// The user's choices (Preferences): dark or light, whether the grays take Didi's tint (a
// cool blue), and the canvas's background.

export type ThemeMode = "dark" | "light";
export const THEME_MODES: readonly ThemeMode[] = ["dark", "light"];

export interface ThemeChoice {
  mode: ThemeMode;
  /** The grays take Didi's tint; otherwise they are neutral. */
  tint: boolean;
  /** Around the drawing: a color (#rrggbb), or null for the theme's. */
  canvas: string | null;
}

export const DEFAULT_CHOICE: ThemeChoice = { mode: "dark", tint: true, canvas: null };

/** Didi's tint: an OKLCH hue, and the chroma of the grays. */
const TINT_HUE = 250;
const TINT_CHROMA = 0.01;
/** How much of the tint the canvas's background takes: a tint around the drawing changes
 * how its colors are seen, so it stays faint. */
const CANVAS_TINT = 0.5;

/** The grays that take the tint; the text ones take half of it. */
const TINTED: readonly Token[] = ["bg", "panel", "popup", "border", "field", "field-border"];
const TINTED_TEXT: readonly Token[] = ["text", "text-muted", "text-faint"];

/** The theme of a choice: the dark or light one, tinted or not, with its canvas color. */
export function buildTheme(choice: ThemeChoice): Theme {
  const base = choice.mode === "light" ? LIGHT_THEME : DARK_THEME;
  const tokens = { ...base.tokens };
  if (choice.tint) {
    for (const token of TINTED) tokens[token] = tintGray(tokens[token], TINT_HUE, TINT_CHROMA);
    for (const token of TINTED_TEXT) {
      tokens[token] = tintGray(tokens[token], TINT_HUE, TINT_CHROMA / 2);
    }
    tokens["canvas-bg"] = tintGray(tokens["canvas-bg"], TINT_HUE, TINT_CHROMA * CANVAS_TINT);
  }
  if (choice.canvas) tokens["canvas-bg"] = choice.canvas;
  return { ...base, tokens };
}

/** A gray (#rrggbb) with the same lightness, in a hue (degrees) and chroma (OKLCH). */
export function tintGray(hex: string, hue: number, chroma: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  // OKLab lightness (Björn Ottosson's matrices).
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const bb = chroma * Math.sin((hue * Math.PI) / 180);
  const l2 = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m2 = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s2 = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  const rgb = [
    4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2,
    -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2,
    -0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2,
  ];
  return (
    "#" +
    rgb
      .map((c) => {
        const v = Math.round(fromLinear(Math.min(1, Math.max(0, c))) * 255);
        return v.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** Applies a theme to the document. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
  for (const token of TOKENS) root.style.setProperty(`--${token}`, theme.tokens[token]);
  root.style.colorScheme = theme.scheme;
}
