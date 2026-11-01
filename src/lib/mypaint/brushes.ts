// Brushes bundled with Didi: the whole MyPaint brush collection (CC0, see
// brushes/LICENSE-mypaint-brushes), one folder per pack. Previews are in static/brushes/.

import { parseMyb, type MybBrush } from "./myb";

export interface BundledBrush {
  /** "pack/name", e.g. "deevad/2B_pencil". */
  id: string;
  name: string;
  pack: string;
  /** Erasers are offered for the eraser tool. */
  eraser: boolean;
  /** The diameter the brush was designed for, in pixels. */
  nativeSize: number;
  myb: MybBrush;
}

const files = import.meta.glob("./brushes/*/*.myb", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** A first selection, with French names, shown before the packs. */
export const ESSENTIALS: Record<string, string> = {
  "deevad/basic_digital_brush": "Pinceau numérique",
  "deevad/2B_pencil": "Crayon 2B",
  "deevad/liner": "Encreur",
  "deevad/airbrush": "Aérographe",
  "classic/charcoal": "Fusain",
  "deevad/chalk": "Craie",
  "deevad/watercolor_glazing": "Aquarelle",
  "deevad/basic_digital_brush_smudging": "Pinceau mélangeur",
  "deevad/blending": "Estompe",
  "deevad/large_hard_eraser": "Gomme dure",
  "deevad/kneaded_eraser": "Gomme mie de pain",
};

export const PACKS: Record<string, string> = {
  deevad: "David Revoy",
  classic: "Classiques",
  tanda: "Tanda (huile, acrylique, aquarelle)",
  ramon: "Ramón Miranda",
  kaerhon_v1: "Kaerhon",
  Dieterle: "Dieterle",
  experimental: "Expérimentaux",
};

/** "8B_Pencil_1" → "8B Pencil 1". */
function prettify(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Every bundled brush, sorted by pack then name. */
export const BUNDLED_BRUSHES: BundledBrush[] = Object.entries(files)
  .map(([path, text]) => {
    const [, pack, name] = /^\.\/brushes\/([^/]+)\/(.+)\.myb$/.exec(path)!;
    const id = `${pack}/${name}`;
    const myb = parseMyb(text);
    const radius = Math.exp(myb.settings.radius_logarithmic?.base_value ?? Math.log(2));
    return {
      id,
      name: ESSENTIALS[id] ?? prettify(name),
      pack,
      eraser: (myb.settings.eraser?.base_value ?? 0) > 0.5,
      nativeSize: Math.round(radius * 2 * 10) / 10,
      myb,
    };
  })
  .sort((a, b) => a.pack.localeCompare(b.pack) || a.name.localeCompare(b.name));

const byId = new Map(BUNDLED_BRUSHES.map((b) => [b.id, b]));

export function bundledBrush(id: string): BundledBrush {
  const brush = byId.get(id);
  if (!brush) throw new Error(`Unknown brush ${id}`);
  return brush;
}

/** Groups for a brush menu: essentials first, then each pack. */
export function brushGroups(eraser: boolean): { label: string; brushes: BundledBrush[] }[] {
  const keep = (b: BundledBrush) => b.eraser === eraser;
  const essentials = Object.keys(ESSENTIALS).map(bundledBrush).filter(keep);
  const packs = Object.keys(PACKS).map((pack) => ({
    label: PACKS[pack],
    brushes: BUNDLED_BRUSHES.filter((b) => b.pack === pack && keep(b)),
  }));
  return [{ label: "Essentiels", brushes: essentials }, ...packs].filter((g) => g.brushes.length);
}
