// Base class / interface for pipeline visualization data sources.
// Subclasses provide data, frame state, and event delivery.

import type { Capabilities, PipelineEvent, RunDefinition } from '../types.js';
import type { DagModel } from './dag-builder.js';

export interface FrameState {
  currentTime: number;
}

export class DataSource {
  // Which UI controls this source supports
  get capabilities(): Capabilities {
    return {
      runPicker: false,
    };
  }

  // Available run options for the picker: { key: { label } }
  get runs(): Record<string, RunDefinition> {
    return {};
  }

  // Load data for a given run key. Returns a DagModel.
  async load(_config: string): Promise<DagModel | null> { return null; }

  // Cleanup (close websocket, clear timers, etc.)
  dispose(): void {}

  // Called every animation frame with the rAF timestamp
  tick(_rafTime: number): void {}

  // Current frame state snapshot, read each frame
  get frameState(): FrameState {
    return {
      currentTime: 0,
    };
  }

  // Register callback for node status changes: fn(nodeId, event)
  onNodeEvent(_fn: (nodeId: string, event: PipelineEvent) => void): void {}
}
