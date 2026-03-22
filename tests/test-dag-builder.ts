// Tests for DAG builder

import { describe, it, expect } from './test-runner.js';
import { buildDag } from '../src/data/dag-builder.js';
import { loadPipelines } from '../src/data/pipeline-loader.js';
import { RUNS } from '../src/data/runs.js';

export async function runDagBuilderTests(): Promise<void> {
  const { pipelines: eltPipelines } = await loadPipelines(RUNS.elt.pipelines);
  const { pipelines: mlPipelines } = await loadPipelines(RUNS.ml.pipelines);

  describe('DAG Builder - ELT Scenario', () => {
    const dag = buildDag(eltPipelines);

    it('should identify orchestrator as root pipeline', () => {
      expect(dag.rootPipelineName).toBe('orchestrator_daily_pipeline');
    });

    it('should create correct number of total nodes', () => {
      // 3 root tasks + 6 extract + 4 transform + 4 load_publish = 17
      expect(dag.nodes.size).toBe(17);
    });

    it('should create 3 top-level root tasks', () => {
      const topLevel = dag.allNodes().filter(n => !n.parent);
      expect(topLevel.length).toBe(3);
    });

    it('should mark SubPipeline nodes correctly', () => {
      const subPipelines = dag.allNodes().filter(n => n.isSubPipeline);
      expect(subPipelines.length).toBe(3);
    });

    it('should have root nodes with no incoming edges', () => {
      for (const id of dag.rootNodes) {
        const node = dag.getNode(id)!;
        expect(node.inEdges.length).toBe(0);
      }
    });

    it('should build edges between root tasks', () => {
      // extract -> transform -> load_publish
      const edges = dag.allEdges();
      const rootEdges = edges.filter(e => {
        const s = dag.getNode(e.sourceId)!;
        const t = dag.getNode(e.targetId)!;
        return !s.parent && !t.parent;
      });
      expect(rootEdges.length).toBe(2);
    });

    it('should nest extract children inside extract SubPipeline', () => {
      const extractNode = dag.allNodes().find(n =>
        n.isSubPipeline && n.childPipelineFqn === 'Airflow.extract_pipeline'
      )!;
      expect(extractNode).toBeTruthy();
      expect(extractNode.children.length).toBe(6);
    });

    it('should nest transform children inside transform SubPipeline', () => {
      const transformNode = dag.allNodes().find(n =>
        n.isSubPipeline && n.childPipelineFqn === 'Airflow.transform_pipeline'
      )!;
      expect(transformNode).toBeTruthy();
      expect(transformNode.children.length).toBe(4);
    });

    it('should build internal edges within child pipelines', () => {
      // extract has: orders->customers, orders->stage_orders, customers->stage_customers, clickstream->stage_clickstream
      const extractChildren = dag.allNodes().filter(n =>
        n.pipelineName === 'extract_pipeline'
      );
      const childEdgeIds = new Set<string>();
      for (const child of extractChildren) {
        for (const eid of child.edges) childEdgeIds.add(eid);
      }
      expect(childEdgeIds.size).toBe(4);
    });

    it('should set parent references on child nodes', () => {
      const children = dag.allNodes().filter(n => n.parent !== null);
      expect(children.length).toBe(14); // 6 + 4 + 4
      for (const child of children) {
        expect(child.parent!.isSubPipeline).toBe(true);
      }
    });

    it('should initialize all nodes as pending', () => {
      for (const node of dag.allNodes()) {
        expect(node.status).toBe('pending');
      }
    });

    it('should start all nodes expanded', () => {
      for (const node of dag.allNodes()) {
        if (node.isSubPipeline) {
          expect(node.expanded).toBe(true);
        }
      }
    });
  });

  describe('DAG Builder - ML Scenario', () => {
    const dag = buildDag(mlPipelines);

    it('should identify ml_churn_training_pipeline as root', () => {
      expect(dag.rootPipelineName).toBe('ml_churn_training_pipeline');
    });

    it('should create correct number of total nodes', () => {
      // 3 root tasks (2 SubPipeline + 1 Notification) + 6 feature + 5 model = 14
      expect(dag.nodes.size).toBe(14);
    });

    it('should have 3 top-level tasks', () => {
      const topLevel = dag.allNodes().filter(n => !n.parent);
      expect(topLevel.length).toBe(3);
    });

    it('should include non-SubPipeline root task (notify_ml_team)', () => {
      const notify = dag.allNodes().find(n =>
        n.displayName === 'Notify ML Team' || n.id.includes('notify_ml_team')
      )!;
      expect(notify).toBeTruthy();
      expect(notify.taskType).toBe('Notification');
      expect(notify.isSubPipeline).toBe(false);
    });

    it('should build edge chain: feature -> model -> notify', () => {
      const edges = dag.allEdges().filter(e => {
        const s = dag.getNode(e.sourceId)!;
        return !s.parent;
      });
      expect(edges.length).toBe(2);
    });
  });

  describe('DAG Builder - resetAllStatuses', () => {
    const dag = buildDag(eltPipelines);

    it('should reset all node statuses to pending', () => {
      // Simulate some status changes
      const nodes = dag.allNodes();
      nodes[0].status = 'running';
      nodes[1].status = 'complete';
      nodes[2].status = 'failed';

      dag.resetAllStatuses();

      for (const node of dag.allNodes()) {
        expect(node.status).toBe('pending');
      }
    });

    it('should reset all edge statuses to pending', () => {
      for (const edge of dag.allEdges()) {
        edge.status = 'running';
      }

      dag.resetAllStatuses();

      for (const edge of dag.allEdges()) {
        expect(edge.status).toBe('pending');
      }
    });
  });
}
