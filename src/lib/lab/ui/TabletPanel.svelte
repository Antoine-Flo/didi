<script lang="ts">
  // Side panel of the tablet lab page: support, live readout, last stroke and buttons.

  import type { InputReport } from "#lib/lab/input-stats.js";
  import type { Live, Source, Support } from "#lib/lab/tablet-report.js";

  let {
    drawSource = $bindable(),
    native,
    support,
    live,
    reports,
    buttonLog,
    copyState,
    onclear,
    oncopy,
  }: {
    drawSource: Source;
    native: boolean;
    support: Support;
    live: Record<Source, Live>;
    reports: Record<Source, InputReport | null>;
    buttonLog: string[];
    copyState: string | null;
    onclear: () => void;
    oncopy: () => void;
  } = $props();

  const fmt = (v: number, digits = 3) => v.toFixed(digits);
</script>

<aside>
  <h2>Support</h2>
  <dl>
    {#each Object.entries(support) as [name, ok] (name)}
      <dt>{name}</dt>
      <dd class:ok class:ko={!ok}>{ok ? "yes" : "no"}</dd>
    {/each}
  </dl>

  {#if native}
    <h2>Draw with</h2>
    <div class="toggle">
      <button class:active={drawSource === "native"} onclick={() => (drawSource = "native")}>
        Native
      </button>
      <button class:active={drawSource === "dom"} onclick={() => (drawSource = "dom")}>
        DOM
      </button>
    </div>
  {/if}

  <h2>Live</h2>
  <dl class="cols">
    <dt></dt>
    <dd class="head">DOM</dd>
    <dd class="head">Native</dd>
    <dt>type</dt>
    <dd>{live.dom.type}</dd>
    <dd>{live.native.type}</dd>
    <dt>pressure</dt>
    <dd>{fmt(live.dom.pressure)}</dd>
    <dd>{fmt(live.native.pressure)}</dd>
    <dt>tilt X</dt>
    <dd>{fmt(live.dom.tiltX, 1)}</dd>
    <dd>{fmt(live.native.tiltX, 1)}</dd>
    <dt>tilt Y</dt>
    <dd>{fmt(live.dom.tiltY, 1)}</dd>
    <dd>{fmt(live.native.tiltY, 1)}</dd>
    <dt>buttons</dt>
    <dd>{live.dom.buttons}</dd>
    <dd>{live.native.buttons}</dd>
  </dl>

  <h2>Last stroke</h2>
  {#if reports.dom || reports.native}
    {@const d = reports.dom}
    {@const n = reports.native}
    <dl class="cols">
      <dt></dt>
      <dd class="head">DOM</dd>
      <dd class="head">Native</dd>
      <dt>samples</dt>
      <dd>{d?.samples ?? "-"}</dd>
      <dd>{n?.samples ?? "-"}</dd>
      <dt>per event</dt>
      <dd>{d ? fmt(d.samplesPerEvent, 2) : "-"}</dd>
      <dd>{n ? fmt(n.samplesPerEvent, 2) : "-"}</dd>
      <dt>rate (Hz)</dt>
      <dd>{d ? fmt(d.sampleRate, 0) : "-"}</dd>
      <dd>{n ? fmt(n.sampleRate, 0) : "-"}</dd>
      <dt>pressure min</dt>
      <dd>{d ? fmt(d.pressureMin) : "-"}</dd>
      <dd>{n ? fmt(n.pressureMin) : "-"}</dd>
      <dt>pressure max</dt>
      <dd>{d ? fmt(d.pressureMax) : "-"}</dd>
      <dd>{n ? fmt(n.pressureMax) : "-"}</dd>
      <dt>levels</dt>
      <dd>{d?.pressureLevels ?? "-"}</dd>
      <dd>{n?.pressureLevels ?? "-"}</dd>
      <dt>tilt max</dt>
      <dd>{d ? fmt(d.tiltMax, 1) : "-"}</dd>
      <dd>{n ? fmt(n.tiltMax, 1) : "-"}</dd>
      <dt>latency avg (ms)</dt>
      <dd>{d ? fmt(d.latencyAvg, 1) : "-"}</dd>
      <dd>{n ? fmt(n.latencyAvg, 1) : "-"}</dd>
      <dt>latency max (ms)</dt>
      <dd>{d ? fmt(d.latencyMax, 1) : "-"}</dd>
      <dd>{n ? fmt(n.latencyMax, 1) : "-"}</dd>
    </dl>
  {:else}
    <p class="hint">Draw a stroke on the left area.</p>
  {/if}

  <h2>Buttons</h2>
  <ul>
    {#each buttonLog as line, i (i)}
      <li>{line}</li>
    {:else}
      <li class="hint">Press the pen buttons.</li>
    {/each}
  </ul>

  <div class="actions">
    <button onclick={onclear}>Clear</button>
    <button onclick={oncopy}>{copyState ?? "Copy report"}</button>
  </div>
</aside>

<style>
  aside {
    width: 300px;
    padding: 12px;
    overflow-y: auto;
    background: #26262a;
    border-left: 1px solid #333;
  }

  h2 {
    margin: 12px 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0;
  }

  dl.cols {
    grid-template-columns: auto 1fr 1fr;
  }

  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .head {
    color: #888;
  }

  .ok {
    color: #7c7;
  }

  .ko {
    color: #e77;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    font-family: monospace;
    font-size: 11px;
  }

  .hint {
    color: #777;
  }

  .toggle,
  .actions {
    display: flex;
    gap: 6px;
  }

  .actions {
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

  button.active {
    background: #3a4a66;
    border-color: #5a7ab0;
  }
</style>
