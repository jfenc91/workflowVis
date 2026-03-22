// Index and store OpenLineage events

import type { PipelineEvent, Dataset, DatasetStats } from '../types.js';
import { initValidators, validateEvent, validateEventFacets } from './validators.js';

interface RawRunFacets {
  parent?: {
    run: { runId: string };
    job: { name: string };
  };
  errorMessage?: {
    message: string;
    programmingLanguage: string;
    stackTrace?: string;
  };
}

interface RawJobFacets {
  jobType?: { jobType: string };
  sql?: { query: string };
}

interface RawDatasetFacets {
  schema?: { fields: Array<{ name: string; type: string }> };
}

interface RawDatasetInputFacets {
  inputStatistics?: { rowCount: number; size: number };
  dataQualityMetrics?: { rowCount: number; columnMetrics: Record<string, unknown> };
}

interface RawDatasetOutputFacets {
  outputStatistics?: { rowCount: number; size: number };
}

interface RawDataset {
  namespace: string;
  name: string;
  facets?: RawDatasetFacets;
  inputFacets?: RawDatasetInputFacets;
  outputFacets?: RawDatasetOutputFacets;
}

interface RawOpenLineageEvent {
  eventTime: string;
  eventType: string;
  job: {
    name: string;
    namespace: string;
    facets?: RawJobFacets;
  };
  run: {
    runId: string;
    facets?: RawRunFacets;
  };
  inputs?: RawDataset[];
  outputs?: RawDataset[];
}

export async function loadEvents(paths: string[]): Promise<PipelineEvent[]> {
  await initValidators();
  const allEvents: PipelineEvent[] = [];
  const responses: RawOpenLineageEvent[][] = await Promise.all(paths.map(p => fetch(p).then(r => r.json())));
  for (let r = 0; r < responses.length; r++) {
    const events = responses[r];
    for (let i = 0; i < events.length; i++) {
      validateEvent(events[i], i, paths[r]);
      const facetWarnings = validateEventFacets(
        events[i] as unknown as Record<string, unknown>, i, paths[r],
      );
      for (const w of facetWarnings) {
        console.warn(
          `Facet warning: event #${w.eventIndex} ${w.location}.${w.facetKey}: ${w.message}` +
          (w.source ? ` (${w.source})` : ''),
        );
      }
      allEvents.push(normalizeEvent(events[i]));
    }
  }
  // Sort by eventTime
  allEvents.sort((a, b) => a.timestamp - b.timestamp);
  return allEvents;
}

function normalizeEvent(raw: RawOpenLineageEvent): PipelineEvent {
  const timestamp = new Date(raw.eventTime).getTime();
  const jobName = raw.job.name;
  const jobNamespace = raw.job.namespace;
  const runId = raw.run.runId;
  const eventType = raw.eventType as PipelineEvent['eventType']; // START | COMPLETE | FAIL

  // Parse job name: "pipeline_name.task_name" or just "pipeline_name"
  const dotIdx = jobName.indexOf('.');
  const pipelineName = dotIdx >= 0 ? jobName.substring(0, dotIdx) : jobName;
  const taskName = dotIdx >= 0 ? jobName.substring(dotIdx + 1) : null;

  // Extract parent info
  let parentRunId: string | null = null;
  let parentJobName: string | null = null;
  if (raw.run.facets?.parent) {
    parentRunId = raw.run.facets.parent.run.runId;
    parentJobName = raw.run.facets.parent.job.name;
  }

  // Job type (DAG vs TASK)
  const jobType = raw.job.facets?.jobType?.jobType || null;

  // Error info
  let error: PipelineEvent['error'] = null;
  if (raw.run.facets?.errorMessage) {
    error = {
      message: raw.run.facets.errorMessage.message,
      language: raw.run.facets.errorMessage.programmingLanguage,
      stackTrace: raw.run.facets.errorMessage.stackTrace || null,
    };
  }

  // SQL
  const sql = raw.job.facets?.sql?.query || null;

  // Datasets
  const inputs = (raw.inputs || []).map(normalizeDataset);
  const outputs = (raw.outputs || []).map(normalizeDataset);

  return {
    timestamp,
    eventTime: raw.eventTime,
    eventType,
    runId,
    jobName,
    jobNamespace,
    pipelineName,
    taskName,
    parentRunId,
    parentJobName,
    jobType,
    error,
    sql,
    inputs,
    outputs,
    _raw: raw,
  };
}

function normalizeDataset(ds: RawDataset): Dataset {
  const result: Dataset = {
    namespace: ds.namespace,
    name: ds.name,
    fields: null,
    stats: null,
  };

  // Schema facet
  if (ds.facets?.schema?.fields) {
    result.fields = ds.facets.schema.fields;
  }

  // Input statistics
  if (ds.inputFacets?.inputStatistics) {
    result.stats = {
      rowCount: ds.inputFacets.inputStatistics.rowCount,
      size: ds.inputFacets.inputStatistics.size,
    };
  }
  if (ds.inputFacets?.dataQualityMetrics) {
    result.stats = result.stats || {};
    result.stats.rowCount = ds.inputFacets.dataQualityMetrics.rowCount;
    result.stats.columnMetrics = ds.inputFacets.dataQualityMetrics.columnMetrics;
  }

  // Output statistics
  if (ds.outputFacets?.outputStatistics) {
    result.stats = {
      rowCount: ds.outputFacets.outputStatistics.rowCount,
      size: ds.outputFacets.outputStatistics.size,
    };
  }

  return result;
}
