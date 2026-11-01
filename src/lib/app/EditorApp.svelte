<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import {
    Brush,
    Compass,
    Eraser,
    Grid2x2,
    ImagePlus,
    Pipette,
    Maximize,
    Redo2,
    RotateCcw,
    RotateCw,
    Undo2,
    ZoomIn,
    ZoomOut,
  } from "@lucide/svelte";
  import CanvasView, { type BrushCursor, type ViewStats } from "$lib/app/CanvasView.svelte";
  import { Painter } from "$lib/app/painter";
  import { brushGroups, bundledBrush } from "$lib/mypaint/brushes";
  import { loadMyPaint } from "$lib/mypaint/engine";
  import {
    sizeFromSlider,
    sliderFromSize,
    defaultToolOptions,
    fromHex,
    toHex,
    type ToolId,
  } from "$lib/app/tools";
  import LayersPanel from "$lib/app/LayersPanel.svelte";
  import { decodeImage, importImage } from "$lib/app/import-image";
  import { isTyping } from "$lib/app/keyboard";
  import type { Editor } from "$lib/core/editor";
  import type { Camera, Point } from "$lib/render/camera";

  let { editor }: { editor: Editor } = $props();

  let tool = $state<ToolId>("brush");
  let options = $state(defaultToolOptions());
  const painter = $derived(
    new Painter(editor, {
      tool: () => tool,
      options: () => $state.snapshot(options),
      onPick: (color) => (options.color = color),
      onMessage: (message) => {
        error = message;
        setTimeout(() => {
          if (error === message) error = null;
        }, 4000);
      },
    }),
  );

  const TOOLS: { id: ToolId; title: string; key: string }[] = [
    { id: "brush", title: "Pinceau", key: "B" },
    { id: "eraser", title: "Gomme", key: "E" },
    { id: "pixel", title: "Pinceau pixel", key: "P" },
    { id: "picker", title: "Pipette", key: "I" },
  ];

  function brushCursor(eraser: boolean): BrushCursor {
    if (eraser || tool === "eraser") return { kind: "circle", size: options.eraser.size };
    if (tool === "brush") return { kind: "circle", size: options.brush.size };
    if (tool === "pixel") return { kind: "square", size: options.pixel.size };
    return { kind: "none" };
  }

  /** Multiplies the current tool's size (bracket keys). */
  function resize(factor: number) {
    // Through the slider mapping, which also rounds sensibly for small and large sizes.
    const scale = (v: number) => sizeFromSlider(sliderFromSize(v * factor));
    if (tool === "brush") options.brush.size = scale(options.brush.size);
    if (tool === "eraser") options.eraser.size = scale(options.eraser.size);
    if (tool === "pixel") {
      const step = factor > 1 ? 1 : -1;
      options.pixel.size = Math.min(64, Math.max(1, options.pixel.size + step));
    }
  }

  // Bumped on every change, so the UI re-reads the editor.
  let version = $state(0);
  let camera = $state<Camera>({ x: 0, y: 0, zoom: 1, rotation: 0 });
  let cursor = $state<Point | null>(null);
  let error = $state<string | null>(null);
  let stats = $state<ViewStats | null>(null);
  let canvasView: CanvasView;
  let fileInput: HTMLInputElement;

  const canUndo = $derived.by(() => (void version, editor.history.canUndo));
  const canRedo = $derived.by(() => (void version, editor.history.canRedo));
  /** CPU memory of layer pixels and of the history (estimate, tiles can be shared). */
  const memory = $derived.by(() => {
    void version;
    const pixels = editor.drawing.layers.reduce((sum, l) => sum + l.tiles.memoryBytes, 0);
    return { pixels, history: editor.history.bytes };
  });
  const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} Mo`;

  onMount(() => {
    loadMyPaint()
      .then((engine) => painter.setEngine(engine))
      .catch(
        (e) => (error = `Moteur de pinceau indisponible : ${e instanceof Error ? e.message : e}`),
      );
    const bump = () => version++;
    const unsubscribe = [
      editor.drawing.subscribe(bump),
      editor.history.subscribe(bump),
      editor.onActiveLayerChange(bump),
    ];
    return () => unsubscribe.forEach((fn) => fn());
  });

  async function importFiles(files: FileList | null | undefined) {
    for (const file of files ?? []) {
      if (!file.type.startsWith("image/")) continue;
      try {
        importImage(editor, await decodeImage(file), file.name.replace(/\.[^.]+$/, ""));
      } catch (e) {
        error = `Impossible d'importer ${file.name} : ${e instanceof Error ? e.message : e}`;
      }
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isTyping(e)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    // Nothing may change the drawing in the middle of a stroke.
    if (painter.active) return;
    let handled = true;
    if (ctrl && key === "z" && !e.shiftKey) editor.commands.execute("history.undo");
    else if (ctrl && (key === "y" || (key === "z" && e.shiftKey)))
      editor.commands.execute("history.redo");
    else if (ctrl) handled = false;
    else if (key === "0") canvasView.fitView();
    else if (key === "1") canvasView.zoomTo(1);
    else if (key === "+" || key === "=") canvasView.zoomBy(1.25);
    else if (key === "-") canvasView.zoomBy(0.8);
    else if (key === "4") canvasView.rotateBy(-Math.PI / 12);
    else if (key === "6") canvasView.rotateBy(Math.PI / 12);
    else if (key === "5") canvasView.resetRotation();
    else if (key === "b") tool = "brush";
    else if (key === "e") tool = "eraser";
    else if (key === "p") tool = "pixel";
    else if (key === "i") tool = "picker";
    else if (key === "[") resize(0.8);
    else if (key === "]") resize(1.25);
    else handled = false;
    if (handled) e.preventDefault();
  }

  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
</script>

<svelte:window onkeydown={onKeyDown} />

<div
  class="app"
  role="application"
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    e.preventDefault();
    importFiles(e.dataTransfer?.files);
  }}
>
  <header>
    <button class="icon" title="Importer une image" onclick={() => fileInput.click()}>
      <ImagePlus size={18} />
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      multiple
      hidden
      onchange={(e) => {
        importFiles(e.currentTarget.files);
        e.currentTarget.value = "";
      }}
    />
    <span class="sep"></span>
    <button
      class="icon"
      title="Annuler (Ctrl+Z)"
      disabled={!canUndo}
      onclick={() => editor.commands.execute("history.undo")}
    >
      <Undo2 size={18} />
    </button>
    <button
      class="icon"
      title="Rétablir (Ctrl+Maj+Z)"
      disabled={!canRedo}
      onclick={() => editor.commands.execute("history.redo")}
    >
      <Redo2 size={18} />
    </button>
    <span class="sep"></span>
    <button class="icon" title="Zoom avant (+)" onclick={() => canvasView.zoomBy(1.25)}>
      <ZoomIn size={18} />
    </button>
    <button class="icon" title="Zoom arrière (-)" onclick={() => canvasView.zoomBy(0.8)}>
      <ZoomOut size={18} />
    </button>
    <button class="icon" title="Ajuster à la fenêtre (0)" onclick={() => canvasView.fitView()}>
      <Maximize size={18} />
    </button>
    <span class="sep"></span>
    <button
      class="icon"
      title="Tourner à gauche (4)"
      onclick={() => canvasView.rotateBy(-Math.PI / 12)}
    >
      <RotateCcw size={18} />
    </button>
    <button
      class="icon"
      title="Tourner à droite (6)"
      onclick={() => canvasView.rotateBy(Math.PI / 12)}
    >
      <RotateCw size={18} />
    </button>
    <button class="icon" title="Remettre droit (5)" onclick={() => canvasView.resetRotation()}>
      <Compass size={18} />
    </button>
  </header>

  <nav>
    {#each TOOLS as t (t.id)}
      <button
        class="icon"
        class:active={tool === t.id}
        title="{t.title} ({t.key})"
        onclick={() => (tool = t.id)}
      >
        {#if t.id === "brush"}<Brush size={18} />
        {:else if t.id === "eraser"}<Eraser size={18} />
        {:else if t.id === "pixel"}<Grid2x2 size={18} />
        {:else}<Pipette size={18} />{/if}
      </button>
    {/each}
    <span class="sep"></span>
    <input
      type="color"
      title="Couleur"
      value={toHex(options.color)}
      oninput={(e) => {
        const color = fromHex(e.currentTarget.value);
        if (color) options.color = color;
      }}
    />
    <span class="sep"></span>
    {#if tool === "brush" || tool === "eraser"}
      {@const settings = tool === "brush" ? options.brush : options.eraser}
      <select
        title="Pinceau"
        value={settings.preset}
        onchange={(e) => {
          // Each brush starts at the size it was designed for.
          settings.preset = e.currentTarget.value;
          settings.size = bundledBrush(settings.preset).nativeSize;
        }}
      >
        {#each brushGroups(tool === "eraser") as group (group.label)}
          <optgroup label={group.label}>
            {#each group.brushes as b (b.id)}
              <option value={b.id}>{b.name}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <label>
        Taille
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={sliderFromSize(settings.size)}
          oninput={(e) => (settings.size = sizeFromSlider(Number(e.currentTarget.value)))}
        />
        {settings.size} px
      </label>
      <label>
        Opacité <input type="range" min="0" max="1" step="0.01" bind:value={settings.opacity} />
        {Math.round(settings.opacity * 100)} %
      </label>
    {:else if tool === "pixel"}
      <label
        >Taille <input type="range" min="1" max="64" bind:value={options.pixel.size} />
        {options.pixel.size} px</label
      >
      <label
        >Opacité <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={options.pixel.opacity}
        />
        {Math.round(options.pixel.opacity * 100)} %</label
      >
      <label title="Retire les coins en L (pinceau de 1 px)">
        <input type="checkbox" bind:checked={options.pixel.pixelPerfect} /> Pixel-perfect
      </label>
    {:else}
      <span class="hint">Cliquez sur la toile pour prendre une couleur.</span>
    {/if}
  </nav>

  <main>
    <CanvasView
      bind:this={canvasView}
      {editor}
      {painter}
      {brushCursor}
      oncamera={(c) => (camera = c)}
      oncursor={(p) => (cursor = p)}
      onstats={(s) => (stats = s)}
    />
  </main>

  <aside>
    <LayersPanel {editor} {version} />
  </aside>

  <footer>
    <span>{editor.drawing.width} × {editor.drawing.height}</span>
    <span>{Math.round(camera.zoom * 100)} %</span>
    <span>{degrees(camera.rotation)}°</span>
    <span>{cursor ? `${cursor.x}, ${cursor.y}` : ""}</span>
    {#if stats}
      <span title="Images par seconde">{Math.round(stats.fps)} fps</span>
      <span title="Tuiles affichées sur le GPU">{stats.tiles} tuiles</span>
    {/if}
    <span title="Mémoire des pixels / de l'historique (estimation)">
      {mb(memory.pixels)} · hist. {mb(memory.history)}
    </span>
    {#if error}<span class="error">{error}</span>{/if}
    <a href={resolve("/lab")}>Lab</a>
  </footer>
</div>

<style>
  :global(html) {
    /* Native controls (menus, sliders, checkboxes) follow the dark theme. */
    color-scheme: dark;
  }

  :global(html, body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
    background: #1e1e1e;
    color: #ccc;
    font:
      13px/1.4 system-ui,
      sans-serif;
  }

  :global(button) {
    background: none;
    color: inherit;
    border: none;
    padding: 4px 6px;
    cursor: pointer;
    font: inherit;
  }

  :global(button:hover:not(:disabled)) {
    background: #ffffff1a;
  }

  :global(button:disabled) {
    opacity: 0.35;
    cursor: default;
  }

  :global(button.icon) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  :global(input, select) {
    font: inherit;
    color: inherit;
    background: #2b2b2b;
    border: 1px solid #444;
  }

  .app {
    display: grid;
    grid-template-columns: 1fr 240px;
    grid-template-rows: auto auto 1fr auto;
    height: 100vh;
  }

  nav {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 12px;
    padding: 2px 4px;
    border-bottom: 1px solid #333;
  }

  nav label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  nav input[type="range"] {
    width: 90px;
  }

  nav input[type="color"] {
    width: 32px;
    height: 24px;
    padding: 0;
  }

  :global(button.active) {
    background: #3a4a66;
  }

  .hint {
    color: #888;
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    border-bottom: 1px solid #333;
  }

  .sep {
    width: 1px;
    height: 18px;
    margin: 0 4px;
    background: #444;
  }

  main {
    min-width: 0;
    min-height: 0;
  }

  aside {
    padding: 6px;
    overflow-y: auto;
    border-left: 1px solid #333;
  }

  footer {
    grid-column: 1 / -1;
    display: flex;
    gap: 16px;
    padding: 2px 8px;
    border-top: 1px solid #333;
    font-size: 12px;
    color: #999;
    font-variant-numeric: tabular-nums;
  }

  footer a {
    margin-left: auto;
    color: #999;
  }

  .error {
    color: #e77;
  }
</style>
