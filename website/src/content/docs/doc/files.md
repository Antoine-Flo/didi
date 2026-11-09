---
title: Files
description: The .didi format, export and recovery.
---

## The .didi format

A `.didi` file keeps everything: the layers, the mode, the canvas size, the tile grid. It is a zip file: any zip tool opens it, and each layer is a standard PNG inside, so a layer can be edited in another app.

## Export and import

- **Export PNG…** (**Ctrl+Shift+E**) saves the visible image as a PNG.
- **Import image…** (**Ctrl+I**) adds an image to the document.

## Recovery after a crash

In the desktop app, Didi keeps a copy of your work a few seconds after each change, separate from your file. If the app closes unexpectedly, the start screen offers to recover it. The copy is deleted when you save or close normally.

The undo history is not kept: after a recovery, you start from the recovered drawing.
