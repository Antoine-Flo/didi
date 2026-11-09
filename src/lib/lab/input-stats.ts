// Accumulates measurements about pen input during a stroke.
// Used by the tablet lab page to evaluate what the webview really delivers.

export interface InputSample {
  /** Event timestamp in ms (same clock as performance.now()). */
  time: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
}

export interface InputReport {
  dispatchedEvents: number;
  samples: number;
  /** Average number of samples carried by one dispatched event. */
  samplesPerEvent: number;
  /** Sample rate in Hz, measured over the stroke duration. */
  sampleRate: number;
  pressureMin: number;
  pressureMax: number;
  /** Number of distinct pressure values: very few means no real pressure. */
  pressureLevels: number;
  tiltMax: number;
  /** Average delay between the event timestamp and its handling, in ms. */
  latencyAvg: number;
  latencyMax: number;
}

export class InputStats {
  private dispatched = 0;
  private count = 0;
  private firstTime = Infinity;
  private lastTime = -Infinity;
  private pressureMin = Infinity;
  private pressureMax = -Infinity;
  private pressures = new Set<number>();
  private tiltMax = 0;
  private latencySum = 0;
  private latencyMax = 0;

  /** Records one dispatched event and the samples it carries. */
  record(samples: InputSample[], handledAt: number, dispatchedAt: number) {
    if (samples.length === 0) {
      return;
    }
    this.dispatched++;
    const latency = Math.max(0, handledAt - dispatchedAt);
    this.latencySum += latency;
    this.latencyMax = Math.max(this.latencyMax, latency);
    for (const s of samples) {
      this.count++;
      this.firstTime = Math.min(this.firstTime, s.time);
      this.lastTime = Math.max(this.lastTime, s.time);
      this.pressureMin = Math.min(this.pressureMin, s.pressure);
      this.pressureMax = Math.max(this.pressureMax, s.pressure);
      this.pressures.add(s.pressure);
      this.tiltMax = Math.max(this.tiltMax, Math.abs(s.tiltX), Math.abs(s.tiltY));
    }
  }

  report(): InputReport {
    const duration = this.lastTime - this.firstTime;
    const empty = this.count === 0;
    return {
      dispatchedEvents: this.dispatched,
      samples: this.count,
      samplesPerEvent: this.dispatched ? this.count / this.dispatched : 0,
      sampleRate: duration > 0 ? ((this.count - 1) / duration) * 1000 : 0,
      pressureMin: empty ? 0 : this.pressureMin,
      pressureMax: empty ? 0 : this.pressureMax,
      pressureLevels: this.pressures.size,
      tiltMax: this.tiltMax,
      latencyAvg: this.dispatched ? this.latencySum / this.dispatched : 0,
      latencyMax: this.latencyMax,
    };
  }
}
