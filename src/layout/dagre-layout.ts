// Custom layered DAG layout using topological sort + barycenter ordering

import type { DagModel } from '../data/dag-builder.js';
import { DagNode } from '../data/dag-builder.js';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;
const LAYER_SPACING = 280;
const NODE_SPACING = 90;
const GROUP_PADDING = 40;
const GROUP_HEADER = 30;

export { NODE_WIDTH, NODE_HEIGHT, LAYER_SPACING, NODE_SPACING, GROUP_PADDING, GROUP_HEADER };

export function layoutDag(dagModel: DagModel): void {
  // Get top-level nodes (root pipeline tasks)
  const rootTaskIds: string[] = [];

  for (const node of dagModel.nodes.values()) {
    if (!node.parent) {
      rootTaskIds.push(node.id);
    }
  }

  // Assign layers using topological sort (Kahn's algorithm) with longest-path
  const layers = assignLayers(dagModel, rootTaskIds);

  // Order within layers using barycenter heuristic
  barycenterOrdering(dagModel, layers);

  // Assign positions
  assignPositions(dagModel, layers);

  // Layout expanded sub-pipeline children
  for (const node of dagModel.nodes.values()) {
    if (node.isSubPipeline && node.expanded && node.children.length > 0) {
      layoutSubPipeline(dagModel, node);
    }
  }
}

function assignLayers(dagModel: DagModel, nodeIds: string[]): string[][] {
  // Build adjacency for these nodes
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  // Only consider edges between these nodes
  for (const id of nodeIds) {
    const node = dagModel.getNode(id)!;
    for (const edgeId of node.edges) {
      const edge = dagModel.getEdge(edgeId)!;
      if (nodeIds.includes(edge.targetId)) {
        adj.get(id)!.push(edge.targetId);
        inDegree.set(edge.targetId, (inDegree.get(edge.targetId) || 0) + 1);
      }
    }
  }

  // Longest path from roots
  const layerOf = new Map<string, number>();
  const queue: string[] = [];

  for (const id of nodeIds) {
    if (inDegree.get(id) === 0) {
      queue.push(id);
      layerOf.set(id, 0);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const currentLayer = layerOf.get(id)!;
    for (const targetId of adj.get(id)!) {
      const newLayer = currentLayer + 1;
      if (!layerOf.has(targetId) || layerOf.get(targetId)! < newLayer) {
        layerOf.set(targetId, newLayer);
      }
      inDegree.set(targetId, inDegree.get(targetId)! - 1);
      if (inDegree.get(targetId) === 0) {
        queue.push(targetId);
      }
    }
  }

  // Group by layer
  const maxLayer = Math.max(...layerOf.values(), 0);
  const layers: string[][] = [];
  for (let i = 0; i <= maxLayer; i++) layers.push([]);
  for (const [id, layer] of layerOf) {
    layers[layer].push(id);
    dagModel.getNode(id)!.layer = layer;
  }

  return layers;
}

function barycenterOrdering(dagModel: DagModel, layers: string[][]): void {
  // Simple barycenter heuristic: order each layer by average position of connected nodes in previous layer
  for (let i = 1; i < layers.length; i++) {
    const prevPositions = new Map<string, number>();
    layers[i - 1].forEach((id, idx) => prevPositions.set(id, idx));

    const barycenters = layers[i].map(id => {
      const node = dagModel.getNode(id)!;
      let sum = 0, count = 0;
      for (const edgeId of node.inEdges) {
        const edge = dagModel.getEdge(edgeId)!;
        if (prevPositions.has(edge.sourceId)) {
          sum += prevPositions.get(edge.sourceId)!;
          count++;
        }
      }
      return { id, bc: count > 0 ? sum / count : 0 };
    });

    barycenters.sort((a, b) => a.bc - b.bc);
    layers[i] = barycenters.map(b => b.id);
  }
}

function assignPositions(dagModel: DagModel, layers: string[][]): void {
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    const totalHeight = layer.length * NODE_HEIGHT + (layer.length - 1) * NODE_SPACING;
    const startY = -totalHeight / 2;

    for (let i = 0; i < layer.length; i++) {
      const node = dagModel.getNode(layer[i])!;
      node.x = layerIdx * LAYER_SPACING;
      node.y = startY + i * (NODE_HEIGHT + NODE_SPACING);
      node.width = NODE_WIDTH;
      node.height = NODE_HEIGHT;
    }
  }
}

function layoutSubPipeline(dagModel: DagModel, parentNode: DagNode): void {
  const children = parentNode.children;
  if (children.length === 0) return;

  const childIds = children.map(c => c.id);

  // Assign layers for children
  const layers = assignLayers(dagModel, childIds);
  barycenterOrdering(dagModel, layers);

  // Compute child positions relative to parent
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    const totalHeight = layer.length * NODE_HEIGHT + (layer.length - 1) * NODE_SPACING;
    const startY = -totalHeight / 2;

    for (let i = 0; i < layer.length; i++) {
      const node = dagModel.getNode(layer[i])!;
      node.x = layerIdx * LAYER_SPACING;
      node.y = startY + i * (NODE_HEIGHT + NODE_SPACING);
      node.width = NODE_WIDTH;
      node.height = NODE_HEIGHT;
    }
  }

  // Compute bounding box for children
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const child of children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + child.width);
    maxY = Math.max(maxY, child.y + child.height);
  }

  const groupWidth = (maxX - minX) + GROUP_PADDING * 2;
  const groupHeight = (maxY - minY) + GROUP_PADDING * 2 + GROUP_HEADER;

  // Offset children so they're relative to the parent's group position
  const offsetX = parentNode.x + GROUP_PADDING - minX;
  const offsetY = parentNode.y + GROUP_PADDING + GROUP_HEADER - minY;

  for (const child of children) {
    child.x += offsetX;
    child.y += offsetY;
  }

  // Update parent node dimensions to fit group
  parentNode.width = groupWidth;
  parentNode.height = groupHeight;
}
