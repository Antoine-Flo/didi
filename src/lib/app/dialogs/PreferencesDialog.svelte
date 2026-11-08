<script lang="ts">
  // The app's preferences, one tab per subject, listed on the left. Changes apply at once
  // and are kept: there is nothing to confirm. The overlay is clear, so that the whole
  // interface can be seen while choosing its look.

  import { Dialog, Tabs } from "bits-ui";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import InterfaceSettings from "#lib/app/dialogs/InterfaceSettings.svelte";
  import TabletSettings from "#lib/app/dialogs/TabletSettings.svelte";
  import type { LayoutPrefs } from "#lib/app/shell/layout-prefs.svelte.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    open = $bindable(false),
    layout,
    touchScreen,
  }: {
    open: boolean;
    layout: LayoutPrefs;
    /** Shows the Tablet tab: its only setting is for touch screens. */
    touchScreen: boolean;
  } = $props();

  let tab = $state("interface");

  // While it is open, a contact on the canvas only closes it.
  $effect(() => {
    if (!open) return;
    popupOpened();
    return () => popupClosed();
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay clear" onclick={() => (open = false)} />
    <Dialog.Content class="dialog panel preferences">
      <Dialog.Title class="dialog-title">{m.preferences_title()}</Dialog.Title>
      <Tabs.Root bind:value={tab} orientation="vertical" class="preferences-tabs">
        <Tabs.List class="preferences-list">
          <Tabs.Trigger value="interface" class={["tab", tab === "interface" && "active"]}>
            {m.preferences_tab_interface()}
          </Tabs.Trigger>
          {#if touchScreen}
            <Tabs.Trigger value="tablet" class={["tab", tab === "tablet" && "active"]}>
              {m.preferences_tab_tablet()}
            </Tabs.Trigger>
          {/if}
        </Tabs.List>
        <Tabs.Content value="interface" class="preferences-page">
          <InterfaceSettings {layout} />
        </Tabs.Content>
        {#if touchScreen}
          <Tabs.Content value="tablet" class="preferences-page">
            <TabletSettings {layout} />
          </Tabs.Content>
        {/if}
      </Tabs.Root>
      <div class="actions">
        <span class="spacer"></span>
        <button class="primary" onclick={() => (open = false)}>{m.common_close()}</button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.dialog-overlay.clear) {
    background: none;
  }

  :global(.dialog.preferences) {
    width: min(600px * var(--ui-scale), 90vw);
  }

  :global(.preferences-tabs) {
    display: flex;
    gap: calc(var(--space) * 2);
  }

  :global(.preferences-list) {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: calc(120px * var(--ui-scale));
    flex: none;
  }

  :global(.preferences-list .tab) {
    text-align: left;
  }

  :global(.preferences-page) {
    flex: 1;
    min-width: 0;
  }

  .actions {
    display: flex;
    margin-top: var(--space);
  }

  .spacer {
    flex: 1;
  }
</style>
