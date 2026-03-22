// Tests for layout algorithms

import { describe, it, expect } from './test-runner.js';
import { buildDag } from '../src/data/dag-builder.js';
import { loadPipelines } from '../src/data/pipeline-loader.js';
import { NODE_WIDTH, NODE_HEIGHT } from '../src/layout/dagre-layout.js';
import { relayout, toggleSubPipeline } from '../src/layout/group-layout.js';
import { RUNS } from '../src/data/runs.js';

export async function runLayoutTests(): Promise<void> {
  const { pipelines: eltPipelines } = await loadPipelines(RUNS.elt.pipelines);

  describe('Layout - Layer Assignment', () => {
    const dag = buildDag(eltPipelines);
    relayout(dag);

    it('should assign layers to all top-level nodes', () => {
      const topLevel = dag.allNodes().filter(n => !n.parent);
      for (const node of topLevel) {
        expect(node.layer).toBeGreaterThanOrEqual(0);
      }
    });

    it('should assign layer 0 to root nodes (no incoming edges)', () => {
      for (const id of dag.rootNodes) {
        expect(dag.getNode(id)!.layer).toBe(0);
      }
    });

    it('should assign increasing layers along the edge chain', () => {
      // extract(0) -> transform(1) -> load_publish(2)
      const extract = dag.allNodes().find(n =>
        n.isSubPipeline && n.childPipelineFqn === 'Airflow.extract_pipeline'
      )!;
      const transform = dag.allNodes().find(n =>
        n.isSubPipeline && n.childPipelineFqn === 'Airflow.transform_pipeline'
      )!;
      const loadPublish = dag.allNodes().find(n =>
        n.isSubPipeline && n.childPipelineFqn === 'Airflow.load_and_publish_pipeline'
      )!;

      expect(extract.layer).toBeLessThan(transform.layer);
      expect(transform.layer).toBeLessThan(loadPublish.layer);
    });
  });

  describe('Layout - Node Positioning', () => {
    const dag = buildDag(eltPipelines);
    relayout(dag);

    it('should assign distinct x positions per layer', () => {
      const topLevel = dag.allNodes().filter(n => !n.parent);
      const layerXs = new Map<number, number>();
      for (const node of topLevel) {
        if (!layerXs.has(node.layer)) layerXs.set(node.layer, node.x);
        expect(node.x).toBe(layerXs.get(node.layer));
      }
    });

    it('should not overlap top-level nodes vertically', () => {
      const topLevel = dag.allNodes().filter(n => !n.parent);
      // Group by layer
      const byLayer = new Map<number, typeof topLevel>();
      for (const node of topLevel) {
        if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
        byLayer.get(node.layer)!.push(node);
      }

      for (const [, nodes] of byLayer) {
        nodes.sort((a, b) => a.y - b.y);
        for (let i = 1; i < nodes.length; i++) {
          const prevBottom = nodes[i - 1].y + nodes[i - 1].height;
          expect(nodes[i].y).toBeGreaterThanOrEqual(prevBottom);
        }
      }
    });
  });

  describe('Layout - Expanded SubPipeline Groups', () => {
    const dag = buildDag(eltPipelines);
    relayout(dag);

    it('should make expanded groups larger than standard node size', () => {
      const groups = dag.allNodes().filter(n =>
        n.isSubPipeline && n.expanded && n.children.length > 0
      );
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        expect(group.width).toBeGreaterThan(NODE_WIDTH);
        expect(group.height).toBeGreaterThan(NODE_HEIGHT);
      }
    });

    it('should position children inside group bounds', () => {
      const groups = dag.allNodes().filter(n =>
        n.isSubPipeline && n.expanded && n.children.length > 0
      );
      for (const group of groups) {
        for (const child of group.children) {
          expect(child.x).toBeGreaterThanOrEqual(group.x);
          expect(child.y).toBeGreaterThanOrEqual(group.y);
          expect(child.x + child.width).toBeLessThanOrEqual(group.x + group.width + 1);
          expect(child.y + child.height).toBeLessThanOrEqual(group.y + group.height + 1);
        }
      }
    });

    it('should not overlap children within a group', () => {
      const groups = dag.allNodes().filter(n =>
        n.isSubPipeline && n.expanded && n.children.length > 0
      );
      for (const group of groups) {
        const children = group.children;
        for (let i = 0; i < children.length; i++) {
          for (let j = i + 1; j < children.length; j++) {
            const a = children[i];
            const b = children[j];
            // Check no overlap (either horizontally or vertically separated)
            const xOverlap = a.x < b.x + b.width && b.x < a.x + a.width;
            const yOverlap = a.y < b.y + b.height && b.y < a.y + a.height;
            const overlapping = xOverlap && yOverlap;
            expect(overlapping).toBe(false);
          }
        }
      }
    });

    it('should give children standard node dimensions', () => {
      const groups = dag.allNodes().filter(n =>
        n.isSubPipeline && n.expanded && n.children.length > 0
      );
      for (const group of groups) {
        for (const child of group.children) {
          expect(child.width).toBe(NODE_WIDTH);
          expect(child.height).toBe(NODE_HEIGHT);
        }
      }
    });
  });

  describe('Layout - Toggle Collapse/Expand', () => {
    const dag = buildDag(eltPipelines);
    relayout(dag);

    const extractNode = dag.allNodes().find(n =>
      n.isSubPipeline && n.childPipelineFqn === 'Airflow.extract_pipeline'
    )!;

    it('should collapse a SubPipeline to standard node size', () => {
      toggleSubPipeline(dag, extractNode.id);
      expect(extractNode.expanded).toBe(false);
      expect(extractNode.width).toBe(NODE_WIDTH);
      expect(extractNode.height).toBe(NODE_HEIGHT);
    });

    it('should expand a SubPipeline back to group size', () => {
      toggleSubPipeline(dag, extractNode.id);
      expect(extractNode.expanded).toBe(true);
      expect(extractNode.width).toBeGreaterThan(NODE_WIDTH);
      expect(extractNode.height).toBeGreaterThan(NODE_HEIGHT);
    });

    it('should keep children inside group after re-expand', () => {
      for (const child of extractNode.children) {
        expect(child.x).toBeGreaterThanOrEqual(extractNode.x);
        expect(child.y).toBeGreaterThanOrEqual(extractNode.y);
        expect(child.x + child.width).toBeLessThanOrEqual(extractNode.x + extractNode.width + 1);
        expect(child.y + child.height).toBeLessThanOrEqual(extractNode.y + extractNode.height + 1);
      }
    });
  });
}
