<script lang="ts">
  // A dropdown menu drawn by the app (Bits UI), instead of the native one: it looks like the
  // rest of the interface, and avoids GTK popups (and their warnings) under Wayland.

  import { ChevronDown } from "@lucide/svelte";
  import { Select } from "bits-ui";
  import { onDestroy, type Snippet } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/shared/dismissal.js";
  import { popupPadding } from "#lib/app/shared/popup-padding.js";

  let {
    items,
    value,
    onchange,
    title,
    item,
  }: {
    /** Consecutive items with the same `group` are shown under it, as a heading. */
    items: { value: string; label: string; group?: string }[];
    value: string;
    onchange: (value: string) => void;
    title?: string;
    /** Content of an item in the list, instead of its label alone. */
    item?: Snippet<[{ value: string; label: string }]>;
  } = $props();

  const label = $derived(items.find((i) => i.value === value)?.label ?? "");

  /** The items in runs of the same group. */
  const groups = $derived(
    items.reduce<{ heading?: string; items: typeof items }[]>((runs, entry) => {
      const last = runs.at(-1);
      if (last && last.heading === entry.group) {
        last.items.push(entry);
      } else {
        runs.push({ heading: entry.group, items: [entry] });
      }
      return runs;
    }, []),
  );

  let open = false;
  function setOpen(next: boolean) {
    if (next === open) {
      return;
    }
    open = next;
    if (next) {
      popupOpened();
    } else {
      popupClosed();
    }
  }
  // Removed while open (e.g. its panel disappears): the canvas must not stay blocked.
  onDestroy(() => setOpen(false));
</script>

{#snippet entries(list: typeof items)}
  {#each list as entry (entry.value)}
    <Select.Item class={["select-item", item && "custom"]} value={entry.value} label={entry.label}>
      {#if item}{@render item(entry)}{:else}{entry.label}{/if}
    </Select.Item>
  {/each}
{/snippet}

<Select.Root
  type="single"
  {value}
  {items}
  onValueChange={(v) => v !== value && onchange(v)}
  onOpenChange={setOpen}
>
  <Select.Trigger class="select-trigger" {title}>
    <span>{label}</span>
    <ChevronDown class="icon-small" />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content class="select-content" sideOffset={4} collisionPadding={popupPadding()}>
      <Select.Viewport class="select-viewport">
        {#each groups as run, i (i)}
          {#if run.heading}
            <Select.Group>
              <Select.GroupHeading class="select-heading">{run.heading}</Select.GroupHeading>
              {@render entries(run.items)}
            </Select.Group>
          {:else}
            {@render entries(run.items)}
          {/if}
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>

<style>
  :global(.select-trigger) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space);
    width: 100%;
    min-width: 0;
    background: var(--field);
    border: 1px solid var(--field-border);
    color: var(--text);
  }

  :global(.select-trigger span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.select-trigger svg) {
    flex: none;
    color: var(--text-muted);
  }

  :global(.select-content) {
    z-index: 60;
    box-sizing: border-box;
    min-width: var(--bits-select-anchor-width);
    max-height: min(var(--bits-select-content-available-height), 360px * var(--ui-scale));
    padding: calc(var(--space) / 2);
    overflow-y: auto;
    background: var(--popup);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  :global(.select-item) {
    display: flex;
    align-items: center;
    height: var(--control-height);
    padding: 0 var(--space);
    border-radius: var(--radius-small);
    white-space: nowrap;
    cursor: pointer;
  }

  :global(.select-heading) {
    padding: calc(var(--space) / 2) var(--space);
    color: var(--text-muted);
    font-weight: 600;
  }

  /* Custom content: as tall as it needs. */
  :global(.select-item.custom) {
    height: auto;
    min-height: var(--control-height);
    padding-block: calc(var(--space) / 2);
  }

  :global(.select-item[data-highlighted]) {
    background: var(--hover);
  }

  :global(.select-item[data-selected]) {
    background: var(--selected);
  }
</style>
