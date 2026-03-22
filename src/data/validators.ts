// Runtime validation for pipeline (OpenMetadata) and event (OpenLineage) JSON.
// Loads the official JSON schemas and validates with AJV.
//
// Schema sources:
//   Pipeline: https://github.com/open-metadata/OpenMetadata/blob/main/openmetadata-spec/src/main/resources/json/schema/entity/data/pipeline.json
//   Events:  https://github.com/OpenLineage/OpenLineage/blob/main/spec/OpenLineage.json
//   Facets:  https://github.com/OpenLineage/OpenLineage/tree/main/spec/facets

import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';

// ── Exported type brands ────────────────────────────────────────────

export type ValidRawPipeline = {
  id: string;
  name: string;
  service: { id: string; type: string };
  [key: string]: unknown;
};

/** A validated OpenLineage event (RunEvent, DatasetEvent, or JobEvent). */
export type ValidRawEvent = {
  eventTime: string;
  producer: string;
  schemaURL: string;
  [key: string]: unknown;
};

// ── Facet validation types ──────────────────────────────────────────

export interface FacetWarning {
  facetKey: string;
  location: string;
  message: string;
  eventIndex: number;
  source?: string;
}

interface FacetValidatorEntry {
  facetKey: string;
  validate: ValidateFunction;
}

// ── Schema loading & AJV compilation ────────────────────────────────

let pipelineValidate: ValidateFunction | null = null;
let eventValidate: ValidateFunction | null = null;
let initPromise: Promise<void> | null = null;
const facetValidators = new Map<string, FacetValidatorEntry>();

async function loadSchema(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load schema: ${path} (${res.status})`);
  return res.json();
}

/**
 * Load individual facet schemas and compile per-facet validators.
 * Non-blocking — failure is logged but does not prevent app from working.
 */
async function loadFacetSchemas(ajv2020: InstanceType<typeof Ajv2020>): Promise<void> {
  const manifestRes = await fetch('/src/schemas/facets/manifest.json');
  if (!manifestRes.ok) throw new Error(`Failed to load facet manifest (${manifestRes.status})`);
  const filenames: string[] = await manifestRes.json();

  const schemas = await Promise.all(
    filenames.map(f => loadSchema(`/src/schemas/facets/${f}`))
  );

  for (const schema of schemas) {
    ajv2020.addSchema(schema);

    // Extract facet key from top-level properties (e.g., "parent", "sql", "schema")
    const props = schema.properties as Record<string, unknown> | undefined;
    if (!props) continue;

    for (const facetKey of Object.keys(props)) {
      const prop = props[facetKey] as { $ref?: string };
      if (!prop.$ref) continue;
      try {
        const validate = ajv2020.compile({ $ref: `${schema.$id}#/properties/${facetKey}` });
        facetValidators.set(facetKey, { facetKey, validate });
      } catch {
        // Skip facets that fail to compile (e.g., circular refs)
      }
    }
  }
}

/**
 * Initialize validators by loading and compiling the JSON schemas.
 * Idempotent — safe to call multiple times; schemas are loaded only once.
 */
export function initValidators(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const [pipelineSchema, eventSchema] = await Promise.all([
        loadSchema('/src/schemas/openmetadata-pipeline.json'),
        loadSchema('/src/schemas/openlineage-event.json'),
      ]);

      // Pipeline schema uses draft-07 (OpenMetadata)
      const ajv07 = new Ajv({ allErrors: true, strict: false });
      pipelineValidate = ajv07.compile(pipelineSchema);

      // Event schema uses draft-2020-12 (OpenLineage native format with $defs)
      const ajv2020 = new Ajv2020({ allErrors: true, strict: false });
      // The schema defines RunEvent, DatasetEvent, and JobEvent via oneOf.
      // Compile against RunEvent specifically since that's what the app processes.
      // DatasetEvent and JobEvent definitions remain in the schema for completeness.
      ajv2020.addSchema(eventSchema);
      const schemaId = (eventSchema as { $id?: string }).$id;
      eventValidate = ajv2020.compile({ $ref: `${schemaId}#/$defs/RunEvent` });

      // Load facet schemas — non-blocking; failure doesn't break the app
      try {
        await loadFacetSchemas(ajv2020);
      } catch (e) {
        console.warn('Failed to load facet schemas (facet validation disabled):', e);
      }
    })();
  }
  return initPromise;
}

// ── Error formatting ────────────────────────────────────────────────

function formatErrors(validate: ValidateFunction): string {
  if (!validate.errors || validate.errors.length === 0) return 'unknown error';
  const e = validate.errors[0];
  const path = e.instancePath || '';
  const msg = e.message || 'invalid';

  if (e.keyword === 'required') {
    const missing = (e.params as { missingProperty?: string }).missingProperty || '?';
    return `${path}: missing required field '${missing}'`;
  }
  if (e.keyword === 'enum') {
    const allowed = (e.params as { allowedValues?: unknown[] }).allowedValues || [];
    return `${path}: ${msg} (expected ${(allowed as string[]).join(', ')})`;
  }
  return `${path}: ${msg}`;
}

function formatSource(source?: string): string {
  return source ? ` (${source})` : '';
}

// ── Custom error with raw JSON ──────────────────────────────────────

export class ValidationError extends Error {
  rawJson: unknown;
  constructor(message: string, rawJson: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.rawJson = rawJson;
  }
}

// ── Public API ──────────────────────────────────────────────────────

export function validatePipeline(
  obj: unknown,
  source?: string,
): asserts obj is ValidRawPipeline {
  if (!pipelineValidate) {
    throw new Error('Validators not initialized. Call initValidators() first.');
  }
  if (!pipelineValidate(obj)) {
    const prefix = `Invalid pipeline${formatSource(source)}`;
    throw new ValidationError(`${prefix}: ${formatErrors(pipelineValidate)}`, obj);
  }
}

export function validateEvent(
  obj: unknown,
  index: number,
  source?: string,
): asserts obj is ValidRawEvent {
  if (!eventValidate) {
    throw new Error('Validators not initialized. Call initValidators() first.');
  }
  if (!eventValidate(obj)) {
    const prefix = `Invalid event #${index}${formatSource(source)}`;
    throw new ValidationError(`${prefix}: ${formatErrors(eventValidate)}`, obj);
  }
}

// ── Facet validation ────────────────────────────────────────────────

function validateFacetObject(
  facets: Record<string, unknown> | undefined,
  location: string,
  index: number,
  source: string | undefined,
  warnings: FacetWarning[],
): void {
  if (!facets || typeof facets !== 'object') return;
  for (const [key, value] of Object.entries(facets)) {
    const entry = facetValidators.get(key);
    if (!entry) continue; // custom/unknown facet — skip
    if (!entry.validate(value)) {
      const err = entry.validate.errors?.[0];
      const detail = err
        ? `${err.instancePath || ''}: ${err.message || 'invalid'}`
        : 'validation failed';
      warnings.push({
        facetKey: key,
        location,
        message: detail,
        eventIndex: index,
        source,
      });
    }
  }
}

/**
 * Validate facet contents within a structurally valid event.
 * Returns warnings for malformed facets. Unknown/custom facets are skipped.
 */
export function validateEventFacets(
  obj: Record<string, unknown>,
  index: number,
  source?: string,
): FacetWarning[] {
  if (facetValidators.size === 0) return [];

  const warnings: FacetWarning[] = [];
  const event = obj as {
    run?: { facets?: Record<string, unknown> };
    job?: { facets?: Record<string, unknown> };
    inputs?: Array<{
      facets?: Record<string, unknown>;
      inputFacets?: Record<string, unknown>;
    }>;
    outputs?: Array<{
      facets?: Record<string, unknown>;
      outputFacets?: Record<string, unknown>;
    }>;
  };

  validateFacetObject(event.run?.facets, 'run.facets', index, source, warnings);
  validateFacetObject(event.job?.facets, 'job.facets', index, source, warnings);

  if (event.inputs) {
    for (let i = 0; i < event.inputs.length; i++) {
      validateFacetObject(event.inputs[i].facets, `inputs[${i}].facets`, index, source, warnings);
      validateFacetObject(event.inputs[i].inputFacets, `inputs[${i}].inputFacets`, index, source, warnings);
    }
  }

  if (event.outputs) {
    for (let i = 0; i < event.outputs.length; i++) {
      validateFacetObject(event.outputs[i].facets, `outputs[${i}].facets`, index, source, warnings);
      validateFacetObject(event.outputs[i].outputFacets, `outputs[${i}].outputFacets`, index, source, warnings);
    }
  }

  return warnings;
}
