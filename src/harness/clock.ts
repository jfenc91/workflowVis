// Simulation clock with speed multiplier

type ClockEventType = 'seek' | 'reset' | 'end';

export class SimulationClock {
  simTime: number;
  baseTime: number;
  endTime: number;
  speed: number;
  playing: boolean;
  lastRealTime: number;
  listeners: ((type: ClockEventType, simTime: number) => void)[];

  constructor() {
    this.simTime = 0;
    this.baseTime = 0;
    this.endTime = 0;
    this.speed = 50;
    this.playing = false;
    this.lastRealTime = 0;
    this.listeners = [];
  }

  setTimeRange(startMs: number, endMs: number): void {
    this.baseTime = startMs;
    this.endTime = endMs;
    this.simTime = startMs;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  play(): void {
    this.playing = true;
    this.lastRealTime = performance.now();
  }

  pause(): void {
    this.playing = false;
  }

  togglePlayPause(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(simTime: number): void {
    this.simTime = Math.max(this.baseTime, Math.min(this.endTime, simTime));
    for (const fn of this.listeners) fn('seek', this.simTime);
  }

  seekFraction(fraction: number): void {
    const range = this.endTime - this.baseTime;
    this.seek(this.baseTime + range * fraction);
  }

  reset(): void {
    this.simTime = this.baseTime;
    this.playing = false;
    for (const fn of this.listeners) fn('reset', this.simTime);
  }

  // Call on each animation frame with the rAF timestamp
  tick(realTime: number): boolean {
    if (!this.playing) return false;

    const dt = realTime - this.lastRealTime;
    this.lastRealTime = realTime;

    // Clamp dt to avoid huge jumps (e.g., tab was background)
    const clampedDt = Math.min(dt, 100);
    this.simTime += clampedDt * this.speed;

    if (this.simTime >= this.endTime) {
      this.simTime = this.endTime;
      this.playing = false;
      for (const fn of this.listeners) fn('end', this.simTime);
      return false;
    }

    return true;
  }

  // Current progress as fraction [0, 1]
  get progress(): number {
    const range = this.endTime - this.baseTime;
    if (range <= 0) return 0;
    return (this.simTime - this.baseTime) / range;
  }

  // Elapsed simulation time from start
  get elapsed(): number {
    return this.simTime - this.baseTime;
  }

  // Total simulation duration
  get totalDuration(): number {
    return this.endTime - this.baseTime;
  }

  onChange(fn: (type: ClockEventType, simTime: number) => void): void {
    this.listeners.push(fn);
  }
}
