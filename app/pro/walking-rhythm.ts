/** Confirms a short, regular sequence before counting motion as walking.
 * This filters isolated bumps; rhythmic shaking can still imitate walking.
 */
export class WalkingRhythmCounter {
  private gravity = 9.81;
  private filtered = 0;
  private lastSample: number | null = null;
  private pulseStart: number | null = null;
  private peak = 0;
  private peaks: number[] = [];
  private confirmed = false;

  get walking() { return this.confirmed; }

  sample(magnitude: number, time: number): number {
    if (!Number.isFinite(magnitude) || !Number.isFinite(time)) return 0;
    const dt = this.lastSample === null ? 20 : time - this.lastSample;
    if (dt <= 0) return 0;
    if (dt > 1500) {
      this.peaks = [];
      this.confirmed = false;
      this.pulseStart = null;
      this.filtered = 0;
      this.gravity = 9.81;
    }
    this.lastSample = time;
    this.gravity += (magnitude - this.gravity) * (1 - Math.exp(-Math.min(dt, 100) / 800));
    this.filtered += (magnitude - this.gravity - this.filtered) * (1 - Math.exp(-Math.min(dt, 100) / 45));
    if (this.peaks.length && time - this.peaks[this.peaks.length - 1] > 1500) {
      this.peaks = [];
      this.confirmed = false;
    }
    if (this.pulseStart === null) {
      if (this.filtered > 1.15) { this.pulseStart = time; this.peak = this.filtered; }
      return 0;
    }
    this.peak = Math.max(this.peak, this.filtered);
    if (this.filtered > .25) return 0;
    const started = this.pulseStart;
    this.pulseStart = null;
    const width = time - started;
    if (width < 60 || width > 450 || this.peak > 7) return 0;
    const previous = this.peaks[this.peaks.length - 1];
    const interval = started - previous;
    if (previous !== undefined && interval < 350) {
      this.peaks = [started];
      this.confirmed = false;
      return 0;
    }
    if (previous !== undefined && interval > 1250) {
      this.peaks = [];
      this.confirmed = false;
    }
    if (this.peaks.length >= 2) {
      const cadence = previous - this.peaks[this.peaks.length - 2];
      if (Math.abs(interval - cadence) > cadence * .35) {
        this.peaks = [previous];
        this.confirmed = false;
      }
    }
    this.peaks.push(started);
    this.peaks = this.peaks.slice(-3);
    if (this.peaks.length < 3) return 0;
    const count = this.confirmed ? 1 : 3;
    this.confirmed = true;
    return count;
  }
}
