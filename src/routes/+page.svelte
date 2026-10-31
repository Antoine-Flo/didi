<script lang="ts">
  import EditorApp from "$lib/app/EditorApp.svelte";
  import { Drawing } from "$lib/core/drawing";
  import { Editor } from "$lib/core/editor";

  const editor = new Editor(new Drawing(2048, 2048));
  editor.commands.execute("layer.add");
  editor.history.clear();
</script>

<EditorApp {editor} />
