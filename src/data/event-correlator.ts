// Map OpenLineage events to DAG nodes and update statuses

import type { PipelineEvent } from '../types.js';
import type { DagNode, DagModel } from './dag-builder.js';

export class EventCorrelator {
  dag: DagModel;
  runIdToNodeId: Map<string, string>;
  listeners: ((nodeId: string, event: PipelineEvent) => void)[];

  constructor(dagModel: DagModel) {
    this.dag = dagModel;
    this.runIdToNodeId = new Map();
    this.listeners = [];
  }

  onChange(fn: (nodeId: string, event: PipelineEvent) => void): void {
    this.listeners.push(fn);
  }

  _notify(nodeId: string, event: PipelineEvent): void {
    for (const fn of this.listeners) fn(nodeId, event);
  }

  // Find the DAG node matching an event
  _resolveNode(event: PipelineEvent): DagNode | null {
    // Task-level event: pipelineName.taskName
    if (event.taskName) {
      // Find node by pipeline name + task name
      for (const node of this.dag.allNodes()) {
        if (node.pipelineName === event.pipelineName && (
          node.id.endsWith('::' + event.taskName) ||
          node.displayName === event.taskName
        )) {
          return node;
        }
        // Also check inside sub-pipeline children
        for (const child of node.children) {
          if (child.pipelineName === event.pipelineName &&
              child.id.endsWith('::' + event.taskName)) {
            return child;
          }
        }
      }
      // Try matching by iterating all nodes
      for (const node of this.dag.nodes.values()) {
        const parts = node.id.split('::');
        const nodePipeline = parts[0];
        const nodeTask = parts[1];
        if (nodePipeline === event.pipelineName && nodeTask === event.taskName) {
          return node;
        }
      }
    }

    // Pipeline-level event (no taskName): match sub-pipeline node by child pipeline name
    // Note: jobType facet is only present on START events, so check !taskName instead
    if (!event.taskName) {
      // Root pipeline-level event: no specific node to update
      if (event.pipelineName === this.dag.rootPipelineName) {
        return null;
      }
      // Match against SubPipeline nodes whose child pipeline name matches
      for (const node of this.dag.nodes.values()) {
        if (node.isSubPipeline && node.childPipelineFqn) {
          // childPipelineFqn is like "Airflow.extract_pipeline"
          const childName = node.childPipelineFqn.replace(/^Airflow\./, '');
          if (childName === event.pipelineName) {
            return node;
          }
        }
      }
    }

    return null;
  }

  // Apply a single event to the DAG model
  applyEvent(event: PipelineEvent): void {
    const node = this._resolveNode(event);

    if (!node) {
      // Root pipeline event or unmatched - skip
      return;
    }

    // Track runId -> nodeId mapping
    this.runIdToNodeId.set(event.runId, node.id);

    // Store event on node
    node.events.push(event);

    // Merge dataset info
    for (const ds of event.inputs) {
      const existing = node.datasets.inputs.find(d => d.namespace === ds.namespace && d.name === ds.name);
      if (!existing) {
        node.datasets.inputs.push(ds);
      } else {
        if (ds.fields && !existing.fields) existing.fields = ds.fields;
        if (ds.stats) existing.stats = { ...existing.stats, ...ds.stats };
      }
    }
    for (const ds of event.outputs) {
      const existing = node.datasets.outputs.find(d => d.namespace === ds.namespace && d.name === ds.name);
      if (!existing) {
        node.datasets.outputs.push(ds);
      } else {
        if (ds.fields && !existing.fields) existing.fields = ds.fields;
        if (ds.stats) existing.stats = { ...existing.stats, ...ds.stats };
      }
    }

    // Update status
    switch (event.eventType) {
      case 'START':
        if (node.status === 'failed') {
          // Retry: save previous attempt
          node.attempts.push({
            runId: event.runId,
            status: 'failed',
            startTime: node.startTime,
            endTime: node.endTime,
            error: node.error,
          });
          node.error = null;
        }
        node.status = 'running';
        node.startTime = event.timestamp;
        node.endTime = null;
        node.duration = null;
        break;

      case 'COMPLETE':
        node.status = 'complete';
        node.endTime = event.timestamp;
        if (node.startTime) {
          node.duration = node.endTime - node.startTime;
        }
        break;

      case 'FAIL':
        node.status = 'failed';
        node.endTime = event.timestamp;
        if (node.startTime) {
          node.duration = node.endTime - node.startTime;
        }
        node.error = event.error;
        break;
    }

    // Update edge statuses
    this._updateEdgeStatuses(node);

    // Propagate to parent sub-pipeline node
    this._propagateToParent(node);

    this._notify(node.id, event);
  }

  _updateEdgeStatuses(node: DagNode): void {
    // Incoming edges take the node's status
    for (const edgeId of node.inEdges) {
      const edge = this.dag.getEdge(edgeId);
      if (edge) edge.status = node.status;
    }
    // Outgoing edges: if node is complete, mark edges as ready (complete)
    if (node.status === 'complete') {
      for (const edgeId of node.edges) {
        const edge = this.dag.getEdge(edgeId);
        if (edge) edge.status = 'complete';
      }
    }
  }

  _propagateToParent(node: DagNode): void {
    if (!node.parent) return;
    const parent = node.parent;

    // If any child is running, parent is running
    // If all children complete, parent is complete
    // If any child failed and no child is running, parent is failed
    const children = parent.children;
    const hasRunning = children.some(c => c.status === 'running');
    const hasFailed = children.some(c => c.status === 'failed');
    const allComplete = children.every(c => c.status === 'complete');
    const allPending = children.every(c => c.status === 'pending');

    if (allPending) return;

    if (hasRunning || (!allComplete && !hasFailed && !allPending)) {
      if (parent.status !== 'running') {
        parent.status = 'running';
        if (!parent.startTime) parent.startTime = node.startTime;
        this._updateEdgeStatuses(parent);
      }
    } else if (allComplete) {
      parent.status = 'complete';
      parent.endTime = Math.max(...children.map(c => c.endTime || 0));
      if (parent.startTime) parent.duration = parent.endTime - parent.startTime;
      this._updateEdgeStatuses(parent);
    } else if (hasFailed && !hasRunning) {
      parent.status = 'failed';
      const failedChild = children.find(c => c.status === 'failed');
      parent.error = failedChild?.error || null;
      parent.endTime = Math.max(...children.filter(c => c.endTime).map(c => c.endTime!));
      if (parent.startTime) parent.duration = parent.endTime - parent.startTime;
      this._updateEdgeStatuses(parent);
    }
  }
}
