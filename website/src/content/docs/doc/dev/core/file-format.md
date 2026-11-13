---
title: The .didi file
description: The .didi format, how Didi writes and reads it, and the file worker.
sidebar:
  order: 22
---

## Purpose

A `.didi` file holds one document: its size, its layers, their settings and their pixels. The format is a standard zip. Thus, any zip tool can open it, and any image editor can read its layers.

## Files

| File                               | Purpose                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `src/lib/core/file/didi-file.ts`   | Writes and reads `.didi` files. Flattens and makes thumbnails. |
| `src/lib/core/file/png.ts`         | Encodes and decodes PNG (see [PNG](/doc/dev/core/png/)).       |
| `src/lib/app/files/file-worker.ts` | Runs this work in a Web Worker.                                |
| `src/lib/app/files/files.ts`       | The calls to the worker, and to the platform for the bytes.    |

## Concepts

### Zip

A zip file is a container. It holds several named files. Each file can be compressed with **deflate**, or stored without compression. Didi uses the `fflate` library for zip and deflate.

### Contents of a .didi file

| Entry           | Contents                                          | Compression |
| --------------- | ------------------------------------------------- | ----------- |
| `mimetype`      | The text `application/x-didi`.                    | none        |
| `document.json` | Size, grid, active layer, layer list, extensions. | level 6     |
| `layers/1.png`… | One PNG for each layer, from bottom to top.       | none        |
| `thumbnail.png` | A small preview, a maximum of 256 pixels.         | none        |

`mimetype` is the first entry and it is not compressed. Thus, a program can identify the file from its first bytes. OpenDocument and EPUB files use the same method.

The PNG entries are already compressed. A second compression would take time and give almost no gain. Thus, the zip stores them as they are (`level: 0`).

### document.json

```json
{
  "format": "didi",
  "version": 1,
  "width": 64,
  "height": 64,
  "grid": { "width": 16, "height": 16, "shown": false },
  "activeLayer": 1,
  "layers": [
    {
      "name": "Background",
      "file": "layers/1.png",
      "visible": true,
      "locked": false,
      "alphaLocked": false,
      "opacity": 1,
      "blendMode": "normal"
    }
  ],
  "extensions": {}
}
```

`extensions` holds data of other modules. Didi keeps this data as it is, also when it does not know it. Thus, a newer module does not lose its data in an older version of the app.

### DocumentData

`DocumentData` is the document as plain data: numbers, strings and typed arrays. It has no class and no function. Thus, it can go to a Web Worker and back. The layers keep their tiles as a `TileSnapshot` (premultiplied, as in a layer).

- `documentFromEditor` makes a `DocumentData` from the editor. It does not copy the pixels: the snapshot shares the tiles.
- `editorFromDocument` makes a new editor from a `DocumentData`, with an empty history.

### Premultiplied and straight alpha

In memory, the layers use **premultiplied** alpha: each color channel is already multiplied by the alpha. This makes the compositing faster and correct at the edges. A PNG file uses **straight** alpha. Thus, `writeDidi` calls `unpremultiply` before the encoding, and `readDidi` calls `premultiply` after the decoding.

## How it works

### Write

`writeDidi(data, thumbnailPng)`:

1. Adds `mimetype`, not compressed.
2. For each layer, reads all its pixels from the tiles (`layerPixels`), converts them to straight alpha and encodes a PNG.
3. Writes `document.json`, with two spaces of indentation. Thus, a person can read it.
4. Adds the thumbnail.
5. Makes the zip with `zipSync`.

### Read

`readDidi(bytes)`:

1. Unzips the file.
2. Reads `document.json` and makes sure that `format` is `"didi"`.
3. Migrates the document to the current version (see below).
4. Makes sure that the size is a valid canvas size.
5. For each layer: reads its settings, decodes its PNG, makes sure that the PNG has the size of the document, and puts the pixels into tiles.
6. Reads the active layer, the grid and the extensions. A missing or incorrect value gets its default value.

Each error is a `DidiFileError` with a message for the user, for example "the layer file is missing".

### Versions and migrations

`DIDI_VERSION` is the current version. `MIGRATIONS[n]` converts version `n` to version `n + 1`. `migrate` applies them one after the other. Thus, a file of any older version becomes current. A file of a newer version gives an error: the app cannot know its new fields.

### Thumbnail

`thumbnail` makes the preview. First it flattens the visible layers (`flattenDocument`). Then it reduces the image with a **box filter**: each pixel of the preview is the average of the pixels that it covers.

The average uses the alpha as a weight. If not, the color of transparent pixels (often black) would make the edges dark.

```ts
// src/lib/core/file/didi-file.ts
r += full[i] * alpha;
// ...
out[o] = Math.round(r / a);
```

### The file worker

The encoding of a large document takes time: many PNGs and a zip. This work must not stop the interface. Thus, `file-worker.ts` runs it in a **Web Worker**, a second JavaScript thread.

The app talks to the worker with **Comlink**. Comlink makes a call to the worker look like a normal `async` function call.

```ts
// src/lib/app/files/files.ts
export async function saveDocument(path: string, doc: DocumentData): Promise<Uint8Array> {
  const { file, thumbnail } = await encodeDocument(doc);
  await writeFile(path, file);
  return thumbnail;
}
```

## Optimizations

- **Transfer, not copy.** A message to a worker normally copies its data. `Comlink.transfer` moves the `ArrayBuffer` instead: no copy, but the sender cannot use the buffer after. The worker transfers the file bytes and the tiles of a loaded document back to the app.
- **No second compression** of the PNG entries in the zip.
- **The thumbnail is computed one time.** The worker gives the same PNG to the file and to the list of recent files.
- **Shared tiles.** `documentFromEditor` does not copy pixels.

## Limits

- `writeDidi` and `readDidi` keep the full file in memory.
- Each layer PNG has the full size of the document, also when the layer is almost empty. The deflate compression makes the empty areas small.
