<script lang="ts">
  // The editor: the open document on the canvas, with the panels floating over it (see
  // EditorLayout for where they go), the title bar's menus and tool options, and the dialogs.
  // What it shows and acts on is in EditorState.
  import { onMount } from "svelte";
  import "#lib/app/styles/ui.css";
  import { scaledSize } from "#lib/app/layout/editor-layout.svelte.js";
  import { windowTitle } from "#lib/app/layout/window-title.svelte.js";
  import { errorMessage } from "#lib/app/shared/error-message.js";
  import { EditorState } from "#lib/app/state/editor-state.svelte.js";
  import { isSelectTool } from "#lib/app/tools/select-tool.js";
  import CanvasView from "#lib/app/ui/canvas/CanvasView.svelte";
  import CompactCorner from "#lib/app/ui/editor/CompactCorner.svelte";
  import EdgeTracks from "#lib/app/ui/editor/EdgeTracks.svelte";
  import EditorDialogs from "#lib/app/ui/editor/EditorDialogs.svelte";
  import MessageBar from "#lib/app/ui/editor/MessageBar.svelte";
  import PanelsTab from "#lib/app/ui/editor/PanelsTab.svelte";
  import SidePanels from "#lib/app/ui/editor/SidePanels.svelte";
  import DocumentInfo from "#lib/app/ui/panels/DocumentInfo.svelte";
  import ToolBar from "#lib/app/ui/panels/ToolBar.svelte";
  import PreviewPopin from "#lib/app/ui/preview/PreviewPopin.svelte";
  import LayoutMenu from "#lib/app/ui/shell/LayoutMenu.svelte";
  import MenuBar from "#lib/app/ui/shell/MenuBar.svelte";
  import type { Editor } from "#lib/core/editor/editor.js";
  import { m } from "#lib/paraglide/messages.js";
  import { capabilities } from "#lib/platform/capabilities.js";
  import { setFullScreen } from "#lib/platform/window.js";

  /** A document to start with (e.g. the stress test); a new one by default. */
  let { initial }: { initial?: Editor } = $props();

  // svelte-ignore state_referenced_locally
  const app = new EditorState(initial);
  const { session, layout, prefs, preview, dialogs, changes, tools, options, modeColors } = app;
  const editor = $derived(app.editor);
  const mode = $derived(app.mode);
  const shownTool = $derived(app.shownTool);
  const tip = (id: string) => app.tip(id);
  const run = (id: string, params?: unknown) => app.run(id, params);
  const enabled = (id: string, params?: unknown) => app.enabled(id, params);
  const shortcut = (id: string) => app.shortcut(id);
  /** Dialogs beside the canvas, and the preview, go away from the panels. */
  const awaySide = $derived(layout.panelsOnLeft ? "right" : "left");

  onMount(() => app.mount());

  // A new view for each document, fitted to the window, and when its size changes.
  const viewKey = $derived({ editor, resizes: changes.resizes });

  $effect(() => {
    windowTitle.menu = menuBar;
    windowTitle.end = null;
    // No name: the document's information shows it. Only the canvas: no options either.
    windowTitle.name = "";
    windowTitle.center = app.interfaceHidden ? null : toolBar;
    return () => {
      windowTitle.center = null;
      windowTitle.dimmed = false;
      windowTitle.name = "Didi";
      windowTitle.dirty = false;
      windowTitle.menu = null;
      windowTitle.end = null;
    };
  });

  let fileInput: HTMLInputElement;
  let paletteInput: HTMLInputElement;
  app.pickImages = () => fileInput.click();
  app.pickPalette = () => paletteInput.click();
</script>

<svelte:window onkeydown={(e) => app.onKeyDown(e)} onbeforeunload={(e) => app.onBeforeUnload(e)} />

<div
  class="app"
  class:panels-left={layout.panelsOnLeft}
  class:panels-closed={!layout.panelsOpen}
  class:sliding={layout.sliding}
  class:compact={layout.compact}
  class:interface-hidden={app.interfaceHidden}
  bind:clientWidth={layout.width}
  bind:clientHeight={layout.height}
  style:--panel-width={scaledSize(layout.panelWidth)}
  role="application"
  bind:this={layout.elements.app}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    e.preventDefault();
    app.importFiles(e.dataTransfer?.files ?? []);
  }}
>
  <div class="canvas">
    <!-- A new view for each document, fitted to the window, and when its size changes. -->
    {#key viewKey}
      <CanvasView
        bind:this={app.canvasView}
        {editor}
        painter={app.painter}
        brushCursor={(eraser) => tools.cursor(eraser)}
        brushColor={options.color}
        hoverCursor={(p, zoom) => tools.active.hover?.(editor, p, zoom) ?? null}
        selectionHandles={isSelectTool(tools.active)}
        pixelGrid={prefs.pixelGrid}
        tileGrid={session.grid.shown ? session.grid : null}
        touchRotation={mode.touchRotation}
        pixelZoom={mode.pixelZoom}
        fingerDraws={prefs.fingerDraws}
        onpen={() => prefs.notePen()}
        insets={() => layout.insets()}
        oncamera={(c) => (app.camera = c)}
        oncursor={(p) => (app.cursor = p)}
        oncommand={(id) => run(id)}
      />
    {/key}
  </div>

  <SidePanels
    {layout}
    {prefs}
    hidden={app.interfaceHidden}
    {editor}
    version={changes.version}
    color={options.color}
    secondary={options.secondary}
    recentColors={modeColors.recent(mode.id)}
    {mode}
    oncolor={(c) => {
      options.color = c;
    }}
    palettes={app.palettes}
    paletteVersion={app.paletteVersion}
    {tip}
    {shortcut}
    {run}
  />

  <PanelsTab
    compact={layout.compact}
    open={layout.panelsOpen}
    tab={layout.panelTab}
    left={layout.panelsOnLeft}
    sliding={layout.sliding}
    hidden={app.interfaceHidden}
    color={options.color}
    {tip}
    ontoggle={() => layout.togglePanels()}
    ontab={(tab) => layout.openTab(tab)}
    bind:element={layout.elements.panelsTab}
  />

  <EdgeTracks
    {layout}
    {prefs}
    hidden={app.interfaceHidden}
    tools={tools.inBar}
    active={shownTool.id}
    settings={options.tools}
    camera={app.camera}
    pixelGrid={prefs.pixelGrid}
    tileGrid={session.grid}
    ontilegrid={(grid) => session.setGrid(grid)}
    {tip}
    {run}
    menu={layoutMenu}
  />

  <!-- The document's information, in the bottom corner away from the panels. -->
  {#if !layout.compact}
    <div class="info">
      <DocumentInfo
        name={session.name}
        unsaved={session.unsaved}
        width={changes.canvasSize.width}
        height={changes.canvasSize.height}
        cursor={mode.showsCursorPixel ? app.cursor : undefined}
        corner={layout.panelsOnLeft ? "right" : "left"}
      />
    </div>
  {/if}

  <!-- Where the canvas starts below the title bar, which holds the tool's options. -->
  <div class="top" bind:this={layout.elements.top}></div>

  {#if preview.place === "in"}
    <PreviewPopin
      drawing={editor.drawing}
      side={awaySide}
      inset={layout.toolsEdge === "opposite" || (layout.navShown && layout.navEdge === "opposite")
        ? layout.trackWidth
        : 0}
      onPopOut={capabilities.windows ? () => (preview.place = "out") : null}
      onClose={() => (preview.place = "off")}
    />
  {/if}

  <!-- Messages float at the bottom. -->
  <MessageBar
    message={session.busy ?? app.error}
    error={!session.busy}
    left={layout.panelsOnLeft}
    sliding={layout.sliding}
    hidden={app.interfaceHidden}
    bind:element={layout.elements.bottom}
  />

  {#if layout.compact}
    <CompactCorner
      left={layout.panelsOnLeft}
      sliding={layout.sliding}
      hidden={app.interfaceHidden}
      {tip}
      {enabled}
      {run}
      actions={selectionActions}
    />
  {/if}

  <input
    bind:this={paletteInput}
    type="file"
    accept=".hex"
    hidden
    onchange={(e) => {
      const file = e.currentTarget.files?.[0];
      if (file) {
        app.importPalette(file);
      }
      e.currentTarget.value = "";
    }}
  />
  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    multiple
    hidden
    onchange={(e) => {
      app.importFiles(e.currentTarget.files ?? []);
      e.currentTarget.value = "";
    }}
  />
</div>

{#snippet toolBar()}
  <ToolBar
    tool={shownTool}
    settings={options.tools[shownTool.id]}
    preview={app.toolPreview}
    compact={layout.compact}
    actions={selectionActions}
    onlacking={(pixels) => (layout.toolbarLacking = pixels)}
  />
{/snippet}

{#snippet selectionActions()}
  {#if enabled("selection.deselect")}
    <button title={tip("selection.deselect")} onclick={() => run("selection.deselect")}>
      {m.editor_deselect()}
    </button>
  {/if}
{/snippet}

{#snippet layoutMenu(side: "left" | "right")}
  <LayoutMenu
    modes={app.modes.list()}
    mode={mode.id}
    {side}
    disabled={dialogs.anyOpen}
    {tip}
    {run}
    preview={preview.place !== "off"}
    onPreview={(open) => (preview.place = open ? "in" : "off")}
    fullScreen={app.fullScreen}
    onFullScreen={(on) =>
      void setFullScreen(on).catch((e) =>
        app.notify(m.app_full_screen_failed({ error: errorMessage(e) })),
      )}
  />
{/snippet}

{#snippet menuBar()}
  <MenuBar
    menus={app.menus}
    collapsed={layout.compact || layout.menusShort}
    disabled={dialogs.anyOpen}
    title={(id) => editor.commands.get(id)?.title ?? id}
    {shortcut}
    {enabled}
    checked={(id) => editor.commands.isChecked(id)}
    {run}
  />
{/snippet}

<EditorDialogs
  {dialogs}
  {editor}
  {session}
  keymap={app.keymap}
  {prefs}
  modes={app.modes}
  {mode}
  touchScreen={layout.touchScreen}
  canvasSize={changes.canvasSize}
  canvasView={app.canvasView}
  side={awaySide}
  {tip}
  {run}
  onchoosenew={(...choice) => app.previewNew(...choice)}
/>

<style>
  /* The canvas fills the window, under the title bar too (which holds the tool's options);
     the panels float over it, inset from the edges: a column of panels on one side, the whole
     height (on the left for right-handed users, on the right for left-handed ones,
     resizable), the tools in a thin column beside it, the view's buttons in another against
     the other edge, and the document's information in the bottom corner below them. */
  .app {
    position: relative;
    height: calc(100% + var(--titlebar-height));
    margin-top: calc(-1 * var(--titlebar-height));
    overflow: hidden;
    --panel-width: calc(200px * var(--ui-scale));
    /* One button, with its padding and border. */
    --tool-column-width: calc(var(--control-height) + var(--space) + 2px);
    /* Below the title bar. */
    --top-inset: calc(var(--titlebar-height) + var(--space));
    /* Where the panels and the tools start. */
    --content-top: var(--top-inset);
    /* Like the title bar. */
    --bar-height: calc(var(--control-height) + var(--space));
    /* The panels' tab above the tools: one button, two when compact. */
    --tabs-height: var(--bar-height);
    /* Taken by the panels' column from the window's edge, with its gutter: none if closed. */
    --column-space: calc(var(--panel-width) + var(--space));
  }

  .panels-closed {
    --column-space: 0px;
  }

  /* Two buttons in the panels' tab, padded like the tools below. */
  .compact {
    --tabs-height: calc(2 * var(--control-height) + var(--space) + 4px);
  }

  .canvas {
    position: absolute;
    inset: 0;
  }

  /* Empty: the canvas's top inset, below the title bar. */
  .top {
    position: absolute;
    top: var(--titlebar-height);
    height: 0;
  }

  /* In the bottom corner, below the view's column; at most half the window. */
  .info {
    position: absolute;
    bottom: var(--space);
    left: var(--space);
    display: flex;
    max-width: 50%;
    pointer-events: none;
  }

  .panels-left .info {
    left: auto;
    right: var(--space);
    justify-content: flex-end;
  }

  /* Only the canvas (Tab): the panels, the tools and the bars go (each part hides itself). */
  .interface-hidden .info {
    visibility: hidden;
  }

  /* Opening or closing: everything beside the column follows it. */
  .sliding .top {
    transition:
      transform 0.2s ease,
      visibility 0.2s,
      left 0.2s ease,
      right 0.2s ease;
  }
</style>
