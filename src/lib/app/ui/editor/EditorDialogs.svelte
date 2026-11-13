<script lang="ts">
  // The editor's dialogs, opened through `dialogs` (see EditorDialogs).
  import type { Background } from "#lib/app/files/new-drawing.js";
  import type { Session } from "#lib/app/files/session.svelte.js";
  import type { CommandRegistry } from "#lib/core/editor/commands.js";
  import type { KeymapIndex } from "#lib/app/commands/keymap.js";
  import type { LayoutPrefs } from "#lib/app/prefs/layout-prefs.svelte.js";
  import type { ViewController } from "#lib/app/input/view-controller.svelte.js";
  import type { AppUpdate } from "#lib/app/state/app-update.svelte.js";
  import type { EditorDialogs } from "#lib/app/state/dialogs.svelte.js";
  import AboutDialog from "#lib/app/ui/dialogs/AboutDialog.svelte";
  import CommandPalette from "#lib/app/ui/dialogs/CommandPalette.svelte";
  import ConfirmDialog from "#lib/app/ui/dialogs/ConfirmDialog.svelte";
  import GridDialog from "#lib/app/ui/dialogs/GridDialog.svelte";
  import ImageSizeDialog from "#lib/app/ui/dialogs/ImageSizeDialog.svelte";
  import PreferencesDialog from "#lib/app/ui/dialogs/PreferencesDialog.svelte";
  import ShortcutsDialog from "#lib/app/ui/dialogs/ShortcutsDialog.svelte";
  import StartScreen from "#lib/app/ui/dialogs/StartScreen.svelte";
  import UnsavedDialog from "#lib/app/ui/dialogs/UnsavedDialog.svelte";
  import type { Editor } from "#lib/core/editor/editor.js";

  let {
    dialogs,
    commands,
    session,
    keymap,
    prefs,
    touchScreen,
    canvasSize,
    view,
    side,
    tip,
    run,
    onchoosenew,
    update,
  }: {
    dialogs: EditorDialogs;
    commands: CommandRegistry<Editor>;
    session: Session;
    keymap: KeymapIndex;
    prefs: LayoutPrefs;
    touchScreen: boolean;
    canvasSize: { width: number; height: number };
    /** The canvas's view: the size dialog previews the new size in it. */
    view: ViewController;
    /** Where the dialogs that leave the canvas seen go: away from the panels. */
    side: "left" | "right";
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
    /** A size or a background chosen in the start screen, before creating. */
    onchoosenew: (width: number, height: number, background: Background) => void;
    /** A newer version of the app: offered in the start screen. */
    update: AppUpdate;
  } = $props();
</script>

<CommandPalette {commands} {keymap} {run} bind:open={dialogs.commandPalette} />
<ShortcutsDialog {commands} {keymap} bind:open={dialogs.shortcuts} />
<AboutDialog bind:open={dialogs.about} />
<PreferencesDialog bind:open={dialogs.preferences} layout={prefs} {touchScreen} />
<ImageSizeDialog
  bind:kind={dialogs.size}
  width={canvasSize.width}
  height={canvasSize.height}
  {side}
  {run}
  onpreview={(preview) => view.previewResize(preview)}
/>
<GridDialog
  bind:open={dialogs.grid}
  pixelGrid={prefs.pixelGrid}
  tileGrid={session.grid}
  {side}
  {tip}
  {run}
  ontilegrid={(grid) => session.setGrid(grid)}
/>

<StartScreen
  bind:open={dialogs.start}
  recent={session.recent}
  recovery={session.recovery}
  oncreate={(width, height, background) => session.newDocument(width, height, background)}
  onchange={onchoosenew}
  onopen={(path) => session.open(path)}
  onrecover={() => session.recover()}
  ondiscardrecovery={() => session.discardRecovery()}
  {update}
  bind:whatsNew={dialogs.whatsNew}
  ondiscord={() => run("app.discord")}
/>
<UnsavedDialog request={dialogs.unsaved} />
<ConfirmDialog request={dialogs.confirmRequest} onclose={() => dialogs.closeConfirm()} />
