// Library entry point
export { PipelineVisualizer } from './pipeline-visualizer.js';
export { DataSource } from './data/data-source.js';
export type { FrameState } from './data/data-source.js';
export { buildDag, DagModel, DagNode, DagEdge } from './data/dag-builder.js';
export { EventCorrelator } from './data/event-correlator.js';
export type { PipelineEvent, Dataset, Pipeline, Task } from './types.js';
