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

export const DEFAULT_THEME: Theme = {
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

/** Applies a theme to the document. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
  for (const token of TOKENS) root.style.setProperty(`--${token}`, theme.tokens[token]);
  root.style.colorScheme = theme.scheme;
}
