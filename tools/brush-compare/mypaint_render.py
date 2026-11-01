"""Renders a brush stroke with MyPaint's own code, as a reference for Didi's engine.

Usage: python3 -I mypaint_render.py cases.json output_dir

Requires MyPaint installed as a system package (its Python library in /usr/lib64/mypaint).
Each case gives the brush, color, size, background (optionally a second color for the
right half) and the stroke events. For case i, writes output_dir/i.rgba: the raw
premultiplied RGBA, 8 bits per channel, width x height, converted from MyPaint's 15-bit
tiles the same way Didi does (round(v * 255 / 32768)).
"""

import colorsys
import json
import math
import sys

sys.path.insert(0, "/usr/lib64/mypaint")

import numpy as np  # noqa: E402

from lib import brush, eotf, tiledsurface  # noqa: E402

N = 64  # MyPaint tile size
ONE = 1 << 15


def main(cases_path, output_dir):
    with open(cases_path) as f:
        cases = json.load(f)
    for i, case in enumerate(cases):
        render(case, f"{output_dir}/{i}.rgba")


def render(case, output_path):
    width, height = case["width"], case["height"]

    # 1.0: MyPaint's "1.x" compatibility mode, in sRGB like Didi. 2.2: its default "2.x".
    eotf.set_eotf(float(case.get("eotf", 1.0)))

    surface = tiledsurface.MyPaintSurface()
    background = case.get("background")
    if background:
        right = case.get("backgroundRight", background)
        for ty in range(math.ceil(height / N)):
            for tx in range(math.ceil(width / N)):
                with surface.tile_request(tx, ty, readonly=False) as rgba:
                    for x in range(N):
                        color = background if tx * N + x < width // 2 else right
                        for c in range(4):
                            rgba[:, x, c] = round(color[c] * ONE / 255)

    with open(case["brushFile"]) as f:
        info = brush.BrushInfo()
        info.from_json(f.read())
    r, g, b = (c / 255 for c in case["color"])
    info.set_color_hsv(colorsys.rgb_to_hsv(r, g, b))
    if case.get("size"):
        info.set_base_value("radius_logarithmic", math.log(case["size"] / 2))
    stroke_brush = brush.Brush(info)

    surface.begin_atomic()
    for dtime, x, y, pressure, xtilt, ytilt, viewzoom, viewrotation in case["events"]:
        stroke_brush.stroke_to(
            surface.backend, x, y, pressure, xtilt, ytilt, dtime, viewzoom, viewrotation, 0.0
        )
    surface.end_atomic()

    out = np.zeros((height, width, 4), dtype=np.uint8)
    for ty in range(math.ceil(height / N)):
        for tx in range(math.ceil(width / N)):
            with surface.tile_request(tx, ty, readonly=True) as rgba:
                tile = np.round(rgba.astype(np.float64) * 255 / ONE).clip(0, 255)
                y0, x0 = ty * N, tx * N
                h, w = min(N, height - y0), min(N, width - x0)
                out[y0 : y0 + h, x0 : x0 + w] = tile[:h, :w]
    with open(output_path, "wb") as f:
        f.write(out.tobytes())


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
