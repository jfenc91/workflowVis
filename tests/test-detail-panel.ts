// Tests for detail panel rendering

import { describe, it, expect } from './test-runner.js';
import { buildDag } from '../src/data/dag-builder.js';
import { loadPipelines } from '../src/data/pipeline-loader.js';
import { loadEvents } from '../src/data/event-store.js';
import { EventCorrelator } from '../src/data/event-correlator.js';
import { relayout } from '../src/layout/group-layout.js';
import { DetailPanel } from '../src/ui/detail-panel.js';
import { RUNS } from '../src/data/runs.js';

export async function runDetailPanelTests(): Promise<void> {
  // Create a test container
  const container = document.createElement('div');
  container.id = 'test-detail-panel';
  container.style.display = 'none';
  document.body.appendChild(container);

  const { pipelines: eltPipelines } = await loadPipelines(RUNS.elt.pipelines);
  const eltEvents = await loadEvents(RUNS.elt.events);
  const { pipelines: mlPipelines } = await loadPipelines(RUNS.ml.pipelines);
  const mlEvents = await loadEvents(RUNS.ml.events);

  describe('Detail Panel - Show/Hide', () => {
    it('should add visible class when showing a node', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const node = dag.allNodes()[0];
      panel.show(node);

      expect(container.classList.contains('visible')).toBe(true);
    });

    it('should remove visible class when hiding', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(eltPipelines);
      relayout(dag);

      panel.show(dag.allNodes()[0]);
      panel.hide();

      expect(container.classList.contains('visible')).toBe(false);
    });

    it('should clear currentNode on hide', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(eltPipelines);
      relayout(dag);

      panel.show(dag.allNodes()[0]);
      panel.hide();

      expect(panel.currentNode).toBeNull();
    });
  });

  describe('Detail Panel - Content Rendering', () => {
    it('should render node display name', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const node = dag.allNodes().find(n => !n.isSubPipeline)!;
      panel.show(node);

      expect(container.innerHTML).toContain(node.displayName);
    });

    it('should render task type badge', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const node = dag.allNodes().find(n => n.taskType === 'Extract')!;
      panel.show(node);

      expect(container.innerHTML).toContain('Extract');
    });

    it('should render status badge', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const node = dag.allNodes()[0];
      node.status = 'running';
      panel.show(node);

      expect(container.innerHTML).toContain('running');
    });

    it('should render description when present', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const node = dag.allNodes().find(n => n.description);
      if (node) {
        panel.show(node);
        expect(container.innerHTML).toContain('Description');
      }
    });

    it('should render event log after events are applied', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(eltPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);

      // Apply all events
      for (const event of eltEvents) {
        corr.applyEvent(event);
      }

      // Find a node with events
      const nodeWithEvents = dag.allNodes().find(n => n.events.length > 0)!;
      expect(nodeWithEvents).toBeTruthy();

      panel.show(nodeWithEvents);

      expect(container.innerHTML).toContain('Event Log');
      expect(container.innerHTML).toContain('START');
    });

    it('should render datasets after events are applied', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(eltPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);

      for (const event of eltEvents) {
        corr.applyEvent(event);
      }

      const nodeWithDatasets = dag.allNodes().find(n =>
        n.datasets.inputs.length > 0 || n.datasets.outputs.length > 0
      );

      if (nodeWithDatasets) {
        panel.show(nodeWithDatasets);
        expect(container.innerHTML).toContain('Datasets');
      }
    });

    it('should render error details for failed ML node', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(mlPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);

      for (const event of mlEvents) {
        corr.applyEvent(event);
      }

      const trainNode = dag.allNodes().find(n => n.id.includes('train_model'));
      // After retry, the node is complete but has attempt history
      if (trainNode && trainNode.attempts.length > 0) {
        panel.show(trainNode);
        expect(container.innerHTML).toContain('Retry History');
      }
    });
  });

  describe('Detail Panel - Update preserves selection', () => {
    it('should refresh content when update() is called', () => {
      const panel = new DetailPanel(container);
      const dag = buildDag(eltPipelines);
      relayout(dag);

      const node = dag.allNodes()[0];
      panel.show(node);

      // Change node status
      node.status = 'running';
      panel.update();

      // Content should have changed to reflect new status
      expect(container.innerHTML).toContain('running');
    });
  });

  // Cleanup
  document.body.removeChild(container);
}
