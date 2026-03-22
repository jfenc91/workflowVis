// Tests for dynamic sub-pipeline binding

import { describe, it, expect } from './test-runner.js';
import { buildDag } from '../src/data/dag-builder.js';
import { loadPipelines } from '../src/data/pipeline-loader.js';
import { loadEvents } from '../src/data/event-store.js';
import { EventCorrelator } from '../src/data/event-correlator.js';
import { relayout } from '../src/layout/group-layout.js';
import { RUNS } from '../src/data/runs.js';
import type { Pipeline } from '../src/types.js';

export async function runDynamicRoutingTests(): Promise<void> {
  const { pipelines: dynPipelines } = await loadPipelines(RUNS.dynamic.pipelines);
  const dynEvents = await loadEvents(RUNS.dynamic.events);

  describe('Event Correlation - Dynamic Routing', () => {

    it('should load dynamic routing events', () => {
      expect(dynEvents.length).toBe(16);
    });

    it('should build DAG with placeholder SubPipeline (no children)', () => {
      const dag = buildDag(dynPipelines);
      const placeholder = dag.getNode('dynamic_routing_pipeline::__dynamic_processor__');
      expect(placeholder).toBeTruthy();
      expect(placeholder!.isSubPipeline).toBe(true);
      expect(placeholder!.children.length).toBe(0);
    });

    it('should have unused candidate pipelines not in the DAG', () => {
      const dag = buildDag(dynPipelines);
      // batch_processor_pipeline and stream_processor_pipeline should NOT have nodes
      const batchNode = dag.getNode('batch_processor_pipeline::chunk_data');
      const streamNode = dag.getNode('stream_processor_pipeline::open_stream');
      expect(batchNode).toBeFalsy();
      expect(streamNode).toBeFalsy();
    });

    it('should dynamically bind candidate pipeline on parent facet event', () => {
      const dag = buildDag(dynPipelines);
      relayout(dag);

      // Build candidate map (same logic as SimulationSource)
      const usedNames = new Set<string>();
      for (const node of dag.nodes.values()) usedNames.add(node.pipelineName);
      const candidates = new Map<string, Pipeline>();
      for (const p of dynPipelines) {
        if (!usedNames.has(p.name)) candidates.set(p.name, p);
      }

      const correlator = new EventCorrelator(dag, candidates);

      // Apply events up to and including the batch_processor_pipeline START (event #5)
      for (let i = 0; i < 5; i++) {
        correlator.applyEvent(dynEvents[i]);
      }

      // After event #5, the placeholder should now have children
      const placeholder = dag.getNode('dynamic_routing_pipeline::__dynamic_processor__');
      expect(placeholder!.children.length).toBe(3);
      expect(placeholder!.childPipelineFqn).toBe('Airflow.batch_processor_pipeline');

      // Child nodes should exist in the DAG
      expect(dag.getNode('batch_processor_pipeline::chunk_data')).toBeTruthy();
      expect(dag.getNode('batch_processor_pipeline::process_chunk')).toBeTruthy();
      expect(dag.getNode('batch_processor_pipeline::merge_results')).toBeTruthy();
    });

    it('should fire dynamic bind listener', () => {
      const dag = buildDag(dynPipelines);
      relayout(dag);

      const usedNames = new Set<string>();
      for (const node of dag.nodes.values()) usedNames.add(node.pipelineName);
      const candidates = new Map<string, Pipeline>();
      for (const p of dynPipelines) {
        if (!usedNames.has(p.name)) candidates.set(p.name, p);
      }

      const correlator = new EventCorrelator(dag, candidates);

      let bindCalled = false;
      let boundParentId = '';
      let boundChildName = '';
      correlator.onDynamicBind((parentNodeId, childPipelineName) => {
        bindCalled = true;
        boundParentId = parentNodeId;
        boundChildName = childPipelineName;
      });

      for (let i = 0; i < 5; i++) {
        correlator.applyEvent(dynEvents[i]);
      }

      expect(bindCalled).toBe(true);
      expect(boundParentId).toBe('dynamic_routing_pipeline::__dynamic_processor__');
      expect(boundChildName).toBe('batch_processor_pipeline');
    });

    it('should not re-bind on replay after children exist', () => {
      const dag = buildDag(dynPipelines);
      relayout(dag);

      const usedNames = new Set<string>();
      for (const node of dag.nodes.values()) usedNames.add(node.pipelineName);
      const candidates = new Map<string, Pipeline>();
      for (const p of dynPipelines) {
        if (!usedNames.has(p.name)) candidates.set(p.name, p);
      }

      const correlator = new EventCorrelator(dag, candidates);

      let bindCount = 0;
      correlator.onDynamicBind(() => { bindCount++; });

      // Apply all events twice
      for (const event of dynEvents) correlator.applyEvent(event);
      dag.resetAllStatuses();
      for (const event of dynEvents) correlator.applyEvent(event);

      // Should only bind once (children.length === 0 guard)
      expect(bindCount).toBe(1);
    });

    it('should complete all tasks after full replay', () => {
      const dag = buildDag(dynPipelines);
      relayout(dag);

      const usedNames = new Set<string>();
      for (const node of dag.nodes.values()) usedNames.add(node.pipelineName);
      const candidates = new Map<string, Pipeline>();
      for (const p of dynPipelines) {
        if (!usedNames.has(p.name)) candidates.set(p.name, p);
      }

      const correlator = new EventCorrelator(dag, candidates);

      for (const event of dynEvents) {
        correlator.applyEvent(event);
      }

      const nodesWithEvents = dag.allNodes().filter(n => n.events.length > 0);
      expect(nodesWithEvents.length).toBeGreaterThan(0);
      for (const node of nodesWithEvents) {
        expect(node.status).toBe('complete');
      }
    });

    it('should build edges within grafted child pipeline', () => {
      const dag = buildDag(dynPipelines);
      relayout(dag);

      const usedNames = new Set<string>();
      for (const node of dag.nodes.values()) usedNames.add(node.pipelineName);
      const candidates = new Map<string, Pipeline>();
      for (const p of dynPipelines) {
        if (!usedNames.has(p.name)) candidates.set(p.name, p);
      }

      const correlator = new EventCorrelator(dag, candidates);

      // Apply just enough events to trigger the bind
      for (let i = 0; i < 5; i++) {
        correlator.applyEvent(dynEvents[i]);
      }

      // chunk_data should have an outgoing edge to process_chunk
      const chunkNode = dag.getNode('batch_processor_pipeline::chunk_data')!;
      expect(chunkNode.edges.length).toBe(1);

      const edge = dag.getEdge(chunkNode.edges[0])!;
      expect(edge.targetId).toBe('batch_processor_pipeline::process_chunk');
    });
  });
}
