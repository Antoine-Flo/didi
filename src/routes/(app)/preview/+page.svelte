<script lang="ts">
  // The preview popped out of the editor, in a window of its own: its bar at the top, always
  // shown (drag its handle to move the window, double-click it to maximize; the zoom, then
  // the window's buttons), and the drawing in the room below. The editor sends the image
  // over the channel (see preview-link).

  import { onMount } from "svelte";
  import "#lib/app/styles/ui.css";
  import { windowTitle } from "#lib/app/layout/window-title.svelte.js";
  import WindowButtons from "#lib/app/ui/shell/WindowButtons.svelte";
  import { appWindow } from "#lib/platform/window.js";
  import PreviewBar from "#lib/app/ui/preview/PreviewBar.svelte";
  import PreviewImage from "#lib/app/ui/preview/PreviewImage.svelte";
  import {
    previewChannel,
    type FromPreview,
    type ToPreview,
  } from "#lib/app/preview/preview-link.js";
  import { m } from "#lib/paraglide/messages.js";

  windowTitle.name = m.preview_title();
  windowTitle.hidden = true;

  let image = $state<PreviewImage>();

  onMount(() => {
    const channel = previewChannel();
    channel.onmessage = (e: MessageEvent<ToPreview>) => image?.receive(e.data);
    channel.postMessage({ type: "hello" } satisfies FromPreview);
    return () => channel.close();
  });

  function onMouseDown(e: MouseEvent) {
    if (!appWindow || e.button !== 0) {
      return;
    }
    if (e.detail === 2) {
      appWindow.toggleMaximize();
    } else {
      appWindow.startDragging();
    }
  }
</script>

<div class="frame">
  <PreviewBar {image} fixed onmousedown={onMouseDown}>
    {#snippet end()}<WindowButtons />{/snippet}
  </PreviewBar>
  <div class="room"><PreviewImage bind:this={image} /></div>
</div>

<style>
  .frame {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }

  .room {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  :global(body) {
    background: var(--canvas-bg);
  }
</style>
