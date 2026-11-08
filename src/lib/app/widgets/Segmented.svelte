<script lang="ts">
  // A small segmented control: every choice in view, one active.

  let {
    label,
    value,
    choices,
    onselect,
  }: {
    /** Names the group, for screen readers. */
    label: string;
    value: string;
    choices: readonly { value: string; label: string; title?: string }[];
    onselect: (value: string) => void;
  } = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each choices as choice (choice.value)}
    <!-- Not a submit button, inside a form. -->
    <button
      type="button"
      class:active={choice.value === value}
      role="radio"
      aria-checked={choice.value === value}
      title={choice.title}
      onclick={() => onselect(choice.value)}
    >
      {choice.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    flex: none;
    gap: 2px;
    padding: 2px;
    background: var(--field);
    border-radius: var(--radius);
  }

  /* A little smaller than the other buttons, to fit in the bar with its background. */
  button {
    height: calc(var(--control-height) - 4px);
    color: var(--text-muted);
    white-space: nowrap;
  }

  button.active {
    color: var(--text);
  }
</style>
