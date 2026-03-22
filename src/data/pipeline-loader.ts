// Fetch and normalize pipeline JSON definitions

import type { Pipeline, Task } from '../types.js';
import { initValidators, validatePipeline } from './validators.js';

interface RawTag {
  tagFQN: string;
}

interface RawTask {
  name: string;
  displayName: string;
  fullyQualifiedName: string;
  description?: string;
  taskType?: string;
  taskSQL?: string;
  downstreamTasks?: string[];
}

interface RawPipeline {
  id: string;
  name: string;
  displayName: string;
  fullyQualifiedName: string;
  description?: string;
  scheduleInterval?: string;
  concurrency?: number;
  tags?: RawTag[];
  tasks?: RawTask[];
}

export async function loadPipelines(paths: string[]): Promise<{ pipelines: Pipeline[]; raw: Map<string, unknown> }> {
  await initValidators();
  const responses: RawPipeline[] = await Promise.all(paths.map(p => fetch(p).then(r => r.json())));
  for (let i = 0; i < responses.length; i++) {
    validatePipeline(responses[i], paths[i]);
  }
  const raw = new Map<string, unknown>();
  for (const r of responses) {
    raw.set(r.name, r);
  }
  return { pipelines: responses.map(normalizePipeline), raw };
}

function normalizePipeline(raw: RawPipeline): Pipeline {
  return {
    id: raw.id,
    name: raw.name,
    displayName: raw.displayName,
    fqn: raw.fullyQualifiedName,
    description: raw.description || '',
    scheduleInterval: raw.scheduleInterval || null,
    concurrency: raw.concurrency || 1,
    tags: (raw.tags || []).map(t => t.tagFQN),
    tasks: (raw.tasks || []).map(normalizeTask),
  };
}

function normalizeTask(raw: RawTask): Task {
  return {
    name: raw.name,
    displayName: raw.displayName,
    fqn: raw.fullyQualifiedName,
    description: raw.description || '',
    taskType: raw.taskType || 'Unknown',
    taskSQL: raw.taskSQL || null,
    downstreamTasks: raw.downstreamTasks || [],
  };
}
