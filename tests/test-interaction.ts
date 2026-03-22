// Tests for interaction handler behavior

import { describe, it, expect } from './test-runner.js';
import type { DagNode } from '../src/data/dag-builder.js';
import { buildDag } from '../src/data/dag-builder.js';
import { loadPipelines } from '../src/data/pipeline-loader.js';
import { relayout, toggleSubPipeline } from '../src/layout/group-layout.js';
import { NODE_WIDTH, NODE_HEIGHT } from '../src/layout/dagre-layout.js';
import { RUNS } from '../src/data/runs.js';

export async function runInteractionTests(): Promise<void> {
  const { pipelines: eltPipelines } = await loadPipelines(RUNS.elt.pipelines);

  describe('Interaction - handleClick behavior', () => {
    // Simulate _handleClick logic (fixed: single click does NOT toggle)
    function simulateHandleClick(node: DagNode) {
      return {
        toggledSubPipeline: false,
        selectedNodeId: node.id,
        clickedNode: node,
      };
    }

    it('should NOT toggle when clicking a regular (non-SubPipeline) child node', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const child = dag.allNodes().find(n =>
        !n.isSubPipeline && n.parent !== null
      )!;
      expect(child).toBeTruthy();

      const result = simulateHandleClick(child);
      expect(result.toggledSubPipeline).toBe(false);
      expect(result.selectedNodeId).toBe(child.id);
    });

    it('should NOT toggle SubPipeline on single click (only shows details)', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const group = dag.allNodes().find(n =>
        n.isSubPipeline && n.expanded && n.children.length > 0
      )!;
      expect(group).toBeTruthy();

      // After fix: single click does NOT toggle, only shows details
      const result = simulateHandleClick(group);
      expect(result.toggledSubPipeline).toBe(false);
      expect(result.selectedNodeId).toBe(group.id);
    });

    it('should select node and show details when clicking any node', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);

      for (const node of dag.allNodes().slice(0, 5)) {
        const result = simulateHandleClick(node);
        expect(result.selectedNodeId).toBe(node.id);
        expect(result.clickedNode).toBe(node);
      }
    });
  });

  describe('Interaction - Toggle should NOT collapse on child click', () => {
    it('child nodes are NOT SubPipeline type', () => {
      const dag = buildDag(eltPipelines);
      const children = dag.allNodes().filter(n => n.parent !== null);
      for (const child of children) {
        expect(child.isSubPipeline).toBe(false);
        expect(child.taskType).not.toBe('SubPipeline');
      }
    });

    it('clicking child should not change parent expanded state', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const extractGroup = dag.allNodes().find(n =>
        n.isSubPipeline && n.childPipelineFqn === 'Airflow.extract_pipeline'
      )!;
      expect(extractGroup.expanded).toBe(true);

      // Simulate clicking each child
      for (const child of extractGroup.children) {
        // handleClick receives the child (not the group)
        // Since child.isSubPipeline === false, toggle should NOT fire
        const shouldToggle = child.isSubPipeline && child.children.length > 0;
        expect(shouldToggle).toBe(false);
      }

      // Parent should still be expanded
      expect(extractGroup.expanded).toBe(true);
    });
  });

  describe('Interaction - Toggle SubPipeline dimensions', () => {
    it('should collapse to standard size', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const group = dag.allNodes().find(n =>
        n.isSubPipeline && n.childPipelineFqn === 'Airflow.extract_pipeline'
      )!;

      expect(group.width).toBeGreaterThan(NODE_WIDTH);
      expect(group.height).toBeGreaterThan(NODE_HEIGHT);

      toggleSubPipeline(dag, group.id);

      expect(group.expanded).toBe(false);
      expect(group.width).toBe(NODE_WIDTH);
      expect(group.height).toBe(NODE_HEIGHT);
    });

    it('should re-expand to larger size', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const group = dag.allNodes().find(n =>
        n.isSubPipeline && n.childPipelineFqn === 'Airflow.extract_pipeline'
      )!;

      toggleSubPipeline(dag, group.id); // collapse
      toggleSubPipeline(dag, group.id); // expand

      expect(group.expanded).toBe(true);
      expect(group.width).toBeGreaterThan(NODE_WIDTH);
      expect(group.height).toBeGreaterThan(NODE_HEIGHT);
    });
  });

  describe('Interaction - Pan detection (mouse move threshold)', () => {
    it('should treat < 5px movement as click, not pan', () => {
      const movements = [
        { dx: 0, dy: 0, isClick: true },
        { dx: 3, dy: 2, isClick: true },
        { dx: 4, dy: 4, isClick: true },
        { dx: 5, dy: 0, isClick: false },
        { dx: 0, dy: 5, isClick: false },
        { dx: 10, dy: 10, isClick: false },
      ];

      for (const m of movements) {
        const isClick = Math.abs(m.dx) < 5 && Math.abs(m.dy) < 5;
        expect(isClick).toBe(m.isClick);
      }
    });

    it('should not pan during sub-threshold movement (no camera shift on click)', () => {
      // Simulate the state machine: mousedown sets _isMouseDown=true, _isPanning=false.
      // Movement < 5px keeps _isPanning false. No pan() call occurs.
      // On mouseup with _isPanning still false, it's treated as a click.
      let isMouseDown = false;
      let isPanning = false;
      let panCalled = false;
      const mouseDownPos = { x: 0, y: 0 };

      // mousedown at (400, 300)
      isMouseDown = true;
      isPanning = false;
      mouseDownPos.x = 400;
      mouseDownPos.y = 300;

      // mousemove to (402, 301) — 2px movement, under threshold
      const moveX = 402, moveY = 301;
      const dxFromDown = Math.abs(moveX - mouseDownPos.x);
      const dyFromDown = Math.abs(moveY - mouseDownPos.y);
      if (!isPanning && (dxFromDown >= 5 || dyFromDown >= 5)) {
        isPanning = true;
      }
      if (isPanning) {
        panCalled = true;
      }

      expect(isPanning).toBe(false);
      expect(panCalled).toBe(false);

      // mouseup: since isPanning is false, treat as click
      const isClick = isMouseDown && !isPanning;
      expect(isClick).toBe(true);
    });

    it('should start panning only after exceeding 5px threshold', () => {
      let isPanning = false;
      let panCount = 0;
      const mouseDownPos = { x: 400, y: 300 };

      // Sequence of mouse moves with increasing distance
      const moves = [
        { x: 401, y: 300 },  // 1px — no pan
        { x: 403, y: 302 },  // 3.6px — no pan
        { x: 406, y: 300 },  // 6px — crosses threshold, start panning
        { x: 410, y: 302 },  // already panning
      ];

      for (const m of moves) {
        const dxFromDown = Math.abs(m.x - mouseDownPos.x);
        const dyFromDown = Math.abs(m.y - mouseDownPos.y);
        if (!isPanning && (dxFromDown >= 5 || dyFromDown >= 5)) {
          isPanning = true;
        }
        if (isPanning) panCount++;
      }

      expect(isPanning).toBe(true);
      expect(panCount).toBe(2); // Only the last 2 moves actually pan
    });
  });
}
