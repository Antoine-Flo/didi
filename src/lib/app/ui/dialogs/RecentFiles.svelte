<script lang="ts">
  // The start screen's recent files: the copy of an unsaved document to recover, if any, then
  // the files opened lately, each with its preview, mode, name and folder.

  import type { Mode } from "#lib/app/modes/mode.js";
  import type { RecentFile } from "#lib/app/files/recent.js";
  import type { RecoveryInfo } from "#lib/app/files/session.svelte.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    modes,
    recent,
    recovery,
    onopen,
    onrecover,
    ondiscardrecovery,
  }: {
    modes: readonly Mode[];
    recent: readonly RecentFile[];
    recovery: RecoveryInfo | null;
    /** Opens a recent file. */
    onopen: (path: string) => void;
    onrecover: () => void;
    ondiscardrecovery: () => void;
  } = $props();

  const modeOf = (id: string | undefined) => modes.find((m) => m.id === id);

  const folder = (path: string) => path.replace(/[\\/][^\\/]*$/, "");
  const when = (time: number) =>
    new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  /** The recovery's sentence, in pieces: the file's name in bold. */
  function recoveryParts(info: RecoveryInfo) {
    let strong = false;
    return m.start_recovery.parts({ time: when(info.time), name: info.name }).flatMap((part) => {
      if (part.type === "markup-start") {
        strong = true;
      } else if (part.type === "markup-end") {
        strong = false;
      } else if (part.type === "text") {
        return [{ text: part.value, strong }];
      }
      return [];
    });
  }
</script>

{#if recovery}
  <div class="recovery">
    <span>
      {#each recoveryParts(recovery) as part, i (i)}
        {#if part.strong}<strong>{part.text}</strong>{:else}{part.text}{/if}
      {/each}
    </span>
    <div class="actions">
      <button class="primary" onclick={onrecover}>{m.start_recover()}</button>
      <button onclick={ondiscardrecovery}>{m.unsaved_discard()}</button>
    </div>
  </div>
{/if}

{#if recent.length > 0}
  <ul>
    {#each recent as file (file.path)}
      {@const fileMode = modeOf(file.mode)}
      <li>
        <button title={file.path} onclick={() => onopen(file.path)}>
          <img src={file.thumbnail} alt="" draggable="false" />
          <span class="name">
            {#if fileMode}
              {@const Icon = fileMode.icon}
              <span class="file-mode" title={fileMode.title}><Icon class="icon-small" /></span>
            {/if}
            {file.name}
          </span>
          <span class="path">{folder(file.path)}</span>
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <span class="hint">{m.start_no_recent()}</span>
{/if}

<style>
  .file-mode {
    display: inline-flex;
    vertical-align: -2px;
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
  }

  .recovery {
    display: flex;
    flex-direction: column;
    gap: var(--space);
    padding: var(--space);
    background: var(--field);
    border: 1px solid var(--field-border);
    border-radius: var(--radius-small);
  }

  ul {
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  li button {
    display: grid;
    grid-template-columns: calc(48px * var(--ui-scale)) 1fr;
    grid-template-rows: auto auto;
    column-gap: var(--space);
    align-items: center;
    width: 100%;
    height: auto;
    padding: calc(var(--space) / 2);
    text-align: left;
  }

  img {
    grid-row: span 2;
    width: calc(48px * var(--ui-scale));
    height: calc(48px * var(--ui-scale));
    object-fit: contain;
    border-radius: var(--radius-small);
    /* Checkerboard behind transparent drawings. */
    background: repeating-conic-gradient(var(--field-border) 0 25%, var(--field) 0 50%) 0 0 / 12px
      12px;
  }

  .name,
  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .path {
    color: var(--text-faint);
  }
</style>
