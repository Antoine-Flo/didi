// The bundled brushes sorted by kind: one set per painting tool (pencil, ink, brush…). Each
// set has a first selection, best first (the first one is the tool's default brush), and
// the other brushes of that kind, offered under "More brushes". Every bundled brush is in
// exactly one set; erasers only in the eraser set.

import { bundledBrush, type BundledBrush } from "#lib/mypaint/brushes.js";

export interface BrushSet {
  /** Also the id of its tool, e.g. "pencil". */
  id: string;
  picks: string[];
  more: string[];
}

export const BRUSH_SETS: BrushSet[] = [
  {
    id: "pencil",
    picks: [
      "deevad/2B_pencil",
      "deevad/4H_pencil",
      "Dieterle/8B_Pencil_1",
      "ramon/B-pencil",
      "ramon/Sketch_1",
      "kaerhon_v1/Sketcher2_sk",
      "experimental/subtle_pencil",
      "tanda/pencil-8b",
      "classic/pencil",
    ],
    more: [
      "tanda/pencil-2b",
      "ramon/2B_pencil",
      "Dieterle/Pencil-_Left_Handed",
      "ramon/P__Shade",
      "kaerhon_v1/Dirty_Transparent_sk",
    ],
  },
  {
    id: "ink",
    picks: [
      "deevad/liner",
      "deevad/pen",
      "deevad/ballpen",
      "deevad/soft-dip-pen",
      "classic/calligraphy",
      "classic/pointy_ink",
      "kaerhon_v1/inkster_l",
      "ramon/Thin_Pen",
      "classic/marker_fat",
      "classic/marker_small",
      "ramon/Marker",
      "tanda/marker-01",
    ],
    more: [
      "deevad/pen-note",
      "classic/pen",
      "classic/slow_ink",
      "classic/textured_ink",
      "classic/ink_blot",
      "classic/kabura",
      "kaerhon_v1/ink-slowline_s",
      "kaerhon_v1/ink_slow_s",
      "ramon/Pen",
      "ramon/PenBrush",
      "ramon/Delayed",
      "tanda/marker-05",
      "Dieterle/Fountain_SF_1",
      "Dieterle/Fount-offset_1",
      "experimental/irregular_ink",
      "experimental/pixel_hardink",
      "experimental/1pixel",
    ],
  },
  {
    id: "brush",
    picks: [
      "deevad/basic_digital_brush",
      "deevad/detail_brush_thin",
      "deevad/detail_brush_large",
      "deevad/brush",
      "deevad/rigger_brush",
      "ramon/Round",
      "ramon/100__Opaque",
      "ramon/Classic_Paint",
      "deevad/basic_digital_knife",
      "tanda/oil-03-paint",
      "tanda/acrylic-04-paint",
      "kaerhon_v1/paint_sm",
    ],
    more: [
      "deevad/detail_brush_thin_glazing",
      "deevad/detail_brush_large_glazing",
      "deevad/rigger_brush_thin",
      "deevad/fill",
      "deevad/rough",
      "classic/brush",
      "classic/bulk",
      "classic/coarse_bulk_1",
      "classic/coarse_bulk_2",
      "classic/coarse_bulk_3",
      "classic/rounded",
      "classic/knife",
      "classic/modelling",
      "classic/modelling2",
      "classic/impressionism",
      "classic/imp_details",
      "classic/puantilism",
      "classic/puantilism2",
      "classic/smudge_paint",
      "classic/dry_brush",
      "Dieterle/Round_1",
      "Dieterle/Flat2_1",
      "Dieterle/Fan_1",
      "kaerhon_v1/classic_sk",
      "kaerhon_v1/classicroundblock_static_c",
      "kaerhon_v1/extreme_round_l",
      "kaerhon_v1/fill_c",
      "kaerhon_v1/flat_bar_l",
      "kaerhon_v1/paint_barrr_sm",
      "kaerhon_v1/paint_radius_2_sm",
      "kaerhon_v1/wet_paint_sm",
      "kaerhon_v1/smudge_ink_0_7__sm",
      "ramon/wet_round",
      "ramon/Round_Bl",
      "ramon/Wet_Direction",
      "ramon/Knife",
      "tanda/acrylic-03-paint",
      "tanda/acrylic-03-with-water",
      "tanda/acrylic-04-with-water",
      "tanda/acrylic-05-paint",
      "tanda/acrylic-05-with-water",
      "tanda/oil-01-paint",
      "tanda/oil-06-paint",
      "experimental/basic",
      "experimental/soft",
      "experimental/pixelblocking",
    ],
  },
  {
    id: "watercolor",
    picks: [
      "deevad/watercolor_glazing",
      "deevad/watercolor_expressive",
      "deevad/thin_watercolor",
      "deevad/large_watercolor_fringe",
      "tanda/watercolor-02-paint",
      "Dieterle/WateryFlatbrush",
    ],
    more: [
      "deevad/only_water_fringe",
      "tanda/watercolor-02-water",
      "tanda/water-01",
      "tanda/water-02",
      "tanda/water-05",
      "tanda/water-06",
    ],
  },
  {
    id: "airbrush",
    picks: [
      "deevad/airbrush",
      "kaerhon_v1/airbruch_press_a",
      "ramon/BigAirbrush",
      "ramon/Glow_Airbrush",
      "deevad/spray",
      "deevad/spray2",
      "tanda/splatter-02",
      "tanda/splatter-04",
    ],
    more: [
      "kaerhon_v1/Airbrush_a",
      "kaerhon_v1/airsmudgeultimate_sk",
      "ramon/Beamlight",
      "experimental/glow",
      "Dieterle/Splash",
    ],
  },
  {
    id: "blend",
    picks: [
      "deevad/blending",
      "deevad/basic_digital_brush_smudging",
      "deevad/basic_digital_knife_smudging",
      "classic/smudge",
      "classic/blur",
      "ramon/Smear",
      "deevad/sponge_smudging",
      "deevad/grainy_blending",
      "classic/blending_knife",
      "kaerhon_v1/airsmudge_a",
    ],
    more: [
      "classic/blend_paint",
      "classic/imp_blending",
      "classic/wet_knife",
      "Dieterle/Blender",
      "Dieterle/Dissolver",
      "kaerhon_v1/Smear_sm",
      "ramon/Blur_Fast",
      "ramon/RS_blendOP",
      "ramon/Dirty_Noise",
      "tanda/acrylic-03-only-water",
      "tanda/acrylic-04-only-water",
      "tanda/acrylic-05-only-water",
      "tanda/oil-01-clean",
      "tanda/oil-03-clean",
      "tanda/oil-06-clean",
      "tanda/oil-mop",
      "tanda/charcoal-blur1",
      "experimental/pick_and_drag",
    ],
  },
  {
    id: "texture",
    picks: [
      "classic/charcoal",
      "deevad/chalk",
      "ramon/Pastel_1",
      "tanda/charcoal-04",
      "ramon/Grain",
      "tanda/texture-03",
      "tanda/texture-06",
      "ramon/Clouds",
      "classic/short_grass",
      "experimental/leaves",
      "experimental/fur",
      "Dieterle/HalfTone_1",
    ],
    more: [
      "tanda/charcoal-01",
      "tanda/charcoal-03",
      "tanda/texture-12",
      "classic/long_grass",
      "Dieterle/HalfToneCMY_1",
      "Dieterle/Posterizer",
      "Dieterle/Flight_Feathers",
      "Dieterle/Tail_Feathers",
      "Dieterle/Tail_Feathers2",
      "Dieterle/arrow_1",
      "experimental/DNA_brush",
      "experimental/bubble",
      "experimental/hard_blot",
      "experimental/hard_sting",
      "experimental/particules_3",
      "experimental/particules_eraser",
      "experimental/sewing",
      "experimental/small_blot",
      "experimental/soft_irregular",
      "experimental/spaced-blot",
      "experimental/speed_blot",
      "experimental/track",
    ],
  },
  {
    id: "eraser",
    picks: [
      "deevad/large_hard_eraser",
      "deevad/thin_hard_eraser",
      "deevad/kneaded_eraser",
      "deevad/kneaded_eraser_large",
      "ramon/Soft_Eraser",
      "ramon/Hard_Eraser",
    ],
    more: ["classic/ink_eraser", "Dieterle/Eraser"],
  },
];

const byId = new Map(BRUSH_SETS.map((s) => [s.id, s]));

export function brushSet(id: string): BrushSet {
  const set = byId.get(id);
  if (!set) {
    throw new Error(`Unknown brush set ${id}`);
  }
  return set;
}

/** The set holding a brush, if any. */
export function setOfBrush(brushId: string): BrushSet | undefined {
  return BRUSH_SETS.find((s) => s.picks.includes(brushId) || s.more.includes(brushId));
}

/** A set's brushes, resolved. */
export function setBrushes(set: BrushSet): { picks: BundledBrush[]; more: BundledBrush[] } {
  return { picks: set.picks.map(bundledBrush), more: set.more.map(bundledBrush) };
}
