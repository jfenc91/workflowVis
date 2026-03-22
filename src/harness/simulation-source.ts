// Simulation data source: wraps clock, streamer, correlator, and run loading.

import type { Capabilities, Pipeline, PipelineEvent, RunDefinition } from '../types.js';
import type { DagModel } from '../data/dag-builder.js';
import type { FrameState } from '../data/data-source.js';
import { DataSource } from '../data/data-source.js';
import { RUNS } from '../data/runs.js';
import { loadPipelines } from '../data/pipeline-loader.js';
import { loadEvents } from '../data/event-store.js';
import { buildDag } from '../data/dag-builder.js';
import { EventCorrelator } from '../data/event-correlator.js';
import { SimulationClock } from './clock.js';
import { EventStreamer } from './event-streamer.js';

export interface PlaybackState {
  playing: boolean;
  progress: number;
  elapsed: number;
  totalDuration: number;
  currentTime: number;
  deliveredCount: number;
  totalEvents: number;
}

export class SimulationSource extends DataSource {
  clock: SimulationClock;
  streamer: EventStreamer | null;
  correlator: EventCorrelator | null;
  dagModel: DagModel | null;
  events: PipelineEvent[];
  rawPipelines: Map<string, unknown>;
  _nodeEventListeners: ((nodeId: string, event: PipelineEvent) => void)[];
  _dynamicBindListeners: ((parentNodeId: string, childPipelineName: string) => void)[];
  _endListeners: (() => void)[];

  constructor() {
    super();
    this.clock = new SimulationClock();
    this.streamer = null;
    this.correlator = null;
    this.dagModel = null;
    this.events = [];
    this.rawPipelines = new Map();
    this._nodeEventListeners = [];
    this._dynamicBindListeners = [];
    this._endListeners = [];

    this.clock.onChange((type) => {
      if (type === 'end') {
        for (const fn of this._endListeners) fn();
      }
    });
  }

  get runs(): Record<string, RunDefinition> {
    return RUNS;
  }

  get capabilities(): Capabilities {
    return {
      runPicker: true,
    };
  }

  async load(runKey: string): Promise<DagModel | null> {
    const run = RUNS[runKey];
    if (!run) return null;

    const [pipelineResult, events] = await Promise.all([
      loadPipelines(run.pipelines),
      loadEvents(run.events),
    ]);

    this.rawPipelines = pipelineResult.raw;
    this.dagModel = buildDag(pipelineResult.pipelines);
    this.events = events;

    // Build candidate pipelines map from pipelines not used in the DAG
    const usedPipelineNames = new Set<string>();
    for (const node of this.dagModel.nodes.values()) {
      usedPipelineNames.add(node.pipelineName);
    }
    const candidatePipelines = new Map<string, Pipeline>();
    for (const p of pipelineResult.pipelines) {
      if (!usedPipelineNames.has(p.name)) {
        candidatePipelines.set(p.name, p);
      }
    }

    this.correlator = new EventCorrelator(
      this.dagModel,
      candidatePipelines.size > 0 ? candidatePipelines : undefined,
    );
    this.streamer = new EventStreamer(events, this.correlator);

    if (events.length > 0) {
      this.clock.setTimeRange(events[0].timestamp, events[events.length - 1].timestamp);
    }
    this.clock.pause();

    // Wire node-event listeners through correlator
    this.correlator.onChange((nodeId, event) => {
      for (const fn of this._nodeEventListeners) fn(nodeId, event);
    });

    // Wire dynamic bind listeners through correlator
    this.correlator.onDynamicBind((parentNodeId, childPipelineName) => {
      for (const fn of this._dynamicBindListeners) fn(parentNodeId, childPipelineName);
    });

    return this.dagModel;
  }

  dispose(): void {
    this.clock.pause();
    this._nodeEventListeners = [];
    this._dynamicBindListeners = [];
    this._endListeners = [];
  }

  tick(rafTime: number): void {
    this.clock.tick(rafTime);

    if (this.streamer && this.clock.simTime > 0) {
      this.streamer.deliverUpTo(this.clock.simTime);
    }
  }

  // Library contract: minimal frame state
  get frameState(): FrameState {
    return {
      currentTime: this.clock.simTime,
    };
  }

  // Harness-only: full playback state for timeline UI
  get playbackState(): PlaybackState {
    return {
      playing: this.clock.playing,
      progress: this.clock.progress,
      elapsed: this.clock.elapsed,
      totalDuration: this.clock.totalDuration,
      currentTime: this.clock.simTime,
      deliveredCount: this.streamer?.deliveredCount ?? 0,
      totalEvents: this.streamer?.totalEvents ?? 0,
    };
  }

  play(): void {
    this.clock.play();
  }

  pause(): void {
    this.clock.pause();
  }

  togglePlayPause(): void {
    this.clock.togglePlayPause();
    if (this.clock.playing) this.clock.lastRealTime = performance.now();
  }

  setSpeed(speed: number): void {
    this.clock.setSpeed(speed);
  }

  seekFraction(fraction: number): void {
    this.clock.seekFraction(fraction);
    this.clock.pause();
    if (this.streamer && this.dagModel) {
      this.streamer.seekTo(this.clock.simTime, this.dagModel);
    }
  }

  reset(): void {
    this.clock.reset();
    if (this.streamer && this.dagModel) {
      this.streamer.reset(this.dagModel);
    }
  }

  onNodeEvent(fn: (nodeId: string, event: PipelineEvent) => void): void {
    this._nodeEventListeners.push(fn);
  }

  onDynamicBind(fn: (parentNodeId: string, childPipelineName: string) => void): void {
    this._dynamicBindListeners.push(fn);
  }

  onEnd(fn: () => void): void {
    this._endListeners.push(fn);
  }
}
