// Rolling statistics over the most recent frame times.

export interface FrameReport {
  fps: number;
  avg: number;
  p95: number;
  max: number;
}

export class FrameStats {
  private values: number[] = [];

  constructor(private readonly size = 120) {}

  push(ms: number) {
    this.values.push(ms);
    if (this.values.length > this.size) this.values.shift();
  }

  reset() {
    this.values = [];
  }

  report(): FrameReport {
    const n = this.values.length;
    if (n === 0) return { fps: 0, avg: 0, p95: 0, max: 0 };
    const sorted = [...this.values].sort((a, b) => a - b);
    const avg = sorted.reduce((sum, v) => sum + v, 0) / n;
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      avg,
      p95: sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)],
      max: sorted[n - 1],
    };
  }
}
