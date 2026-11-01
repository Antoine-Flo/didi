// Small PNGs in various formats, made with Python's PIL, and the RGBA pixels PIL reads
// from them: references for the decoder tests (see png.test.ts).

export const PNG_FIXTURES: Record<string, { png: string; w: number; h: number; rgba: number[] }> = {
  rgba8: {
    png: "iVBORw0KGgoAAAANSUhEUgAAAAUAAAADCAYAAABbNsX4AAAANUlEQVR4nC3IMQHAIAwAsByIqYiJ6I2SfQVPE4aD8ixnYD30S3+sQw9TEYhNFGGY/sgikfsCqPYLysggBCYAAAAASUVORK5CYII=",
    w: 5,
    h: 3,
    rgba: [
      0, 0, 0, 128, 60, 0, 0, 255, 120, 0, 0, 255, 180, 0, 0, 128, 240, 0, 0, 255, 0, 90, 0, 255,
      60, 90, 40, 255, 120, 90, 80, 128, 180, 90, 120, 255, 240, 90, 160, 255, 0, 180, 0, 255, 60,
      180, 80, 128, 120, 180, 160, 255, 180, 180, 240, 255, 240, 180, 64, 128,
    ],
  },
  rgb8: {
    png: "iVBORw0KGgoAAAANSUhEUgAAAAUAAAADCAIAAADUVFKvAAAAG0lEQVR4nGNkYGCwQUIsDFEMDAwacATnB0AQAEhgA2YH8tNBAAAAAElFTkSuQmCC",
    w: 5,
    h: 3,
    rgba: [
      0, 0, 0, 255, 60, 0, 0, 255, 120, 0, 0, 255, 180, 0, 0, 255, 240, 0, 0, 255, 0, 90, 0, 255,
      60, 90, 40, 255, 120, 90, 80, 255, 180, 90, 120, 255, 240, 90, 160, 255, 0, 180, 0, 255, 60,
      180, 80, 255, 120, 180, 160, 255, 180, 180, 240, 255, 240, 180, 64, 255,
    ],
  },
  gray8: {
    png: "iVBORw0KGgoAAAANSUhEUgAAAAUAAAADCAAAAAB+XZokAAAAGklEQVR4nGNkEBISEmI0FRMXE2cxlZaW/gcADJkCYj/B6JYAAAAASUVORK5CYII=",
    w: 5,
    h: 3,
    rgba: [
      0, 0, 0, 255, 18, 18, 18, 255, 36, 36, 36, 255, 54, 54, 54, 255, 72, 72, 72, 255, 53, 53, 53,
      255, 75, 75, 75, 255, 98, 98, 98, 255, 120, 120, 120, 255, 143, 143, 143, 255, 106, 106, 106,
      255, 133, 133, 133, 255, 160, 160, 160, 255, 187, 187, 187, 255, 185, 185, 185, 255,
    ],
  },
  graya8: {
    png: "iVBORw0KGgoAAAANSUhEUgAAAAUAAAADCAQAAADxPw1zAAAAKUlEQVR4nGNgaBD6r/LfrMHjP6PpfzEG8UaxenEGFlMG6UbpemmGf40AtrgKSvyj8CoAAAAASUVORK5CYII=",
    w: 5,
    h: 3,
    rgba: [
      0, 0, 0, 128, 18, 18, 18, 255, 36, 36, 36, 255, 54, 54, 54, 128, 72, 72, 72, 255, 53, 53, 53,
      255, 75, 75, 75, 255, 98, 98, 98, 128, 120, 120, 120, 255, 143, 143, 143, 255, 106, 106, 106,
      255, 133, 133, 133, 128, 160, 160, 160, 255, 187, 187, 187, 255, 185, 185, 185, 128,
    ],
  },
  palette8: {
    png: "iVBORw0KGgoAAAANSUhEUgAAAAUAAAADBAMAAACpGNjLAAAAFVBMVEW0tJvSWox4WlAetCgeWhS0AAAeAABplGuBAAAAFElEQVR4nGNICw1gcFEUYDBmYAAADhsBtEDz29oAAAAASUVORK5CYII=",
    w: 5,
    h: 3,
    rgba: [
      30, 0, 0, 255, 30, 0, 0, 255, 180, 0, 0, 255, 180, 0, 0, 255, 180, 0, 0, 255, 30, 90, 20, 255,
      30, 90, 20, 255, 120, 90, 80, 255, 210, 90, 140, 255, 210, 90, 140, 255, 30, 180, 40, 255, 30,
      180, 40, 255, 180, 180, 155, 255, 180, 180, 155, 255, 180, 180, 155, 255,
    ],
  },
  palette2bit: {
    png: "iVBORw0KGgoAAAANSUhEUgAAAAUAAAADAgMAAAAmWC1rAAAADFBMVEW0tJu0Wngehx54AABKz93sAAAAEUlEQVR4nGP4f4BhqQPDAgYAEroDRU2aEA4AAAAASUVORK5CYII=",
    w: 5,
    h: 3,
    rgba: [
      120, 0, 0, 255, 120, 0, 0, 255, 120, 0, 0, 255, 120, 0, 0, 255, 120, 0, 0, 255, 30, 135, 30,
      255, 30, 135, 30, 255, 180, 90, 120, 255, 180, 90, 120, 255, 180, 90, 120, 255, 30, 135, 30,
      255, 30, 135, 30, 255, 180, 180, 155, 255, 180, 180, 155, 255, 180, 180, 155, 255,
    ],
  },
  gray16: {
    png: "iVBORw0KGgoAAAANSUhEUgAAAAUAAAADEAAAAAAuzUZnAAAAHElEQVR4nGPg4jpxQk7u/38GBkYEYGFlhTCiowFsZgS0BJf3owAAAABJRU5ErkJggg==",
    w: 5,
    h: 3,
    rgba: [
      10, 10, 10, 255, 200, 200, 200, 255, 30, 30, 30, 255, 255, 255, 255, 255, 0, 0, 0, 255, 1, 1,
      1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255, 5, 5, 5, 255, 6, 6, 6, 255, 7, 7, 7, 255, 8,
      8, 8, 255, 9, 9, 9, 255, 100, 100, 100, 255,
    ],
  },
  gray1: {
    png: "iVBORw0KGgoAAAANSUhEUgAAAAUAAAADAQAAAABzTfhVAAAADklEQVR4nGPYwMTAxAAAA4IAtab2pMsAAAAASUVORK5CYII=",
    w: 5,
    h: 3,
    rgba: [
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255,
      255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255,
      255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    ],
  },
  rgb_trns: {
    png: "iVBORw0KGgoAAAANSUhEUgAAAAUAAAADCAIAAADUVFKvAAAABnRSTlMAAAAAAABupgeRAAAAG0lEQVR4nGNkYGCwQUIsDFEMDAwacATnB0AQAEhgA2YH8tNBAAAAAElFTkSuQmCC",
    w: 5,
    h: 3,
    rgba: [
      0, 0, 0, 0, 60, 0, 0, 255, 120, 0, 0, 255, 180, 0, 0, 255, 240, 0, 0, 255, 0, 90, 0, 255, 60,
      90, 40, 255, 120, 90, 80, 255, 180, 90, 120, 255, 240, 90, 160, 255, 0, 180, 0, 255, 60, 180,
      80, 255, 120, 180, 160, 255, 180, 180, 240, 255, 240, 180, 64, 255,
    ],
  },
};
