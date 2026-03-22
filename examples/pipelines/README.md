# OpenMetadata Nested Pipeline Examples

OpenMetadata's pipeline schema models tasks as a flat DAG (via `downstreamTasks`).
It does **not** natively support nested/hierarchical pipelines.

These examples demonstrate a **convention-based nesting pattern**:

1. **Parent pipelines** have tasks whose `name` matches a child pipeline's FQN.
   The custom property `"taskType": "SubPipeline"` marks these tasks as references
   to standalone child pipeline entities.

2. **Child pipelines** are full, independent pipeline entities that can run on
   their own or be invoked as a step within a parent.

3. **Linking** is done via naming: a parent task's `name` equals the child
   pipeline's `fullyQualifiedName`.

## Example Structure

```
orchestrator_daily_pipeline          (parent)
  |-- task: extract_pipeline         --> child pipeline: Airflow.extract_pipeline
  |-- task: transform_pipeline       --> child pipeline: Airflow.transform_pipeline
  |-- task: load_and_publish         --> child pipeline: Airflow.load_and_publish_pipeline
```

Each child pipeline has its own tasks with their own DAG structure.

## Files

| File | Description |
|------|-------------|
| `orchestrator_pipeline.json` | Top-level daily orchestrator (parent) |
| `extract_pipeline.json` | Data extraction sub-pipeline |
| `transform_pipeline.json` | Data transformation sub-pipeline |
| `load_and_publish_pipeline.json` | Load + publish sub-pipeline |
| `ml_training_pipeline.json` | ML example: parent pipeline with nested sub-pipelines |
| `ml_feature_pipeline.json` | ML example: feature engineering sub-pipeline |
| `ml_model_pipeline.json` | ML example: model train/eval sub-pipeline |
