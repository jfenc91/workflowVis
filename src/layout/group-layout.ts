// Group layout: compute bounding boxes and re-adjust parent layout
// after sub-pipeline expansion/collapse

import type { DagModel, DagNode } from '../data/dag-builder.js';
import { layoutDag, GROUP_PADDING, GROUP_HEADER, NODE_WIDTH, NODE_HEIGHT, LAYER_SPACING, NODE_SPACING } from './dagre-layout.js';

export function relayout(dagModel: DagModel): void {
  // Full re-layout
  layoutDag(dagModel);

  // After initial layout with expanded sub-pipelines,
  // we need to adjust subsequent layers to avoid overlap
  adjustForGroups(dagModel);
}

function adjustForGroups(dagModel: DagModel): void {
  // Collect top-level nodes and sort by layer
  const topLevel: DagNode[] = [];
  for (const node of dagModel.nodes.values()) {
    if (!node.parent) {
      topLevel.push(node);
    }
  }

  // Group by layer
  const layerMap = new Map<number, DagNode[]>();
  for (const node of topLevel) {
    if (!layerMap.has(node.layer)) layerMap.set(node.layer, []);
    layerMap.get(node.layer)!.push(node);
  }

  // For each layer, sort by Y and adjust spacing to prevent overlap
  for (const [_layer, nodes] of layerMap) {
    nodes.sort((a, b) => a.y - b.y);

    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const prevBottom = prev.y + prev.height;
      const minY = prevBottom + NODE_SPACING;

      if (curr.y < minY) {
        const shift = minY - curr.y;
        curr.y = minY;

        // Also shift children if it's an expanded sub-pipeline
        if (curr.isSubPipeline && curr.expanded) {
          for (const child of curr.children) {
            child.y += shift;
          }
        }
      }
    }
  }

  // Center each layer vertically around 0
  for (const [_layer, nodes] of layerMap) {
    const minY = Math.min(...nodes.map(n => n.y));
    const maxY = Math.max(...nodes.map(n => n.y + n.height));
    const center = (minY + maxY) / 2;
    const offset = -center;

    for (const node of nodes) {
      node.y += offset;
      if (node.isSubPipeline && node.expanded) {
        for (const child of node.children) {
          child.y += offset;
        }
      }
    }
  }

  // Adjust X positions for expanded sub-pipelines that are wider
  adjustLayerXPositions(dagModel, layerMap);
}

function adjustLayerXPositions(_dagModel: DagModel, layerMap: Map<number, DagNode[]>): void {
  // Sort layers by index
  const sortedLayers = [...layerMap.keys()].sort((a, b) => a - b);

  let currentX = 0;
  for (const layerIdx of sortedLayers) {
    const nodes = layerMap.get(layerIdx)!;
    const maxWidth = Math.max(...nodes.map(n => n.width));

    // Set X for all nodes in this layer
    for (const node of nodes) {
      const oldX = node.x;
      node.x = currentX;

      // Shift children to match
      if (node.isSubPipeline && node.expanded) {
        const dx = node.x - oldX;
        for (const child of node.children) {
          child.x += dx;
        }
      }
    }

    currentX += maxWidth + (LAYER_SPACING - NODE_WIDTH);
  }
}

export function toggleSubPipeline(dagModel: DagModel, nodeId: string): void {
  const node = dagModel.getNode(nodeId);
  if (!node || !node.isSubPipeline) return;

  node.expanded = !node.expanded;

  if (!node.expanded) {
    // Collapse: reset to standard node size
    node.width = NODE_WIDTH;
    node.height = NODE_HEIGHT;
  }

  relayout(dagModel);
}
