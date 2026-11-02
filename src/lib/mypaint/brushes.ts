// Brushes bundled with Didi: the whole MyPaint brush collection (CC0, see
// brushes/LICENSE-mypaint-brushes), one folder per pack. Previews are in static/brushes/.

import { parseMyb, type MybBrush } from "./myb";

export interface BundledBrush {
  /** "pack/name", e.g. "deevad/2B_pencil". */
  id: string;
  name: string;
  pack: string;
  /** Erasers are offered for the eraser tool (see brush-sets.ts). */
  eraser: boolean;
  /**
   * The diameter the brush was designed for, in pixels, at the pressure that makes it
   * largest (see `pressureSizeFactor`).
   */
  nativeSize: number;
  /**
   * The brush's largest diameter over the pressure range, relative to its base diameter
   * (libmypaint's radius): many brushes grow (or shrink) with pressure. Like Krita, the size
   * shown to the user is that largest diameter.
   */
  pressureSizeFactor: number;
  myb: MybBrush;
}

const files = import.meta.glob("./brushes/*/*.myb", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

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
    // libmypaint adds each input's curve to the log of the radius.
    const curve = myb.settings.radius_logarithmic?.inputs.pressure;
    const factor = curve?.length ? Math.exp(Math.max(...curve.map(([, y]) => y))) : 1;
    return {
      id,
      name: prettify(name),
      pack,
      eraser: (myb.settings.eraser?.base_value ?? 0) > 0.5,
      nativeSize: Math.round(radius * 2 * factor * 10) / 10,
      pressureSizeFactor: factor,
      myb,
    };
  })
  .sort((a, b) => a.pack.localeCompare(b.pack) || a.name.localeCompare(b.name));

const byId = new Map(BUNDLED_BRUSHES.map((b) => [b.id, b]));

export function findBundledBrush(id: string): BundledBrush | undefined {
  return byId.get(id);
}

export function bundledBrush(id: string): BundledBrush {
  const brush = byId.get(id);
  if (!brush) throw new Error(`Unknown brush ${id}`);
  return brush;
}
