// Time-sorted event delivery based on simulation clock

import type { PipelineEvent } from '../types.js';
import type { EventCorrelator } from '../data/event-correlator.js';
import type { DagModel } from '../data/dag-builder.js';

export class EventStreamer {
  events: PipelineEvent[];
  correlator: EventCorrelator;
  cursor: number;
  deliveredCount: number;
  listeners: ((event: PipelineEvent) => void)[];

  constructor(events: PipelineEvent[], correlator: EventCorrelator) {
    this.events = events;
    this.correlator = correlator;
    this.cursor = 0;
    this.deliveredCount = 0;
    this.listeners = [];
  }

  onEvent(fn: (event: PipelineEvent) => void): void {
    this.listeners.push(fn);
  }

  // Deliver all events up to the current simulation time
  deliverUpTo(simTime: number): boolean {
    let delivered = false;
    while (this.cursor < this.events.length &&
           this.events[this.cursor].timestamp <= simTime) {
      const event = this.events[this.cursor];
      this.correlator.applyEvent(event);
      this.deliveredCount++;
      for (const fn of this.listeners) fn(event);
      this.cursor++;
      delivered = true;
    }
    return delivered;
  }

  // Seek to a specific time: reset and replay all events up to that point
  seekTo(simTime: number, dagModel: DagModel): void {
    dagModel.resetAllStatuses();
    this.cursor = 0;
    this.deliveredCount = 0;
    this.deliverUpTo(simTime);
  }

  // Reset to beginning
  reset(dagModel: DagModel): void {
    dagModel.resetAllStatuses();
    this.cursor = 0;
    this.deliveredCount = 0;
  }

  get totalEvents(): number {
    return this.events.length;
  }

  get progress(): number {
    if (this.events.length === 0) return 0;
    return this.deliveredCount / this.events.length;
  }
}
