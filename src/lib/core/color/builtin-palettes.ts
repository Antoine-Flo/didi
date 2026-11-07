// Well-known game art palettes, offered with the app. Colors as on Lospec.

import { fromHex } from "./color";
import type { Palette } from "./palette";

const palette = (name: string, hex: string): Palette => ({
  name,
  colors: hex.split(" ").map((h) => fromHex(h)!),
});

export const BUILTIN_PALETTES: readonly Palette[] = [
  palette(
    "PICO-8",
    "000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 " +
      "ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa",
  ),
  palette(
    "Sweetie 16",
    "1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 " +
      "29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57",
  ),
  palette(
    "DawnBringer 16",
    "140c1c 442434 30346d 4e4a4e 854c30 346524 d04648 757161 " +
      "597dce d27d2c 8595a1 6daa2c d2aa99 6dc2ca dad45e deeed6",
  ),
  palette(
    "DawnBringer 32",
    "000000 222034 45283c 663931 8f563b df7126 d9a066 eec39a " +
      "fbf236 99e550 6abe30 37946e 4b692f 524b24 323c39 3f3f74 " +
      "306082 5b6ee1 639bff 5fcde4 cbdbfc ffffff 9badb7 847e87 " +
      "696a6a 595652 76428a ac3232 d95763 d77bba 8f974a 8a6f30",
  ),
  palette(
    "Endesga 32",
    "be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 " +
      "e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e " +
      "124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 " +
      "262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569",
  ),
  palette(
    "Commodore 64",
    "000000 ffffff 68372b 70a4b2 6f3d86 588d43 352879 b8c76f " +
      "6f4f25 433900 9a6759 444444 6c6c6c 9ad284 6c5eb5 959595",
  ),
  palette("Game Boy", "0f380f 306230 8bac0f 9bbc0f"),
  palette("Nyx8", "08141e 0f2a3f 20394f f6d6bd c3a38a 997577 816271 4e495f"),
  palette("SLSO8", "0d2b45 203c56 544e68 8d697a d08159 ffaa5e ffd4a3 ffecd6"),
  palette("Ammo-8", "040c06 112318 1e3a29 305d42 4d8061 89a257 bedc7f eeffcc"),
  palette("Oil 6", "fbf5ef f2d3ab c69fa5 8b6d9c 494d7e 272744"),
  palette("Twilight 5", "fbbbad ee8695 4a7a96 333f58 292831"),
];
