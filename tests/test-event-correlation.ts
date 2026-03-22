// Tests for event correlation

import { describe, it, expect } from './test-runner.js';
import { buildDag } from '../src/data/dag-builder.js';
import { loadPipelines } from '../src/data/pipeline-loader.js';
import { loadEvents } from '../src/data/event-store.js';
import { EventCorrelator } from '../src/data/event-correlator.js';
import { relayout } from '../src/layout/group-layout.js';
import { RUNS } from '../src/data/runs.js';

export async function runEventCorrelationTests(): Promise<void> {
  const { pipelines: eltPipelines } = await loadPipelines(RUNS.elt.pipelines);
  const eltEvents = await loadEvents(RUNS.elt.events);

  describe('Event Correlation - ELT Scenario', () => {
    const dag = buildDag(eltPipelines);
    relayout(dag);
    const correlator = new EventCorrelator(dag);

    it('should load correct number of events', () => {
      expect(eltEvents.length).toBeGreaterThan(0);
    });

    it('should have events sorted by timestamp', () => {
      for (let i = 1; i < eltEvents.length; i++) {
        expect(eltEvents[i].timestamp).toBeGreaterThanOrEqual(eltEvents[i - 1].timestamp);
      }
    });

    it('should correlate task START event to correct node', () => {
      // Find a task-level START event
      const taskStart = eltEvents.find(e =>
        e.taskName && e.eventType === 'START'
      )!;
      expect(taskStart).toBeTruthy();

      correlator.applyEvent(taskStart);

      // Find the corresponding node
      const expectedId = `${taskStart.pipelineName}::${taskStart.taskName}`;
      const node = dag.getNode(expectedId);
      expect(node).toBeTruthy();
      expect(node!.status).toBe('running');
    });

    it('should correlate pipeline-level START to SubPipeline node', () => {
      const dag2 = buildDag(eltPipelines);
      relayout(dag2);
      const corr2 = new EventCorrelator(dag2);

      // Find pipeline-level START (no taskName, not root)
      const pipelineStart = eltEvents.find(e =>
        !e.taskName && e.eventType === 'START' &&
        e.pipelineName !== dag2.rootPipelineName
      )!;
      expect(pipelineStart).toBeTruthy();

      corr2.applyEvent(pipelineStart);

      // The SubPipeline node should now be running
      const subPipeline = dag2.allNodes().find(n =>
        n.isSubPipeline && n.childPipelineFqn &&
        n.childPipelineFqn.replace(/^Airflow\./, '') === pipelineStart.pipelineName
      )!;
      expect(subPipeline).toBeTruthy();
      expect(subPipeline.status).toBe('running');
    });

    it('should ignore root orchestrator events (no node mapping)', () => {
      const dag3 = buildDag(eltPipelines);
      relayout(dag3);
      const corr3 = new EventCorrelator(dag3);

      const rootEvent = eltEvents.find(e =>
        e.pipelineName === dag3.rootPipelineName && e.eventType === 'START'
      )!;
      expect(rootEvent).toBeTruthy();

      // Should not throw and no node should change status
      corr3.applyEvent(rootEvent);

      const allPending = dag3.allNodes().every(n => n.status === 'pending');
      expect(allPending).toBe(true);
    });

    it('should complete all tasks after replaying all ELT events', () => {
      const dag4 = buildDag(eltPipelines);
      relayout(dag4);
      const corr4 = new EventCorrelator(dag4);

      for (const event of eltEvents) {
        corr4.applyEvent(event);
      }

      // All tasks that have events should be complete
      const nodesWithEvents = dag4.allNodes().filter(n => n.events.length > 0);
      expect(nodesWithEvents.length).toBeGreaterThan(0);

      for (const node of nodesWithEvents) {
        expect(node.status).toBe('complete');
      }
    });

    it('should track durations for completed tasks', () => {
      const dag5 = buildDag(eltPipelines);
      relayout(dag5);
      const corr5 = new EventCorrelator(dag5);

      for (const event of eltEvents) {
        corr5.applyEvent(event);
      }

      const completed = dag5.allNodes().filter(n => n.status === 'complete');
      for (const node of completed) {
        expect(node.duration).toBeGreaterThan(0);
        expect(node.startTime).toBeTruthy();
        expect(node.endTime).toBeTruthy();
        expect(node.endTime!).toBeGreaterThanOrEqual(node.startTime!);
      }
    });

    it('should collect datasets from events', () => {
      const dag6 = buildDag(eltPipelines);
      relayout(dag6);
      const corr6 = new EventCorrelator(dag6);

      for (const event of eltEvents) {
        corr6.applyEvent(event);
      }

      // At least some nodes should have input/output datasets
      const withDatasets = dag6.allNodes().filter(n =>
        n.datasets.inputs.length > 0 || n.datasets.outputs.length > 0
      );
      expect(withDatasets.length).toBeGreaterThan(0);
    });
  });

  const { pipelines: mlPipelines } = await loadPipelines(RUNS.ml.pipelines);
  const mlEvents = await loadEvents(RUNS.ml.events);

  describe('Event Correlation - ML Retry Scenario', () => {

    it('should handle train_model failure and retry', () => {
      const dag = buildDag(mlPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);

      // Replay all events
      for (const event of mlEvents) {
        corr.applyEvent(event);
      }

      // train_model should end up complete (after retry)
      const trainNode = dag.allNodes().find(n =>
        n.id.includes('train_model')
      )!;
      expect(trainNode).toBeTruthy();
      expect(trainNode.status).toBe('complete');
    });

    it('should record failed attempt in attempts history', () => {
      const dag = buildDag(mlPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);

      for (const event of mlEvents) {
        corr.applyEvent(event);
      }

      const trainNode = dag.allNodes().find(n =>
        n.id.includes('train_model')
      )!;
      expect(trainNode.attempts.length).toBeGreaterThanOrEqual(1);
      expect(trainNode.attempts[0].status).toBe('failed');
    });

    it('should clear error after successful retry', () => {
      const dag = buildDag(mlPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);

      for (const event of mlEvents) {
        corr.applyEvent(event);
      }

      const trainNode = dag.allNodes().find(n =>
        n.id.includes('train_model')
      )!;
      // After successful retry, current error should be null
      expect(trainNode.error).toBeNull();
    });

    it('should record error details in failed attempt', () => {
      const dag = buildDag(mlPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);

      for (const event of mlEvents) {
        corr.applyEvent(event);
      }

      const trainNode = dag.allNodes().find(n =>
        n.id.includes('train_model')
      )!;
      const failedAttempt = trainNode.attempts.find(a => a.status === 'failed')!;
      expect(failedAttempt).toBeTruthy();
      expect(failedAttempt.error).toBeTruthy();
      expect(failedAttempt.error!.message).toBeTruthy();
    });

    it('should complete all ML tasks after full replay', () => {
      const dag = buildDag(mlPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);

      for (const event of mlEvents) {
        corr.applyEvent(event);
      }

      const nodesWithEvents = dag.allNodes().filter(n => n.events.length > 0);
      for (const node of nodesWithEvents) {
        expect(node.status).toBe('complete');
      }
    });
  });

  describe('Event Correlation - Edge Status Updates', () => {

    it('should update edge status when target node changes status', () => {
      const dag = buildDag(eltPipelines);
      relayout(dag);
      const corr = new EventCorrelator(dag);

      for (const event of eltEvents) {
        corr.applyEvent(event);
      }

      // After all events, edges should reflect target node statuses
      for (const edge of dag.allEdges()) {
        expect(edge.status).not.toBe('pending');
      }
    });
  });
}
