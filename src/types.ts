// Shared type definitions for the pipeline visualizer

// --- Domain types ---

export interface DatasetField {
  name: string;
  type: string;
}

export interface DatasetStats {
  rowCount?: number;
  size?: number;
  columnMetrics?: Record<string, unknown>;
}

export interface Dataset {
  namespace: string;
  name: string;
  fields: DatasetField[] | null;
  stats: DatasetStats | null;
}

export interface EventError {
  message: string;
  language: string | null;
  stackTrace: string | null;
}

export interface PipelineEvent {
  timestamp: number;
  eventTime: string;
  eventType: 'START' | 'COMPLETE' | 'FAIL';
  runId: string;
  jobName: string;
  jobNamespace: string;
  pipelineName: string;
  taskName: string | null;
  parentRunId: string | null;
  parentJobName: string | null;
  jobType: string | null;
  error: EventError | null;
  sql: string | null;
  inputs: Dataset[];
  outputs: Dataset[];
  _raw?: unknown;
}

export interface Attempt {
  runId: string;
  status: string;
  startTime: number | null;
  endTime: number | null;
  error: EventError | null;
}

export interface Task {
  name: string;
  displayName: string;
  fqn: string;
  description: string;
  taskType: string;
  taskSQL: string | null;
  downstreamTasks: string[];
}

export interface Pipeline {
  id: string;
  name: string;
  displayName: string;
  fqn: string;
  description: string;
  scheduleInterval: string | null;
  concurrency: number;
  tags: string[];
  tasks: Task[];
}

export interface RunDefinition {
  label: string;
  pipelines: string[];
  events: string[];
}

// --- DataSource abstractions ---

export interface Capabilities {
  runPicker: boolean;
}

export type NodeStatus = 'pending' | 'running' | 'complete' | 'failed';

// --- Color system ---

export interface TaskTypeColorSet {
  bg: string;
  accent: string;
  text: string;
  gradient: [string, string];
}

export interface StatusColorSet {
  fill: string;
  stroke: string;
  badge: string;
  glow: string;
}

export interface GroupColorSet {
  bg: string;
  border: string;
  headerBg: string;
}

export interface NodeColorSet {
  bg: string;
  text: string;
  subtext: string;
  duration: string;
  selectedStroke: string;
}

export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ParticleColorSet {
  edge: RGBAColor;
  glow: RGBAColor;
  ripple: RGBAColor;
  fail: RGBAColor;
  complete: RGBAColor;
  ambient: RGBAColor;
}

// --- Layout options ---

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  layerSpacing?: number;
  nodeSpacing?: number;
  groupPadding?: number;
  groupHeader?: number;
}

// --- Geometry ---

export interface Point {
  x: number;
  y: number;
}

export interface BezierPoints {
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
}

// --- WebGL ---

export interface Particle {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
  size: number;
  life: number;
  maxLife: number;
  vx?: number;
  vy?: number;
}

export interface Ripple {
  x: number;
  y: number;
  startTime: number;
  duration: number;
}
