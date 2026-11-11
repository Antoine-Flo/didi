<script lang="ts">
  // A newer version, at the top of the start screen: in the accent color, so that it is seen
  // before starting to draw. "Update" downloads and installs it (Didi restarts); what changed
  // opens on request.

  import type { AppUpdate } from "#lib/app/state/app-update.svelte.js";
  import WhatsNewDialog from "#lib/app/ui/dialogs/WhatsNewDialog.svelte";
  import { m } from "#lib/paraglide/messages.js";

  // Nothing without a newer version. While it downloads, its progress replaces the buttons.
  let {
    update,
    whatsNew = $bindable(false),
  }: {
    update: AppUpdate;
    /** What changed is shown (see EditorDialogs.whatsNew). */
    whatsNew?: boolean;
  } = $props();
</script>

{#if update.offer}
  {@const offer = update.offer}
  <section class="update">
    <div class="text">
      <span class="title">{m.update_new_version()}</span>
      <span class="detail">
        {m.update_versions({ current: offer.currentVersion, version: offer.version })}
      </span>
      <span class="detail">{m.update_restart_note()}</span>
    </div>
    <div class="actions">
      {#if update.busy}
        <span class="detail">{update.busy}</span>
      {:else}
        {#if offer.releases.length}
          <button onclick={() => (whatsNew = true)}>{m.update_whats_new()}</button>
        {/if}
        <button class="primary" onclick={() => void update.install()}>{m.update_install()}</button>
      {/if}
    </div>
  </section>

  <WhatsNewDialog bind:open={whatsNew} releases={offer.releases} />
{/if}

<style>
  .update {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: calc(var(--space) * 2);
    padding: var(--space) calc(var(--space) * 2);
    background: color-mix(in srgb, var(--accent) 18%, var(--popup));
    border-bottom: 1px solid var(--accent);
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: calc(var(--space) / 4);
    min-width: 0;
  }

  .title {
    font-weight: 600;
  }

  .detail {
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
  }
</style>
