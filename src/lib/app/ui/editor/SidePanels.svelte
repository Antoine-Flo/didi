<script lang="ts">
  // The panels' column, the whole height on one side, and its inner edge, dragged to change
  // its width. Closed, it slides out past the window's edge.
  import type { ComponentProps } from "svelte";
  import type { EditorLayout } from "#lib/app/layout/editor-layout.svelte.js";
  import type { LayoutPrefs } from "#lib/app/prefs/layout-prefs.svelte.js";
  import PanelColumn from "#lib/app/ui/panels/PanelColumn.svelte";
  import Splitter from "#lib/app/ui/widgets/Splitter.svelte";

  let {
    layout,
    prefs,
    hidden,
    ...panels
  }: {
    layout: EditorLayout;
    prefs: LayoutPrefs;
    /** Only the canvas shows. */
    hidden: boolean;
  } & Omit<ComponentProps<typeof PanelColumn>, "layout" | "tab" | "tabBar" | "ontab"> = $props();
</script>

<div
  class="panel-column"
  class:left={layout.panelsOnLeft}
  class:closed={!layout.panelsOpen}
  class:sliding={layout.sliding}
  class:hidden
  bind:this={layout.elements.panelColumn}
  bind:clientHeight={layout.columnHeight}
  inert={!layout.panelsOpen}
>
  <PanelColumn
    {...panels}
    layout={prefs}
    tab={layout.tabbed ? layout.panelTab : null}
    tabBar={!layout.compact}
    ontab={(tab) => (layout.panelTab = tab)}
  />
</div>

<!-- The column's inner edge: drag it to change the column's width. -->
<div class="column-edge" class:left={layout.panelsOnLeft} class:hidden hidden={!layout.panelsOpen}>
  <Splitter
    orientation="vertical"
    after={!layout.panelsOnLeft}
    measure={() => layout.measurePanelWidth()}
    onresize={(size) => prefs.setSize("panels", size / layout.uiScale)}
    onreset={() => prefs.resetSize("panels")}
  />
</div>

<style>
  /* The whole height. Above the options' panels, which may reach it on a narrow screen (see
     ToolBar), like the panels' tab and the tools. */
  .panel-column {
    position: absolute;
    z-index: 1;
    top: var(--content-top);
    right: var(--space);
    bottom: var(--space);
    width: var(--panel-width);
  }

  .panel-column.left {
    right: auto;
    left: var(--space);
  }

  .closed {
    visibility: hidden;
    transform: translateX(calc(100% + var(--space)));
  }

  .closed.left {
    transform: translateX(calc(-100% - var(--space)));
  }

  /* The whole gap between the column and the tools, its line in the middle. */
  .column-edge {
    position: absolute;
    top: var(--content-top);
    bottom: var(--space);
    right: calc(var(--panel-width) + var(--space));
    display: flex;
    width: var(--space);
  }

  .column-edge.left {
    right: auto;
    left: calc(var(--panel-width) + var(--space));
  }

  .column-edge[hidden] {
    display: none;
  }

  /* Fills the edge: no negative margins as between stacked panels. */
  .column-edge :global(.splitter) {
    flex: 1;
    margin: 0;
  }

  /* Only the canvas (Tab). */
  .hidden {
    visibility: hidden;
  }

  /* Opening or closing. */
  .panel-column.sliding {
    transition:
      transform 0.2s ease,
      visibility 0.2s,
      left 0.2s ease,
      right 0.2s ease;
  }
</style>
