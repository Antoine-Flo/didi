// What the app's commands act on (see app-commands.ts), provided by the editor's state.

import type { AppHost } from "#lib/app/commands/app-commands.js";
import { lastPointer } from "#lib/app/input/last-pointer.js";
import { errorMessage } from "#lib/app/shared/error-message.js";
import type { EditorState } from "#lib/app/state/editor-state.svelte.js";
import { m } from "#lib/paraglide/messages.js";
import { capabilities } from "#lib/platform/capabilities.js";
import { openLink } from "#lib/platform/open-link.js";
import { systemInfo } from "#lib/platform/system.js";
import { appWindow, toggleFullScreen } from "#lib/platform/window.js";

export function commandHost(state: EditorState): AppHost {
  const { session, prefs, layout, preview, dialogs, tools } = state;
  return {
    get tool() {
      return tools.id;
    },
    set tool(id) {
      tools.id = id;
    },
    tools: tools.registry,
    options: state.options,

    view: state.view,
    get hand() {
      return prefs.hand;
    },
    set hand(hand) {
      prefs.hand = hand;
    },
    shown: (what) => {
      const on: Record<typeof what, () => boolean> = {
        panels: () => layout.panelsOpen,
        interface: () => !state.interfaceHidden,
        pixelGrid: () => prefs.pixelGrid,
        preview: () => preview.place !== "off",
        tileGrid: () => session.grid.shown,
      };
      return on[what]();
    },
    togglePanels: () => layout.togglePanels(),
    togglePixelGrid: () => (prefs.pixelGrid = !prefs.pixelGrid),
    toggleTileGrid: () => session.setGrid({ ...session.grid, shown: !session.grid.shown }),
    togglePreview: () => (preview.place = preview.place === "off" ? "in" : "off"),
    toggleInterface: () => (state.interfaceHidden = !state.interfaceHidden),
    toggleFullScreen: () =>
      void toggleFullScreen().catch((e) =>
        state.notify(m.app_full_screen_failed({ error: errorMessage(e) })),
      ),

    get palettes() {
      return state.palettes.current;
    },
    importPalette: () => state.pickPalette(),
    confirm: (question) => dialogs.confirm(question),

    canUseFiles: capabilities.userFiles,
    openDocument: (path) => session.open(path),
    saveDocument: () => session.save(),
    saveDocumentAs: () => session.saveAs(),
    exportPng: () => session.exportPng(),
    importImage: () => state.pickImages(),
    quit: appWindow ? () => void appWindow?.close() : null,

    version: __APP_VERSION__,
    system: systemInfo,
    editorFacts: () => {
      const { width, height, layers } = state.editor.drawing;
      return {
        input: lastPointer(),
        tool: tools.id,
        doc: `${width}x${height}, ${layers.length} layers`,
        screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
        layout: layout.compact ? "compact" : "normal",
        error: state.messages.lastError,
      };
    },
    openLink,

    openDialog: (name) => dialogs.open(name),
    notify: (message, level) => state.notify(message, level),
  };
}
