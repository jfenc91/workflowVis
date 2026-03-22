// Tests for event streaming and clock

import { describe, it, expect } from './test-runner.js';
import { buildDag } from '../src/data/dag-builder.js';
import { loadPipelines } from '../src/data/pipeline-loader.js';
import { loadEvents } from '../src/data/event-store.js';
import { EventCorrelator } from '../src/data/event-correlator.js';
import { EventStreamer } from '../src/harness/event-streamer.js';
import { SimulationClock } from '../src/harness/clock.js';
import { relayout } from '../src/layout/group-layout.js';
import { RUNS } from '../src/data/runs.js';

export async function runEventStreamingTests(): Promise<void> {
  const { pipelines: eltPipelines } = await loadPipelines(RUNS.elt.pipelines);
  const eltEvents = await loadEvents(RUNS.elt.events);

  describe('SimulationClock', () => {
    it('should initialize with default values', () => {
      const clock = new SimulationClock();
      expect(clock.playing).toBe(false);
      expect(clock.speed).toBe(50);
      expect(clock.progress).toBe(0);
    });

    it('should set time range correctly', () => {
      const clock = new SimulationClock();
      clock.setTimeRange(1000, 5000);
      expect(clock.simTime).toBe(1000);
      expect(clock.baseTime).toBe(1000);
      expect(clock.endTime).toBe(5000);
      expect(clock.totalDuration).toBe(4000);
    });

    it('should advance simTime on tick when playing', () => {
      const clock = new SimulationClock();
      clock.setTimeRange(0, 100000);
      clock.setSpeed(10);
      clock.play();

      const startReal = performance.now();
      clock.lastRealTime = startReal;

      // Simulate a 16ms frame
      clock.tick(startReal + 16);

      // simTime should advance by ~16ms * 10 = 160ms
      expect(clock.simTime).toBeGreaterThan(0);
      expect(clock.simTime).toBeLessThan(1000); // sanity check
    });

    it('should not advance when paused', () => {
      const clock = new SimulationClock();
      clock.setTimeRange(0, 100000);
      clock.pause();

      const t = clock.simTime;
      clock.tick(performance.now() + 100);
      expect(clock.simTime).toBe(t);
    });

    it('should clamp simTime at endTime', () => {
      const clock = new SimulationClock();
      clock.setTimeRange(0, 100);
      clock.setSpeed(10000);
      clock.play();
      clock.lastRealTime = performance.now();
      clock.tick(performance.now() + 50);

      expect(clock.simTime).toBeLessThanOrEqual(clock.endTime);
      expect(clock.playing).toBe(false); // auto-pauses at end
    });

    it('should seek to specific time', () => {
      const clock = new SimulationClock();
      clock.setTimeRange(0, 10000);
      clock.seek(5000);
      expect(clock.simTime).toBe(5000);
    });

    it('should clamp seek within range', () => {
      const clock = new SimulationClock();
      clock.setTimeRange(1000, 5000);
      clock.seek(0);
      expect(clock.simTime).toBe(1000);
      clock.seek(99999);
      expect(clock.simTime).toBe(5000);
    });

    it('should seek by fraction', () => {
      const clock = new SimulationClock();
      clock.setTimeRange(0, 10000);
      clock.seekFraction(0.5);
      expect(clock.simTime).toBe(5000);
    });

    it('should report progress as fraction', () => {
      const clock = new SimulationClock();
      clock.setTimeRange(0, 10000);
      clock.seek(2500);
      expect(clock.progress).toBe(0.25);
    });

    it('should reset to start', () => {
      const clock = new SimulationClock();
      clock.setTimeRange(1000, 5000);
      clock.seek(3000);
      clock.reset();
      expect(clock.simTime).toBe(1000);
      expect(clock.playing).toBe(false);
    });
  });

  describe('EventStreamer - Delivery', () => {
    it('should deliver events up to simulation time', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);
      const streamer = new EventStreamer(eltEvents, corr);

      // Deliver events up to first event time + 1 second
      const firstTime = eltEvents[0].timestamp;
      streamer.deliverUpTo(firstTime + 1000);

      expect(streamer.deliveredCount).toBeGreaterThan(0);
      expect(streamer.deliveredCount).toBeLessThanOrEqual(eltEvents.length);
    });

    it('should deliver all events when simTime exceeds last event', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);
      const streamer = new EventStreamer(eltEvents, corr);

      const lastTime = eltEvents[eltEvents.length - 1].timestamp;
      streamer.deliverUpTo(lastTime + 1);

      expect(streamer.deliveredCount).toBe(eltEvents.length);
    });

    it('should not deliver events before simTime', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);
      const streamer = new EventStreamer(eltEvents, corr);

      // Deliver with simTime before any event
      streamer.deliverUpTo(eltEvents[0].timestamp - 1000);

      expect(streamer.deliveredCount).toBe(0);
    });

    it('should fire onEvent callbacks', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);
      const streamer = new EventStreamer(eltEvents, corr);

      const received: unknown[] = [];
      streamer.onEvent(e => received.push(e));

      streamer.deliverUpTo(eltEvents[eltEvents.length - 1].timestamp + 1);

      expect(received.length).toBe(eltEvents.length);
    });
  });

  describe('EventStreamer - Seek', () => {
    it('should rebuild state correctly when seeking backward', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);
      const streamer = new EventStreamer(eltEvents, corr);

      // Deliver all events
      streamer.deliverUpTo(eltEvents[eltEvents.length - 1].timestamp + 1);
      expect(streamer.deliveredCount).toBe(eltEvents.length);

      // Seek to midpoint
      const midTime = eltEvents[Math.floor(eltEvents.length / 2)].timestamp;
      streamer.seekTo(midTime, dag);

      // Some events should have been replayed, but not all
      expect(streamer.deliveredCount).toBeLessThan(eltEvents.length);
      expect(streamer.deliveredCount).toBeGreaterThan(0);
    });

    it('should reset all statuses when seeking to before first event', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);
      const streamer = new EventStreamer(eltEvents, corr);

      // Deliver all
      streamer.deliverUpTo(eltEvents[eltEvents.length - 1].timestamp + 1);

      // Seek to before first event
      streamer.seekTo(eltEvents[0].timestamp - 1, dag);

      expect(streamer.deliveredCount).toBe(0);
      for (const node of dag.allNodes()) {
        expect(node.status).toBe('pending');
      }
    });

    it('should reset cursor on reset', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);
      const streamer = new EventStreamer(eltEvents, corr);

      streamer.deliverUpTo(eltEvents[eltEvents.length - 1].timestamp + 1);
      streamer.reset(dag);

      expect(streamer.deliveredCount).toBe(0);
      expect(streamer.cursor).toBe(0);
    });
  });
}
