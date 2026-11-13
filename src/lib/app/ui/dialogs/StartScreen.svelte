<script lang="ts">
  // Shown at start (like Blender's splash screen) and by "New document": create a document
  // (choose a size and a background, then "New document"), or open a recent one.
  // Clicking outside keeps the current document. A newer version of the app shows at the top,
  // and the way to the Discord at the bottom.
  // The choice of the new document: see NewDocumentForm.

  import { Dialog } from "bits-ui";
  import { popupClosed, popupOpened } from "#lib/app/shared/dismissal.js";
  import { capabilities } from "#lib/platform/capabilities.js";
  import {
    NewDocumentChoice,
    type ChoiceListener,
  } from "#lib/app/files/new-document-choice.svelte.js";
  import type { RecentFile } from "#lib/app/files/recent.js";
  import type { RecoveryInfo } from "#lib/app/files/session.svelte.js";
  import type { AppUpdate } from "#lib/app/state/app-update.svelte.js";
  import NewDocumentForm from "#lib/app/ui/dialogs/NewDocumentForm.svelte";
  import RecentFiles from "#lib/app/ui/dialogs/RecentFiles.svelte";
  import UpdateOffer from "#lib/app/ui/dialogs/UpdateOffer.svelte";
  import DiscordLogo from "#lib/app/ui/widgets/DiscordLogo.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    open = $bindable(false),
    recent,
    recovery,
    oncreate,
    onchange,
    onopen,
    onrecover,
    ondiscardrecovery,
    update,
    whatsNew = $bindable(false),
    ondiscord,
  }: {
    open?: boolean;
    recent: readonly RecentFile[];
    recovery: RecoveryInfo | null;
    oncreate: ChoiceListener;
    /** The size or the background was changed by the user (a valid size only). */
    onchange?: ChoiceListener;
    /** Opens a recent file, or asks for one without a path. */
    onopen: (path?: string) => void;
    onrecover: () => void;
    ondiscardrecovery: () => void;
    /** A newer version of the app, shown at the top if there is one. */
    update: AppUpdate;
    /** What changed in the newer versions is shown, above. */
    whatsNew?: boolean;
    /** Opens the Discord (outside the app: the screen stays). */
    ondiscord: () => void;
  } = $props();

  // The last choice is kept while the app runs.
  const choice = new NewDocumentChoice((...args) => onchange?.(...args));

  function create() {
    open = false;
    oncreate(choice.width, choice.height, choice.background);
  }

  let content = $state<HTMLElement | null>(null);

  // While it is open, a contact on the canvas only closes it.
  $effect(() => {
    if (!open) {
      return;
    }
    popupOpened();
    return () => popupClosed();
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <!-- Closes on click (after the release), not on press: see CommandPalette. -->
    <Dialog.Overlay class="dialog-overlay" onclick={() => (open = false)} />
    <!-- The dialog itself takes the focus, not its first button: the button would show a
         focus ring as if it were the chosen size. The focus trap then brings the focus back to
         the dialog, not to the button, when the window takes it at start. -->
    <Dialog.Content
      bind:ref={content}
      class={["start-screen panel", !capabilities.userFiles && "no-files"]}
      tabindex={-1}
      interactOutsideBehavior="ignore"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        content?.focus({ preventScroll: true });
      }}
    >
      <Dialog.Title class="sr-only">{m.start_new_document()}</Dialog.Title>

      <UpdateOffer {update} bind:whatsNew />

      <section class="new">
        <span class="section-title">{m.start_new_document()}</span>
        <NewDocumentForm {choice} />
      </section>

      {#if capabilities.userFiles}
        <section class="recent">
          <span class="section-title">{m.start_recent()}</span>

          <RecentFiles
            {recent}
            {recovery}
            onopen={(path) => {
              open = false;
              onopen(path);
            }}
            onrecover={() => {
              open = false;
              onrecover();
            }}
            {ondiscardrecovery}
          />
        </section>
      {/if}

      <div class="footer">
        <button class="primary" disabled={!choice.valid} onclick={create}
          >{m.start_new_document_action()}</button
        >
        {#if capabilities.userFiles}
          <button
            onclick={() => {
              open = false;
              onopen();
            }}>{m.start_open_image()}</button
          >
        {/if}
        <span class="spacer"></span>
        <button class="discord" onclick={ondiscord}>
          <span class="discord-icon"><DiscordLogo /></span>{m.start_discord()}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Centered below the title bar by the layout, not by a transform: a translation of half
     a pixel blurs the text. */
  :global(.start-screen) {
    position: fixed;
    inset: var(--titlebar-height) 0 0;
    z-index: 51;
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: min(760px * var(--ui-scale), 92vw);
    height: fit-content;
    max-height: 90vh;
    margin: auto;
    overflow: hidden;
    background: var(--popup);
  }

  /* Without the recent files. */
  :global(.start-screen.no-files) {
    grid-template-columns: 1fr;
    width: min(380px * var(--ui-scale), 92vw);
  }

  :global(.start-screen:focus-visible) {
    outline: none;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--space);
    min-height: 0;
    padding: calc(var(--space) * 2);
  }

  .recent {
    border-left: 1px solid var(--border);
  }

  /* Actions at the bottom left: create, open; the Discord at the right. */
  .footer {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: calc(var(--space) / 2);
    padding: var(--space) calc(var(--space) * 2);
    border-top: 1px solid var(--border);
  }

  .spacer {
    flex: 1;
  }

  /* A link more than an action: muted, with the text's color on hover. */
  .discord {
    display: flex;
    align-items: center;
    gap: calc(var(--space) * 0.75);
    color: var(--text-muted);
  }

  .discord:hover:not(:disabled) {
    color: var(--text);
  }

  .discord-icon {
    width: var(--icon-size);
    height: var(--icon-size);
  }
</style>
