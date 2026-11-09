// A libmypaint brush: its settings, loaded from a .myb file, and its size and color.

import type { MyPaint } from "#lib/mypaint/engine.js";
import type { MybBrush } from "#lib/mypaint/myb.js";

/** Every input libmypaint 1.6 knows, to reset a setting's curves before loading a brush. */
const INPUTS = [
  "pressure",
  "speed1",
  "speed2",
  "random",
  "stroke",
  "direction",
  "tilt_declination",
  "tilt_ascension",
  "custom",
  "direction_angle",
  "attack_angle",
  "tilt_declinationx",
  "tilt_declinationy",
  "gridmap_x",
  "gridmap_y",
  "viewzoom",
  "barrel_rotation",
  "brush_radius",
];

export class Brush {
  constructor(
    private readonly mp: MyPaint,
    readonly ptr: number,
  ) {}

  /** Loads a .myb brush, the way MyPaint does. Unknown settings and inputs are ignored. */
  load(myb: MybBrush) {
    const { mod } = this.mp;
    mod._mypaint_brush_from_defaults(this.ptr);
    for (const [name, setting] of Object.entries(myb.settings)) {
      const id = this.mp.settingId(name);
      if (id < 0) {
        continue;
      }
      mod._mypaint_brush_set_base_value(this.ptr, id, setting.base_value);
      // The file lists all the curves of this setting: clear the others.
      for (const input of INPUTS) {
        const inputId = this.mp.inputId(input);
        if (inputId >= 0) {
          mod._mypaint_brush_set_mapping_n(this.ptr, id, inputId, 0);
        }
      }
      for (const [input, points] of Object.entries(setting.inputs)) {
        const inputId = this.mp.inputId(input);
        if (inputId < 0) {
          continue;
        }
        mod._mypaint_brush_set_mapping_n(this.ptr, id, inputId, points.length);
        points.forEach(([x, y], i) => {
          mod._mypaint_brush_set_mapping_point(this.ptr, id, inputId, i, x, y);
        });
      }
    }
  }

  set(name: string, value: number) {
    const id = this.mp.settingId(name);
    if (id < 0) {
      throw new Error(`Unknown brush setting ${name}`);
    }
    this.mp.mod._mypaint_brush_set_base_value(this.ptr, id, value);
  }

  get(name: string): number {
    const id = this.mp.settingId(name);
    if (id < 0) {
      throw new Error(`Unknown brush setting ${name}`);
    }
    return this.mp.mod._mypaint_brush_get_base_value(this.ptr, id);
  }

  /** Brush diameter in pixels (libmypaint stores the log of the radius). */
  set size(diameter: number) {
    this.set("radius_logarithmic", Math.log(Math.max(0.2, diameter) / 2));
  }

  get size(): number {
    return Math.exp(this.get("radius_logarithmic")) * 2;
  }

  /** Straight sRGB color, 0-255. */
  setColor([r, g, b]: readonly [number, number, number]) {
    const [h, s, v] = rgbToHsv(r / 255, g / 255, b / 255);
    this.set("color_h", h);
    this.set("color_s", s);
    this.set("color_v", v);
  }

  destroy() {
    this.mp.mod._mypaint_brush_unref(this.ptr);
  }
}
/** sRGB in [0, 1] → hue, saturation, value in [0, 1]. */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) {
      h = ((g - b) / d) % 6;
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h /= 6;
    if (h < 0) {
      h += 1;
    }
  }
  return [h, max === 0 ? 0 : d / max, max];
}
