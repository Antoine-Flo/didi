// The .didi file format: a zip that any tool can open.
//
//   mimetype           "application/x-didi", first and uncompressed, to identify the file
//   document.json      size, layers and their settings (readable, versioned)
//   layers/1.png …     one standard PNG per layer, bottom to top, straight alpha
//   thumbnail.png      a small preview, for file lists
//
// document.json:
//   { "format": "didi", "version": 1, "width": 2048, "height": 2048, "activeLayer": 1,
//     "layers": [{ "name": "Background", "file": "layers/1.png", "visible": true,
//                  "locked": false, "opacity": 1, "blendMode": "normal" }, …],
//     "extensions": {} }
//
// `extensions` holds data of other modules (e.g. the Godot link): kept as is, even when
// not understood. Older versions are migrated when read; newer ones are refused.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { composite } from "../document/compositing";
import { Drawing } from "../document/drawing";
import { Editor } from "../editor/editor";
import { BLEND_MODES, DEFAULT_LAYER_PROPS, type LayerProps } from "../document/layer";
import { premultiply, unpremultiply } from "../document/pixels";
import { decodePng, encodePng } from "./png";
import { assertCanvasSize, TileStore, type TileSnapshot } from "../document/tiles";

export const DIDI_VERSION = 1;
export const DIDI_MIME = "application/x-didi";
export const THUMBNAIL_SIZE = 256;

/** A document as plain data: what is saved, and what can cross to a worker. */
export interface DocumentData {
  width: number;
  height: number;
  /** Bottom to top. Tiles are premultiplied, as in a layer. */
  layers: { props: LayerProps; tiles: TileSnapshot }[];
  /** Index of the active layer, -1 if there is none. */
  active: number;
  /** Data of other modules, kept as is. */
  extensions: Record<string, unknown>;
}

/** A file that cannot be read, with a message for the user. */
export class DidiFileError extends Error {}

interface LayerEntry extends LayerProps {
  file: string;
}

interface DocumentJson {
  format: "didi";
  version: number;
  width: number;
  height: number;
  activeLayer: number;
  layers: LayerEntry[];
  extensions: Record<string, unknown>;
}

/** Migrations from each older version to the next one: MIGRATIONS[1] turns 1 into 2. */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

/** The document of an editor. Cheap: tiles are shared, not copied. */
export function documentFromEditor(
  editor: Editor,
  extensions: Record<string, unknown> = {},
): DocumentData {
  const { drawing } = editor;
  const active = editor.activeLayer;
  return {
    width: drawing.width,
    height: drawing.height,
    layers: drawing.layers.map((l) => ({
      props: {
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        blendMode: l.blendMode,
      },
      tiles: l.tiles.snapshot(l.tiles.keys()),
    })),
    active: active ? drawing.indexOf(active.id) : -1,
    extensions,
  };
}

/** An editor for a document, with an empty history. */
export function editorFromDocument(data: DocumentData): Editor {
  const drawing = new Drawing(data.width, data.height);
  for (const { props, tiles } of data.layers) {
    // Unlocked while filling: locked layers refuse pixel changes.
    const layer = drawing.createLayer({ ...props, locked: false });
    drawing.addLayer(layer);
    drawing.restorePixels(layer.id, tiles);
    if (props.locked) drawing.updateLayer(layer.id, { locked: true });
  }
  const editor = new Editor(drawing);
  const active = drawing.layers[data.active];
  if (active) editor.setActiveLayer(active.id);
  return editor;
}

/** The pixels of a layer of the document: premultiplied RGBA. */
function layerPixels(data: DocumentData, tiles: TileSnapshot): Uint8ClampedArray {
  const store = new TileStore(data.width, data.height);
  store.restore(tiles);
  return store.readRegion(store.bounds);
}

/** The visible layers merged, as straight RGBA (for PNG export). */
export function flattenDocument(data: DocumentData): Uint8ClampedArray {
  const drawing = new Drawing(data.width, data.height);
  for (const { props, tiles } of data.layers) {
    const layer = drawing.createLayer({ ...props, locked: false });
    drawing.addLayer(layer);
    drawing.restorePixels(layer.id, tiles);
  }
  return unpremultiply(composite(drawing, { x: 0, y: 0, width: data.width, height: data.height }));
}

/** A small preview of the document, at most THUMBNAIL_SIZE pixels wide or high. */
export function thumbnail(data: DocumentData): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const full = flattenDocument(data);
  const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(data.width, data.height));
  const width = Math.max(1, Math.round(data.width * scale));
  const height = Math.max(1, Math.round(data.height * scale));
  const out = new Uint8ClampedArray(width * height * 4);
  // Box filter: each preview pixel averages the pixels it covers (weighted by alpha).
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * data.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * data.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * data.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * data.width) / width));
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * data.width + sx) * 4;
          const alpha = full[i + 3];
          r += full[i] * alpha;
          g += full[i + 1] * alpha;
          b += full[i + 2] * alpha;
          a += alpha;
        }
      }
      const o = (y * width + x) * 4;
      const n = (x1 - x0) * (y1 - y0);
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a / n);
    }
  }
  return { width, height, data: out };
}

/** Writes a .didi file. `thumbnailPng` can be given if already computed. */
export function writeDidi(
  data: DocumentData,
  thumbnailPng: Uint8Array = encodePng(thumbnail(data)),
): Uint8Array {
  const files: Zippable = { mimetype: [strToU8(DIDI_MIME), { level: 0 }] };
  const layers: LayerEntry[] = data.layers.map(({ props, tiles }, i) => {
    const file = `layers/${i + 1}.png`;
    const pixels = unpremultiply(layerPixels(data, tiles));
    // PNGs are already compressed: stored as is in the zip.
    files[file] = [
      encodePng({ width: data.width, height: data.height, data: pixels }),
      { level: 0 },
    ];
    return { ...props, file };
  });
  const json: DocumentJson = {
    format: "didi",
    version: DIDI_VERSION,
    width: data.width,
    height: data.height,
    activeLayer: data.active,
    layers,
    extensions: data.extensions,
  };
  files["document.json"] = [strToU8(JSON.stringify(json, null, 2) + "\n"), { level: 6 }];
  files["thumbnail.png"] = [thumbnailPng, { level: 0 }];
  return zipSync(files);
}

function unzip(bytes: Uint8Array, filter?: (name: string) => boolean): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes, filter ? { filter: (f) => filter(f.name) } : undefined);
  } catch {
    throw new DidiFileError("This is not a Didi file, or it is damaged (invalid zip).");
  }
}

/** The preview stored in a .didi file (PNG bytes), or null if there is none. */
export function readDidiThumbnail(bytes: Uint8Array): Uint8Array | null {
  return unzip(bytes, (name) => name === "thumbnail.png")["thumbnail.png"] ?? null;
}

/** Reads a .didi file. Throws a DidiFileError with a message for the user. */
export function readDidi(bytes: Uint8Array): DocumentData {
  const files = unzip(bytes);
  const jsonBytes = files["document.json"];
  if (!jsonBytes) throw new DidiFileError("This is not a Didi file (document.json is missing).");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(strFromU8(jsonBytes));
  } catch {
    throw new DidiFileError("The file is damaged (document.json is not valid JSON).");
  }
  if (typeof raw !== "object" || raw === null || raw.format !== "didi") {
    throw new DidiFileError("This is not a Didi file.");
  }
  const doc = migrate(raw);

  const width = doc.width as number;
  const height = doc.height as number;
  try {
    assertCanvasSize(width, height);
  } catch {
    throw new DidiFileError(`The file is damaged (invalid size ${width} × ${height}).`);
  }
  if (!Array.isArray(doc.layers)) throw new DidiFileError("The file is damaged (no layer list).");

  const layers = doc.layers.map((entry: unknown, i: number) => {
    const { props, file } = readLayerEntry(entry, i);
    const png = files[file];
    if (!png) throw new DidiFileError(`The file is damaged (${file} is missing).`);
    let image;
    try {
      image = decodePng(png);
    } catch (e) {
      throw new DidiFileError(`The file is damaged (${file}: ${(e as Error).message}).`);
    }
    if (image.width !== width || image.height !== height) {
      throw new DidiFileError(
        `${file} is ${image.width} × ${image.height}, the document is ${width} × ${height}.`,
      );
    }
    const store = new TileStore(width, height);
    store.writeRegion(store.bounds, premultiply(image.data));
    return { props, tiles: store.snapshot(store.keys()) };
  });

  const activeLayer = doc.activeLayer;
  const active =
    Number.isInteger(activeLayer) &&
    (activeLayer as number) >= 0 &&
    (activeLayer as number) < layers.length
      ? (activeLayer as number)
      : layers.length - 1;
  const extensions =
    typeof doc.extensions === "object" && doc.extensions !== null && !Array.isArray(doc.extensions)
      ? (doc.extensions as Record<string, unknown>)
      : {};
  return { width, height, layers, active, extensions };
}

function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let version = raw.version;
  if (!Number.isInteger(version) || (version as number) < 1) {
    throw new DidiFileError("The file is damaged (invalid version).");
  }
  if ((version as number) > DIDI_VERSION) {
    throw new DidiFileError(
      `This file was made with a newer version of Didi (format ${version}). Update Didi to open it.`,
    );
  }
  let doc = raw;
  while ((version as number) < DIDI_VERSION) {
    doc = MIGRATIONS[version as number](doc);
    version = (version as number) + 1;
  }
  return doc;
}

/** A layer of document.json. Missing settings take their default value. */
function readLayerEntry(entry: unknown, index: number): { props: LayerProps; file: string } {
  const fail = (what: string): never => {
    throw new DidiFileError(`The file is damaged (layer ${index + 1}: ${what}).`);
  };
  if (typeof entry !== "object" || entry === null) fail("not an object");
  const e = entry as Record<string, unknown>;
  if (typeof e.file !== "string") fail("no file");
  const props: LayerProps = { ...DEFAULT_LAYER_PROPS };
  if (e.name !== undefined) {
    if (typeof e.name !== "string" || !e.name.trim()) fail("invalid name");
    props.name = e.name as string;
  }
  for (const key of ["visible", "locked"] as const) {
    if (e[key] !== undefined) {
      if (typeof e[key] !== "boolean") fail(`invalid ${key}`);
      props[key] = e[key] as boolean;
    }
  }
  if (e.opacity !== undefined) {
    if (typeof e.opacity !== "number" || !(e.opacity >= 0 && e.opacity <= 1))
      fail("invalid opacity");
    props.opacity = e.opacity as number;
  }
  if (e.blendMode !== undefined) {
    if (!BLEND_MODES.includes(e.blendMode as never)) fail(`unknown blend mode ${e.blendMode}`);
    props.blendMode = e.blendMode as LayerProps["blendMode"];
  }
  return { props, file: e.file as string };
}
