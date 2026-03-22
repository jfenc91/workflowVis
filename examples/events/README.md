# OpenLineage Events - Simulated Pipeline Executions

OpenLineage RunEvents that simulate full execution of the nested pipelines defined in `../pipelines/`.

Each event follows the [OpenLineage spec](https://openlineage.io/spec/2-0-2/OpenLineage.json).

## Key Concepts

- **Every task** emits a `START` event and a terminal event (`COMPLETE`, `FAIL`, or `ABORT`)
- **Parent-child nesting** is encoded via the `parent` run facet — child runs reference their parent's `runId`, `namespace`, and `job.name`
- **Datasets** on `inputs`/`outputs` include `schema` facets; `COMPLETE` events add `outputStatistics`
- Events are ordered **chronologically** within each file

## Nesting Hierarchy

```
orchestrator_daily_pipeline  (run: d5e7a1b2...)
  └─ parent facet: none (root)
  │
  ├─ extract_pipeline  (run: a1b2c3d4...,  parent → orchestrator)
  │   ├─ extract_postgres_orders   (parent → extract_pipeline)
  │   ├─ extract_postgres_customers(parent → extract_pipeline)
  │   ├─ extract_s3_clickstream    (parent → extract_pipeline)
  │   ├─ stage_orders              (parent → extract_pipeline)
  │   ├─ stage_customers           (parent → extract_pipeline)
  │   └─ stage_clickstream         (parent → extract_pipeline)
  │
  ├─ transform_pipeline  (run: b2c3d4e5...,  parent → orchestrator)
  │   ├─ dbt_run_staging           (parent → transform_pipeline)
  │   ├─ dbt_run_intermediate      (parent → transform_pipeline)
  │   ├─ dbt_run_marts             (parent → transform_pipeline)
  │   └─ dbt_test                  (parent → transform_pipeline)
  │
  └─ load_and_publish_pipeline  (run: c3d4e5f6...,  parent → orchestrator)
      ├─ export_to_redshift        (parent → load_and_publish)
      ├─ export_to_elasticsearch   (parent → load_and_publish)
      ├─ refresh_tableau_extracts  (parent → load_and_publish)
      └─ notify_stakeholders       (parent → load_and_publish)
```

## Files

### ELT Scenario (all succeed)

| File | Events | Timespan |
|------|--------|----------|
| `elt/01_orchestrator_events.json` | 2 | 02:00:00 – 02:35:20 |
| `elt/02_extract_events.json` | 14 | 02:00:05 – 02:06:35 |
| `elt/03_transform_events.json` | 10 | 02:06:40 – 02:24:05 |
| `elt/04_load_publish_events.json` | 10 | 02:24:10 – 02:35:15 |

### ML Scenario (model training fails, then retries and succeeds)

| File | Events | Timespan |
|------|--------|----------|
| `ml/01_ml_orchestrator_events.json` | 2 | 01:00:00 – 05:02:10 |
| `ml/02_feature_events.json` | 14 | 01:00:05 – 02:01:00 |
| `ml/03_model_events.json` | 12 | 02:01:05 – 05:02:00 |

## Run ID Reference

| Pipeline / Task | Run ID |
|-----------------|--------|
| orchestrator_daily_pipeline | `d5e7a1b2-3c4d-4e5f-a6b7-c8d9e0f1a2b3` |
| extract_pipeline | `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d` |
| transform_pipeline | `b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e` |
| load_and_publish_pipeline | `c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f` |
| ml_churn_training_pipeline | `e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b` |
| ml_feature_pipeline | `f5a6b7c8-d9e0-4f1a-2b3c-4d5e6f7a8b9c` |
| ml_model_pipeline (attempt 1 - FAIL) | `a6b7c8d9-e0f1-4a2b-3c4d-5e6f7a8b9c0d` |
| ml_model_pipeline (attempt 2 - OK) | `b7c8d9e0-f1a2-4b3c-4d5e-6f7a8b9c0d1e` |
