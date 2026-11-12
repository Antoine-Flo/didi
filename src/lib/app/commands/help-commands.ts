// The Help commands that lead out of the app: the documentation, report a bug, send feedback,
// join the Discord. The forms open with what they are told (see feedback-links.ts).

import type { Notifier } from "#lib/app/commands/app-commands.js";
import {
  bugReportUrl,
  DISCORD,
  DOCS,
  feedbackUrl,
  type EditorFacts,
} from "#lib/app/shared/feedback-links.js";
import { errorMessage } from "#lib/app/shared/error-message.js";
import type { CommandRegistry } from "#lib/core/editor/commands.js";
import type { Editor } from "#lib/core/editor/editor.js";
import { m } from "#lib/paraglide/messages.js";
import type { SystemInfo } from "#lib/platform/system.js";

/** What the help commands act on. */
export interface HelpHost extends Notifier {
  readonly version: string;
  system(): SystemInfo;
  /** The editor as it is now, for a bug report. */
  editorFacts(): EditorFacts;
  /** Opens a web page outside the app. */
  openLink(url: string): Promise<void>;
}

/** Registers the help commands. Returns a function that unregisters them. */
export function registerHelpCommands(
  registry: CommandRegistry<Editor>,
  host: HelpHost,
): () => void {
  const open = (url: string) =>
    void host
      .openLink(url)
      .catch((e) => host.notify(m.help_link_failed({ url, error: errorMessage(e) })));
  const unregister = [
    registry.register({
      id: "app.documentation",
      title: m.cmd_app_documentation(),
      run: () => open(DOCS),
    }),
    registry.register({
      id: "app.reportBug",
      title: m.cmd_app_report_bug(),
      run: () => open(bugReportUrl(host.version, host.system(), host.editorFacts())),
    }),
    registry.register({
      id: "app.feedback",
      title: m.cmd_app_feedback(),
      run: () => open(feedbackUrl(host.version, host.system())),
    }),
    registry.register({
      id: "app.discord",
      title: m.cmd_app_discord(),
      run: () => open(DISCORD),
    }),
  ];
  return () => unregister.forEach((fn) => fn());
}
