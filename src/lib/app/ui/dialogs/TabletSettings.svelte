<script lang="ts">
  // The Tablet tab of the preferences: whether one finger draws on a touch screen (see
  // touch-gestures). Kept by layout-prefs.

  import Segmented from "#lib/app/ui/widgets/Segmented.svelte";
  import type { FingerDrawing, LayoutPrefs } from "#lib/app/prefs/layout-prefs.svelte.js";
  import { m } from "#lib/paraglide/messages.js";

  let { layout }: { layout: LayoutPrefs } = $props();
</script>

<div class="row">
  <span>{m.layout_finger_drawing()}</span>
  <Segmented
    label={m.layout_finger_drawing()}
    value={layout.fingerDrawing}
    choices={[
      {
        value: "auto",
        label: m.layout_compact_auto(),
        title: layout.penSeen ? m.layout_finger_auto_pen_title() : m.layout_finger_auto_title(),
      },
      { value: "on", label: m.layout_on(), title: m.layout_finger_on_title() },
      { value: "off", label: m.layout_off(), title: m.layout_finger_off_title() },
    ]}
    onselect={(mode) => (layout.fingerDrawing = mode as FingerDrawing)}
  />
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space);
  }
</style>
