<script lang="ts">
  // Side panel of the render lab page: GPU info, settings and measurements.

  import type { FrameReport } from "#lib/lab/frame-stats.js";
  import type { GpuInfo } from "#lib/lab/gpu-info.js";
  import type { ReadRow } from "#lib/lab/readback.js";

  const SIZES = [2048, 4096, 8192];
  const LAYER_COUNTS = [1, 5, 10, 20];
  const BENCH_RATES = [0, 100, 1000, 5000, 20000];

  let {
    docSize = $bindable(),
    layerCount = $bindable(),
    benchRate = $bindable(),
    brushSize = $bindable(),
    ready,
    measuring,
    info,
    memoryMB,
    frame,
    stampMs,
    dabsPerSecond,
    readRows,
    onbuild,
    onresetstats,
    onmeasure,
    onclear,
    onfit,
  }: {
    docSize: number;
    layerCount: number;
    benchRate: number;
    brushSize: number;
    ready: boolean;
    measuring: boolean;
    info: GpuInfo;
    memoryMB: number;
    frame: FrameReport;
    stampMs: number;
    dabsPerSecond: number;
    readRows: ReadRow[];
    onbuild: () => void;
    onresetstats: () => void;
    onmeasure: () => void;
    onclear: () => void;
    onfit: () => void;
  } = $props();

  const fmt = (v: number, digits = 1) => v.toFixed(digits);
</script>

<aside>
  <h2>GPU</h2>
  <dl>
    <dt>renderer</dt>
    <dd>{info.renderer}</dd>
    <dt>texture max</dt>
    <dd>{info.maxTexture}</dd>
  </dl>
  <p class="gpu">{info.gpu}</p>

  <h2>Document</h2>
  <label>
    Size
    <select bind:value={docSize} onchange={onbuild} disabled={!ready}>
      {#each SIZES as size (size)}
        <option value={size} disabled={info.maxTexture > 0 && size > info.maxTexture}>
          {size} × {size}
        </option>
      {/each}
    </select>
  </label>
  <label>
    Layers
    <select bind:value={layerCount} onchange={onbuild} disabled={!ready}>
      {#each LAYER_COUNTS as count (count)}
        <option value={count}>{count}</option>
      {/each}
    </select>
  </label>
  <dl>
    <dt>estimated memory</dt>
    <dd>{fmt(memoryMB, 0)} MB</dd>
  </dl>

  <h2>Brush</h2>
  <label>
    Size: {brushSize} px
    <input type="range" min="2" max="300" bind:value={brushSize} />
  </label>
  <label>
    Benchmark
    <select bind:value={benchRate} onchange={onresetstats}>
      {#each BENCH_RATES as rate (rate)}
        <option value={rate}>{rate === 0 ? "off" : `${rate} dabs / frame`}</option>
      {/each}
    </select>
  </label>

  <h2>Measurements</h2>
  <dl>
    <dt>fps</dt>
    <dd>{fmt(frame.fps, 0)}</dd>
    <dt>frame avg</dt>
    <dd>{fmt(frame.avg)} ms</dd>
    <dt>frame p95</dt>
    <dd>{fmt(frame.p95)} ms</dd>
    <dt>frame max</dt>
    <dd>{fmt(frame.max)} ms</dd>
    <dt>stamping (CPU)</dt>
    <dd>{fmt(stampMs, 2)} ms</dd>
    <dt>dabs / s</dt>
    <dd>{fmt(dabsPerSecond, 0)}</dd>
  </dl>

  <h2>GPU → CPU readback</h2>
  <button onclick={onmeasure} disabled={!ready || measuring}>
    {measuring ? "Measuring…" : "Measure"}
  </button>
  {#each readRows as row (row.zone)}
    <h3>{row.zone} × {row.zone} ({fmt((row.zone * row.zone * 4) / (1024 * 1024), 2)} MB)</h3>
    <dl>
      <dt>blocking, GPU idle</dt>
      <dd>{fmt(row.idle, 2)} ms</dd>
      <dt>blocking, after a stroke</dt>
      <dd>{fmt(row.afterStroke, 2)} ms</dd>
      <dt>async, blocked</dt>
      <dd>{fmt(row.asyncBlocked, 2)} ms</dd>
      <dt>async, available after</dt>
      <dd>{fmt(row.asyncTotal, 1)} ms</dd>
    </dl>
  {/each}

  <div class="actions">
    <button onclick={onclear} disabled={!ready}>Clear</button>
    <button onclick={onfit} disabled={!ready}>Fit</button>
  </div>
  <p class="hint">Wheel: zoom. Draw with the pen on the canvas.</p>
</aside>

<style>
  aside {
    width: 260px;
    padding: 12px;
    overflow-y: auto;
    background: #26262a;
    border-left: 1px solid #333;
  }

  h2 {
    margin: 14px 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
  }

  h3 {
    margin: 10px 0 4px;
    font-size: 11px;
    font-weight: 600;
    color: #aaa;
  }

  aside > button {
    width: 100%;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0;
  }

  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .gpu,
  .hint {
    color: #777;
    font-size: 11px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  select,
  input {
    width: 100%;
  }

  select {
    padding: 4px;
    background: #333;
    color: #ddd;
    border: 1px solid #444;
    border-radius: 4px;
  }

  .actions {
    display: flex;
    gap: 6px;
    margin-top: 16px;
  }

  button {
    flex: 1;
    padding: 6px;
    background: #333;
    color: #ddd;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
  }

  button:hover {
    background: #3c3c40;
  }
</style>
