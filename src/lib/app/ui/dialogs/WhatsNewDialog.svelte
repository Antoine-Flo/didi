<script lang="ts">
  // What changed in the versions since the one running, the newest first: opened from the
  // update offer. Above the start screen, it closes only with its button (or Esc), so that a
  // click beside it doesn't close the start screen too.

  import { AlertDialog } from "bits-ui";
  import type { ReleaseNotes } from "#lib/app/files/release-notes.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    open = $bindable(false),
    releases,
  }: {
    open?: boolean;
    releases: readonly ReleaseNotes[];
  } = $props();

  const day = (date: string) =>
    date ? new Date(date).toLocaleString(undefined, { dateStyle: "medium" }) : "";
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="dialog-overlay" />
    <AlertDialog.Content class="dialog panel whats-new">
      <AlertDialog.Title class="dialog-title">{m.update_whats_new_title()}</AlertDialog.Title>
      <div class="releases">
        {#each releases as release (release.version)}
          <section>
            <div class="version">
              <span>{release.version}</span>
              <span class="date">{day(release.date)}</span>
            </div>
            <ul class="dialog-text">
              {#each release.notes as line, i (i)}
                <li>{line}</li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
      <div class="actions">
        <span class="spacer"></span>
        <AlertDialog.Action class="primary" onclick={() => (open = false)}>
          {m.common_ok()}
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  :global(.dialog.whats-new) {
    max-height: 70vh;
  }

  .releases {
    display: flex;
    flex-direction: column;
    gap: var(--space);
    min-height: 0;
    overflow-y: auto;
  }

  .version {
    display: flex;
    justify-content: space-between;
    gap: var(--space);
    font-weight: 600;
  }

  .date {
    color: var(--text-muted);
    font-weight: normal;
  }

  ul {
    margin: calc(var(--space) / 2) 0 0;
    padding-left: calc(var(--space) * 2);
  }

  .actions {
    display: flex;
    margin-top: var(--space);
  }

  .spacer {
    flex: 1;
  }
</style>
