<script lang="ts">
  // The menus of the title bar (File, Edit…), drawn by the app (Bits UI). Each item runs a
  // command, with the command's title and shortcut; a disabled command shows a disabled
  // item. An item may have a small icon before its name; in a menu where any item has one (or a
  // switch's check), every item keeps the place, so that the names stay aligned. Menus come
  // from data (see default-menus.ts). Collapsed (a small screen), one
  // button opens them all, one page at a time: a submenu replaces its menu, with a way back
  // at the top, rather than opening beside it, past the screen's edge.

  import { Check, ChevronLeft, ChevronRight, Menu } from "@lucide/svelte";
  import { Menubar } from "bits-ui";
  import { onDestroy } from "svelte";
  import { popupClosed, popupOpened } from "#lib/app/canvas/dismissal.js";
  import { cssLength } from "#lib/app/widgets/popup-padding.js";
  import type { MenuDefinition, MenuEntry } from "#lib/app/commands/default-menus.js";
  import { m } from "#lib/paraglide/messages.js";

  let {
    menus,
    collapsed = false,
    disabled = false,
    title,
    shortcut,
    enabled,
    checked = () => undefined,
    run,
  }: {
    menus: MenuDefinition[];
    /** One button for all the menus, each a submenu: on a small screen. */
    collapsed?: boolean;
    /** Nothing opens, e.g. while a dialog is open. */
    disabled?: boolean;
    /** A command's title. */
    title: (command: string) => string;
    /** A command's first shortcut, e.g. "Ctrl+S", if it has one. */
    shortcut: (command: string) => string | undefined;
    enabled: (command: string, params?: unknown) => boolean;
    /** Whether a switch is on; undefined for a command that is not a switch. */
    checked?: (command: string) => boolean | undefined;
    run: (command: string, params?: unknown) => void;
  } = $props();

  type Submenu = Extract<MenuEntry, { items: MenuEntry[] }>;
  type Item = Exclude<MenuEntry, "separator">;

  /** An item shows something before its name: an icon, or a switch's check. */
  const leads = (e: MenuEntry) =>
    e !== "separator" && (!!e.icon || ("command" in e && checked(e.command) !== undefined));

  // The menus open a little below the title bar's group around them, which reaches past the
  // buttons by half a space and its border. A submenu opens the same gap past its menu's edge
  // (the item that opens it is inside the menu's padding and border), its first item level
  // with that item.
  const GAP = 4;
  /** Measured when a menu opens: the interface size may have changed. */
  let inset = $state(0);
  /** Collapsed, the submenus opened, from the first: the last one is shown. */
  let pages = $state<Submenu[]>([]);

  // While a menu is open, a click on the canvas only closes it.
  let open = false;
  function setValue(value: string) {
    const next = value !== "";
    if (next === open) {
      return;
    }
    open = next;
    pages = [];
    if (next) {
      inset = cssLength("calc(var(--space) / 2)") + 1;
      popupOpened();
    } else {
      popupClosed();
    }
  }
  // Removed while open: the canvas must not stay blocked.
  onDestroy(() => setValue(""));
</script>

{#snippet lead(entry: Item, on: boolean)}
  <span class="menu-lead"
    >{#if on}<Check class="icon-small" />{:else if entry.icon}<entry.icon
        class="icon-small"
      />{/if}</span
  >
{/snippet}

{#snippet entries(items: MenuEntry[])}
  {@const leading = items.some(leads)}
  {#each items as entry, i (i)}
    {#if entry === "separator"}
      <Menubar.Separator class="menu-separator" />
    {:else if "items" in entry && collapsed}
      <Menubar.Item
        class="menu-item"
        disabled={entry.items.length === 0}
        closeOnSelect={false}
        onSelect={() => (pages = [...pages, entry])}
      >
        {#if leading}{@render lead(entry, false)}{/if}
        {entry.label}
        <span class="menu-item-end"><ChevronRight class="icon-small" /></span>
      </Menubar.Item>
    {:else if "items" in entry}
      <Menubar.Sub>
        <Menubar.SubTrigger class="menu-item" disabled={entry.items.length === 0}>
          {#if leading}{@render lead(entry, false)}{/if}
          {entry.label}
          <span class="menu-item-end"><ChevronRight class="icon-small" /></span>
        </Menubar.SubTrigger>
        <Menubar.SubContent
          class="menu-content menubar-content"
          align="start"
          alignOffset={-inset}
          sideOffset={inset + GAP}
        >
          {@render entries(entry.items)}
        </Menubar.SubContent>
      </Menubar.Sub>
    {:else if checked(entry.command) !== undefined}
      {@const keys = shortcut(entry.command)}
      {@const on = checked(entry.command) === true}
      <!-- A switch: a check in front when it is on. -->
      <Menubar.CheckboxItem
        class="menu-item"
        checked={on}
        disabled={!enabled(entry.command)}
        onCheckedChange={() => run(entry.command)}
      >
        {@render lead(entry, on)}
        {entry.label ?? title(entry.command)}
        {#if keys}<span class="menu-item-end">{keys}</span>{/if}
      </Menubar.CheckboxItem>
    {:else}
      {@const keys = entry.params === undefined ? shortcut(entry.command) : undefined}
      <Menubar.Item
        class="menu-item"
        disabled={!enabled(entry.command, entry.params)}
        onSelect={() => run(entry.command, entry.params)}
      >
        {#if leading}{@render lead(entry, false)}{/if}
        {entry.label ?? title(entry.command)}
        {#if keys}<span class="menu-item-end">{keys}</span>{/if}
      </Menubar.Item>
    {/if}
  {/each}
{/snippet}

<Menubar.Root class="menubar" onValueChange={setValue}>
  {#if collapsed}
    <Menubar.Menu>
      <Menubar.Trigger class="menubar-trigger menubar-icon" title={m.menubar_menu()} {disabled}>
        <Menu />
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content
          class="menu-content menubar-content"
          align="start"
          sideOffset={inset + GAP}
          collisionPadding={8}
        >
          {@const page = pages.at(-1)}
          {#if page}
            <Menubar.Item
              class="menu-item menu-back"
              closeOnSelect={false}
              onSelect={() => (pages = pages.slice(0, -1))}
            >
              <ChevronLeft class="icon-small" />
              {page.label}
            </Menubar.Item>
            <Menubar.Separator class="menu-separator" />
            {@render entries(page.items)}
          {:else}
            {@render entries(menus.map((m) => ({ label: m.title, items: m.items })))}
          {/if}
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  {/if}
  {#each collapsed ? [] : menus as menu (menu.title)}
    <Menubar.Menu>
      <Menubar.Trigger class="menubar-trigger" {disabled}>{menu.title}</Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content
          class="menu-content menubar-content"
          align="start"
          sideOffset={inset + GAP}
        >
          {@render entries(menu.items)}
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  {/each}
</Menubar.Root>

<style>
  :global(.menubar) {
    display: flex;
    gap: 2px;
    align-items: center;
    /* The first menu lines up with the mode buttons below (their group has a 2px inset). */
    padding: 0 calc(var(--space) / 2 + 2px);
  }

  /* Rounded, like the other buttons of the app. Styled entirely here, like the window
     buttons. */
  :global(.menubar-trigger) {
    height: var(--control-height);
    padding: 0 var(--space);
    color: var(--text-muted);
    background: none;
    border: none;
    border-radius: var(--radius-small);
    font: inherit;
    cursor: default;
  }

  :global(.menubar-trigger.menubar-icon) {
    display: flex;
    align-items: center;
    padding: 0 calc(var(--space) / 2);
  }

  :global(.menubar-trigger:hover:not(:disabled)),
  :global(.menubar-trigger[data-state="open"]) {
    color: var(--text);
    background: var(--hover);
  }

  /* Above the title bar they open from: a submenu may reach up to it. */
  :global(.menubar-content) {
    z-index: 71;
    min-width: calc(220px * var(--ui-scale));
  }

  /* The way back to the menu above: its name, muted, like a title. */
  :global(.menu-item.menu-back) {
    gap: calc(var(--space) / 2);
    color: var(--text-muted);
  }
</style>
