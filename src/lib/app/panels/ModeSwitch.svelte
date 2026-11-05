<script lang="ts">
  // The document's mode (pixel art, painting), in the status bar. Each button runs a command.

  import Segmented from "#lib/app/widgets/Segmented.svelte";
  import type { Mode } from "#lib/app/modes/mode.js";

  let {
    modes,
    mode,
    tip,
    run,
  }: {
    modes: Mode[];
    /** Id of the current mode. */
    mode: string;
    tip: (id: string) => string;
    run: (id: string, params?: unknown) => void;
  } = $props();
</script>

<Segmented
  label="Mode"
  value={mode}
  choices={modes.map((m) => ({ value: m.id, label: m.title, title: tip(`mode.${m.id}`) }))}
  onselect={(id) => run(`mode.${id}`)}
/>
