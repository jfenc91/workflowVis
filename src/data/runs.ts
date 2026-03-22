// Run definitions mapping pipeline + event files

import type { RunDefinition } from '../types.js';

export const RUNS: Record<string, RunDefinition> = {
  elt: {
    label: 'ELT Pipeline',
    pipelines: [
      'examples/pipelines/orchestrator_pipeline.json',
      'examples/pipelines/extract_pipeline.json',
      'examples/pipelines/transform_pipeline.json',
      'examples/pipelines/load_and_publish_pipeline.json',
    ],
    events: [
      'examples/events/elt/01_orchestrator_events.json',
      'examples/events/elt/02_extract_events.json',
      'examples/events/elt/03_transform_events.json',
      'examples/events/elt/04_load_publish_events.json',
    ],
  },
  ml: {
    label: 'ML Training',
    pipelines: [
      'examples/pipelines/ml_training_pipeline.json',
      'examples/pipelines/ml_feature_pipeline.json',
      'examples/pipelines/ml_model_pipeline.json',
    ],
    events: [
      'examples/events/ml/01_ml_orchestrator_events.json',
      'examples/events/ml/02_feature_events.json',
      'examples/events/ml/03_model_events.json',
    ],
  },
  failed: {
    label: 'Failed Ingest',
    pipelines: [
      'examples/pipelines/failed_ingest_pipeline.json',
    ],
    events: [
      'examples/events/failed/01_failed_ingest_events.json',
    ],
  },
  order: {
    label: 'Order Processing',
    pipelines: [
      'examples/pipelines/sfn_order_orchestrator.json',
      'examples/pipelines/sfn_payment_flow.json',
      'examples/pipelines/sfn_fulfillment_flow.json',
    ],
    events: [
      'examples/events/order/01_order_orchestrator_events.json',
      'examples/events/order/02_payment_events.json',
      'examples/events/order/03_fulfillment_events.json',
    ],
  },
  media: {
    label: 'Media Pipeline',
    pipelines: [
      'examples/pipelines/sfn_media_orchestrator.json',
      'examples/pipelines/sfn_transcode_flow.json',
    ],
    events: [
      'examples/events/media/01_media_orchestrator_events.json',
      'examples/events/media/02_transcode_events.json',
    ],
  },
  checkout: {
    label: 'Checkout (Retry)',
    pipelines: [
      'examples/pipelines/sfn_checkout_workflow.json',
    ],
    events: [
      'examples/events/checkout/01_checkout_events.json',
    ],
  },
  batch: {
    label: 'Batch (Map + Loop)',
    pipelines: [
      'examples/pipelines/sfn_batch_orchestrator.json',
      'examples/pipelines/sfn_document_map.json',
    ],
    events: [
      'examples/events/batch/01_batch_orchestrator_events.json',
      'examples/events/batch/02_document_map_events.json',
    ],
  },
  'invalid-pipeline': {
    label: 'Invalid Pipeline',
    pipelines: [
      'examples/pipelines/invalid_pipeline.json',
    ],
    events: [
      'examples/events/failed/01_failed_ingest_events.json',
    ],
  },
  'invalid-event': {
    label: 'Invalid Event',
    pipelines: [
      'examples/pipelines/failed_ingest_pipeline.json',
    ],
    events: [
      'examples/events/invalid/01_invalid_events.json',
    ],
  },
};
