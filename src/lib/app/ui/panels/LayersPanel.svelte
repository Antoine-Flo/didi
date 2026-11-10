<script lang="ts">
  // The layers: the active layer's settings at the top, then the add button and the layer
  // menu (like the palette's header); then one row per layer, top layer first, with its visibility, preview, name,
  // transparency lock and lock. Rows are dragged to reorder; a right click opens the layer
  // menu for that layer.

  import { Plus } from "@lucide/svelte";
  import { ContextMenu, DropdownMenu } from "bits-ui";
  import { onDestroy, untrack } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/shared/dismissal.js";
  import PanelMenu from "#lib/app/ui/widgets/PanelMenu.svelte";
  import Select from "#lib/app/ui/widgets/Select.svelte";
  import Slider from "#lib/app/ui/widgets/Slider.svelte";
  import LayerRow from "#lib/app/ui/panels/LayerRow.svelte";
  import type { Editor } from "#lib/core/editor/editor.js";
  import type { EditorChanges } from "#lib/app/state/editor-changes.svelte.js";
  import { BLEND_MODES, type BlendMode, type LayerProps } from "#lib/core/document/layer.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    editor,
    changes,
    tip,
    shortcut,
    run,
  }: {
    editor: Editor;
    /** The document, read by the panel. */
    changes: EditorChanges;
    /** Tooltip of a command, with its shortcut. */
    tip: (command: string) => string;
    /** A command's first shortcut, e.g. "Ctrl+J", if it has one. */
    shortcut: (command: string) => string | undefined;
    /** Runs a command (unless a stroke is in progress). */
    run: (command: string, params?: unknown) => void;
  } = $props();

  /** The layer menu, in groups: commands, and "rename", which edits the name in its row. */
  const MENU: string[][] = [
    ["layer.add", "layer.duplicate", "rename", "layer.remove"],
    ["layer.moveUp", "layer.moveDown"],
    ["layer.mergeDown", "layer.flatten"],
    ["layer.clear", "layer.flipHorizontal", "layer.flipVertical"],
    ["selection.layerContent"],
  ];

  const BLEND_LABELS: Record<BlendMode, () => string> = {
    normal: m.layers_blend_normal,
    screen: m.layers_blend_screen,
    add: m.layers_blend_add,
  };

  // Top layer first, like every drawing app.
  const layers = $derived.by(() => {
    const activeId = changes.activeLayer?.id;
    return [...changes.layers].reverse().map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      alphaLocked: l.alphaLocked,
      tiles: l.tiles,
      active: l.id === activeId,
    }));
  });

  const active = $derived.by(() => {
    const layer = changes.activeLayer;
    if (!layer) {
      return null;
    }
    return { id: layer.id, opacity: layer.opacity, blendMode: layer.blendMode };
  });

  // Previews follow pixel changes, but only when the panel refreshes: not on every frame of
  // a stroke. Changed layers are noted as they change, and redrawn on the next other change
  // (the stroke ending in the history).
  let stamps = $state<Record<string, number>>({});
  // Not reactive on purpose: a stroke changes it on every frame.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const changed = new Set<string>();
  $effect(() =>
    editor.drawing.subscribe((change) => {
      if (change.type === "pixels-changed") {
        changed.add(change.id);
      }
      if (change.type === "canvas-resized") {
        for (const l of editor.drawing.layers) {
          changed.add(l.id);
        }
      }
    }),
  );
  $effect(() => {
    changes.track();
    untrack(() => {
      for (const id of changed) {
        stamps[id] = (stamps[id] ?? 0) + 1;
      }
      changed.clear();
    });
  });

  function enabled(command: string): boolean {
    changes.track();
    return editor.commands.isEnabled(command);
  }

  function update(id: string, changes: Partial<LayerProps>) {
    run("layer.update", { id, changes });
  }

  // Double-click on a name, or "Rename layer" in the menu, to rename the layer.
  let renaming = $state<string | null>(null);
  function rename(id: string, input: HTMLInputElement) {
    if (renaming !== id) {
      return;
    }
    renaming = null;
    const name = input.value.trim();
    if (name) {
      update(id, { name });
    }
  }

  /** "Rename layer": the name's field keeps the focus, instead of the menu's button. */
  function onCloseAutoFocus(e: Event) {
    if (renaming) {
      e.preventDefault();
    }
  }

  // While the right-click menu is open, a click on the canvas only closes it.
  let contextOpen = false;
  function setContextOpen(next: boolean) {
    if (next === contextOpen) {
      return;
    }
    contextOpen = next;
    if (next) {
      popupOpened();
    } else {
      popupClosed();
    }
  }
  // Removed while open: the canvas must not stay blocked.
  onDestroy(() => setContextOpen(false));

  // Dragging the opacity slider makes one undo step.
  let dragging = false;
  function startOpacity() {
    if (dragging) {
      return;
    }
    dragging = true;
    editor.history.begin(m.layers_opacity_history());
  }
  function endOpacity() {
    if (!dragging) {
      return;
    }
    dragging = false;
    editor.history.end();
  }

  // Reordering: a row dragged up or down by more than a few pixels moves its layer where
  // it is dropped. Rows are in display order (top layer first).
  const DRAG_THRESHOLD = 4;
  const rows: HTMLLIElement[] = $state([]);
  let drag = $state<{ id: string; from: number; startY: number; moved: boolean } | null>(null);
  /** Where the layer would go, as a gap between rows: 0 above the first, n below the last. */
  let drop = $state<number | null>(null);

  function startDrag(e: PointerEvent, id: string, position: number) {
    if (e.button !== 0 || renaming !== null) {
      return;
    }
    drag = { id, from: position, startY: e.clientY, moved: false };
  }

  function moveDrag(e: PointerEvent) {
    if (!drag) {
      return;
    }
    if (!drag.moved) {
      if (Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) {
        return;
      }
      drag.moved = true;
      // Only now: before, the row's buttons must still get their clicks.
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    let gap = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const box = rows[i].getBoundingClientRect();
      if (e.clientY < box.top + box.height / 2) {
        gap = i;
        break;
      }
    }
    // Dropping right above or below itself changes nothing.
    drop = gap === drag.from || gap === drag.from + 1 ? null : gap;
  }

  function endDrag() {
    if (drag?.moved && drop !== null) {
      const position = drop > drag.from ? drop - 1 : drop;
      run("layer.move", { id: drag.id, index: layers.length - 1 - position });
    }
    cancelDrag();
  }

  function cancelDrag() {
    drag = null;
    drop = null;
  }
</script>

{#snippet menuItems(Item: typeof DropdownMenu.Item, Separator: typeof DropdownMenu.Separator)}
  {#each MENU as group, i (i)}
    {#if i > 0}<Separator class="menu-separator" />{/if}
    {#each group as entry (entry)}
      {#if entry === "rename"}
        <Item class="menu-item" disabled={!active} onSelect={() => (renaming = active?.id ?? null)}>
          {m.layers_rename()}
        </Item>
      {:else}
        {@const keys = shortcut(entry)}
        <Item class="menu-item" disabled={!enabled(entry)} onSelect={() => run(entry)}>
          {editor.commands.get(entry)?.title ?? entry}
          {#if keys}<span class="menu-item-end">{keys}</span>{/if}
        </Item>
      {/if}
    {/each}
  {/each}
{/snippet}

<section class="section layers">
  <div class="panel-header">
    {#if active}
      <Select
        title={m.layers_blend_mode()}
        items={BLEND_MODES.map((mode) => ({ value: mode, label: BLEND_LABELS[mode]() }))}
        value={active.blendMode}
        onchange={(mode) => update(active.id, { blendMode: mode as BlendMode })}
      />
    {:else}
      <span></span>
    {/if}
    <button class="icon" title={tip("layer.add")} onclick={() => run("layer.add")}>
      <Plus />
    </button>
    <PanelMenu title={m.layers_menu()} {onCloseAutoFocus}>
      {@render menuItems(DropdownMenu.Item, DropdownMenu.Separator)}
    </PanelMenu>
  </div>
  {#if active}
    <Slider
      label={m.layers_opacity()}
      min={0}
      max={100}
      step={1}
      value={Math.round(active.opacity * 100)}
      display={m.toolbar_percent({ percent: Math.round(active.opacity * 100) })}
      onstart={startOpacity}
      onend={endOpacity}
      oninput={(v) => update(active.id, { opacity: v / 100 })}
    />
  {/if}

  <ContextMenu.Root onOpenChange={setContextOpen}>
    <ContextMenu.Trigger class="layer-list">
      <ul>
        {#each layers as layer, position (layer.id)}
          <li
            class:active={layer.active}
            class:dragged={drag?.id === layer.id && drag.moved}
            class:drop-above={drop === position}
            class:drop-below={drop === layers.length && position === layers.length - 1}
            bind:this={rows[position]}
            oncontextmenu={() => run("layer.select", { id: layer.id })}
            onpointerdown={(e) => startDrag(e, layer.id, position)}
            onpointermove={moveDrag}
            onpointerup={endDrag}
            onpointercancel={cancelDrag}
          >
            <LayerRow
              {layer}
              stamp={stamps[layer.id] ?? 0}
              renaming={renaming === layer.id}
              {update}
              {run}
              onrename={(input) => rename(layer.id, input)}
              onstartrename={() => (renaming = layer.id)}
              oncancelrename={() => (renaming = null)}
            />
          </li>
        {/each}
      </ul>
    </ContextMenu.Trigger>
    <ContextMenu.Portal>
      <ContextMenu.Content class="menu-content" collisionPadding={8} {onCloseAutoFocus}>
        {@render menuItems(ContextMenu.Item, ContextMenu.Separator)}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  </ContextMenu.Root>
</section>

<style>
  .layers {
    min-height: 0;
  }

  :global(.layer-list) {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  ul {
    flex: 1;
    min-height: 0;
    margin: 0;
    /* Room for the focus outline of a name being edited: the scrolling list clips whatever
       passes its edges. */
    padding: 2px 0;
    overflow-y: auto;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    border-radius: var(--radius-small);
    touch-action: none;
  }

  li.active {
    background: var(--selected);
  }

  li.dragged {
    opacity: 0.5;
  }

  /* The drop line, drawn inside the row so that rows do not move while dragging. */
  li.drop-above {
    box-shadow: inset 0 2px 0 var(--text-muted);
  }

  li.drop-below {
    box-shadow: inset 0 -2px 0 var(--text-muted);
  }
</style>
