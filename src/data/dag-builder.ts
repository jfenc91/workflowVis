// Build hierarchical DAG from pipeline definitions

import type { Pipeline, PipelineEvent, EventError, Dataset, Attempt, NodeStatus } from '../types.js';

export class DagNode {
  id: string;
  displayName: string;
  taskType: string;
  description: string;
  fqn: string;
  pipelineName: string;
  taskSQL: string | null;

  // Status tracking
  status: NodeStatus;
  startTime: number | null;
  endTime: number | null;
  duration: number | null;
  attempts: Attempt[];
  events: PipelineEvent[];
  datasets: { inputs: Dataset[]; outputs: Dataset[] };
  error: EventError | null;

  // Graph structure
  children: DagNode[];
  parent: DagNode | null;
  edges: string[];
  inEdges: string[];

  // Layout (filled by dagre-layout)
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;

  // Sub-pipeline state
  expanded: boolean;
  isSubPipeline: boolean;
  childPipelineFqn: string | null;

  constructor(id: string, { displayName, taskType, description, fqn, pipelineName, taskSQL }: {
    displayName: string;
    taskType: string;
    description?: string;
    fqn?: string;
    pipelineName: string;
    taskSQL?: string | null;
  }) {
    this.id = id;
    this.displayName = displayName;
    this.taskType = taskType;
    this.description = description || '';
    this.fqn = fqn || '';
    this.pipelineName = pipelineName;
    this.taskSQL = taskSQL || null;

    // Status tracking
    this.status = 'pending';
    this.startTime = null;
    this.endTime = null;
    this.duration = null;
    this.attempts = [];
    this.events = [];
    this.datasets = { inputs: [], outputs: [] };
    this.error = null;

    // Graph structure
    this.children = [];
    this.parent = null;
    this.edges = [];
    this.inEdges = [];

    // Layout (filled by dagre-layout)
    this.x = 0;
    this.y = 0;
    this.width = 200;
    this.height = 60;
    this.layer = 0;

    // Sub-pipeline state
    this.expanded = true;
    this.isSubPipeline = taskType === 'SubPipeline';
    this.childPipelineFqn = null;
  }

  resetStatus(): void {
    this.status = 'pending';
    this.startTime = null;
    this.endTime = null;
    this.duration = null;
    this.attempts = [];
    this.events = [];
    this.datasets = { inputs: [], outputs: [] };
    this.error = null;
    for (const child of this.children) {
      child.resetStatus();
    }
  }
}

export class DagEdge {
  id: string;
  sourceId: string;
  targetId: string;
  status: NodeStatus;

  constructor(id: string, sourceId: string, targetId: string) {
    this.id = id;
    this.sourceId = sourceId;
    this.targetId = targetId;
    this.status = 'pending';
  }
}

export class DagModel {
  nodes: Map<string, DagNode>;
  edges: Map<string, DagEdge>;
  rootNodes: string[];
  rootPipelineName: string;

  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.rootNodes = [];
    this.rootPipelineName = '';
  }

  getNode(id: string): DagNode | undefined { return this.nodes.get(id); }
  getEdge(id: string): DagEdge | undefined { return this.edges.get(id); }

  allNodes(): DagNode[] { return [...this.nodes.values()]; }
  allEdges(): DagEdge[] { return [...this.edges.values()]; }

  // Get all leaf nodes (including inside expanded groups)
  allVisibleNodes(): DagNode[] {
    const visible: DagNode[] = [];
    const collect = (node: DagNode): void => {
      if (node.isSubPipeline && node.expanded && node.children.length > 0) {
        // Show the group container + children
        visible.push(node);
        for (const child of node.children) collect(child);
      } else {
        visible.push(node);
      }
    };
    for (const id of this.rootNodes) {
      collect(this.nodes.get(id)!);
    }
    return visible;
  }

  resetAllStatuses(): void {
    for (const node of this.nodes.values()) node.resetStatus();
    for (const edge of this.edges.values()) edge.status = 'pending';
  }
}

export function buildDag(pipelines: Pipeline[]): DagModel {
  const model = new DagModel();
  let edgeCounter = 0;

  // Index pipelines by FQN
  const byFqn = new Map<string, Pipeline>();
  for (const p of pipelines) {
    byFqn.set(p.fqn, p);
  }

  // Find root pipeline (has SubPipeline tasks referencing other pipelines)
  let rootPipeline = pipelines[0];
  for (const p of pipelines) {
    const hasSubPipeline = p.tasks.some(t => t.taskType === 'SubPipeline');
    if (hasSubPipeline) {
      // Check if this pipeline is NOT referenced as a child by any other pipeline
      const isChild = pipelines.some(other =>
        other !== p && other.tasks.some(t => t.name === p.fqn)
      );
      if (!isChild) {
        rootPipeline = p;
        break;
      }
    }
  }

  model.rootPipelineName = rootPipeline.name;

  // Build nodes recursively
  function buildPipelineNodes(pipeline: Pipeline, parentNode: DagNode | null): DagNode[] {
    const taskNodes: DagNode[] = [];

    for (const task of pipeline.tasks) {
      const nodeId = `${pipeline.name}::${task.name}`;
      const node = new DagNode(nodeId, {
        displayName: task.displayName,
        taskType: task.taskType,
        description: task.description,
        fqn: task.fqn,
        pipelineName: pipeline.name,
        taskSQL: task.taskSQL,
      });
      node.parent = parentNode;

      if (task.taskType === 'SubPipeline') {
        // task.name is the FQN of the child pipeline
        node.childPipelineFqn = task.name;
        const childPipeline = byFqn.get(task.name);
        if (childPipeline) {
          node.children = buildPipelineNodes(childPipeline, node);
        }
      }

      model.nodes.set(nodeId, node);
      taskNodes.push(node);
    }

    // Build edges within this pipeline
    for (const task of pipeline.tasks) {
      const sourceId = `${pipeline.name}::${task.name}`;
      for (const downName of task.downstreamTasks) {
        const targetId = `${pipeline.name}::${downName}`;
        if (model.nodes.has(targetId)) {
          const edgeId = `e${edgeCounter++}`;
          const edge = new DagEdge(edgeId, sourceId, targetId);
          model.edges.set(edgeId, edge);
          model.nodes.get(sourceId)!.edges.push(edgeId);
          model.nodes.get(targetId)!.inEdges.push(edgeId);
        }
      }
    }

    return taskNodes;
  }

  const rootTaskNodes = buildPipelineNodes(rootPipeline, null);

  // Identify root nodes (no incoming edges within the root pipeline)
  for (const node of rootTaskNodes) {
    if (node.inEdges.length === 0) {
      model.rootNodes.push(node.id);
    }
  }

  return model;
}
