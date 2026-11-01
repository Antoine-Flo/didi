<script lang="ts">
  import EditorApp from "$lib/app/EditorApp.svelte";
  import { newEditor } from "$lib/app/new-drawing";

  const editor = newEditor();
</script>

<EditorApp {editor} />
