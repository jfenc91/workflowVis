// Right panel: node info, events, datasets

import type { DagNode } from '../data/dag-builder.js';
import type { Dataset } from '../types.js';
import { getTaskTypeColor, getStatusColor } from '../util/color.js';
import { formatDuration, formatBytes, formatRowCount } from '../util/format.js';

const DATA_API_BASE = `${location.protocol}//${location.hostname}:8001`;

/**
 * Detect dataset format from name/namespace.
 * Returns 'json' | 'csv' (default).
 */
function detectFormat(ds: Dataset): 'json' | 'csv' {
  const name = (ds.name || '').toLowerCase();
  const ns = (ds.namespace || '').toLowerCase();
  if (name.endsWith('.json') || name.endsWith('.jsonl') || name.endsWith('.ndjson') ||
      ns.includes('/json') || ns.includes('api/') || name.includes('.json')) {
    return 'json';
  }
  return 'csv';
}

export class DetailPanel {
  container: HTMLElement;
  currentNode: DagNode | null;
  rawPipelines: Map<string, unknown>;

  constructor(container: HTMLElement) {
    this.container = container;
    this.currentNode = null;
    this.rawPipelines = new Map();
  }

  setRawPipelines(raw: Map<string, unknown>): void {
    this.rawPipelines = raw;
  }

  show(node: DagNode): void {
    this.currentNode = node;
    this.container.classList.add('visible');
    this._render(node);
  }

  hide(): void {
    this.currentNode = null;
    this.container.classList.remove('visible');
    this.container.innerHTML = '';
  }

  update(): void {
    if (this.currentNode) this._render(this.currentNode);
  }

  _render(node: DagNode): void {
    const typeColor = getTaskTypeColor(node.taskType);
    const statusColor = getStatusColor(node.status);

    let html = `
      <div class="detail-header">
        <div class="detail-close" id="detail-close">&times;</div>
        <h3 class="detail-title">${escapeHtml(node.displayName)}</h3>
        <div class="detail-meta">
          <span class="detail-badge" style="background:${typeColor.accent};color:white">${node.taskType}</span>
          <span class="detail-badge" style="background:${statusColor.badge};color:white">${node.status}</span>
        </div>
      </div>
      <div class="detail-body">
        <div class="detail-section">
          <h4>Raw JSON</h4>
          <div class="detail-json-actions">
            <button class="detail-json-btn" id="btn-pipeline-json">{ } Pipeline</button>
            <button class="detail-json-btn" id="btn-events-json">{ } Events</button>
          </div>
        </div>
    `;

    // Description
    if (node.description) {
      html += `<div class="detail-section">
        <h4>Description</h4>
        <p class="detail-desc">${escapeHtml(node.description)}</p>
      </div>`;
    }

    // Timing
    html += `<div class="detail-section">
      <h4>Timing</h4>
      <div class="detail-grid">
        <span class="detail-label">Duration:</span>
        <span>${formatDuration(node.duration)}</span>
        <span class="detail-label">Start:</span>
        <span>${node.startTime ? new Date(node.startTime).toISOString().substring(11, 19) : '\u2014'}</span>
        <span class="detail-label">End:</span>
        <span>${node.endTime ? new Date(node.endTime).toISOString().substring(11, 19) : '\u2014'}</span>
      </div>
    </div>`;

    // Retry attempts
    if (node.attempts.length > 0) {
      html += `<div class="detail-section">
        <h4>Retry History</h4>`;
      for (let i = 0; i < node.attempts.length; i++) {
        const a = node.attempts[i];
        html += `<div class="detail-attempt detail-attempt-${a.status}">
          <strong>Attempt ${i + 1}</strong> \u2014 ${a.status}
          ${a.error ? `<div class="detail-error">${escapeHtml(a.error.message)}</div>` : ''}
        </div>`;
      }
      html += `</div>`;
    }

    // Error
    if (node.error) {
      html += `<div class="detail-section">
        <h4>Error</h4>
        <div class="detail-error-box">
          <div class="detail-error-msg">${escapeHtml(node.error.message)}</div>
          ${node.error.stackTrace ? `<pre class="detail-stacktrace">${escapeHtml(node.error.stackTrace)}</pre>` : ''}
        </div>
      </div>`;
    }

    // SQL
    if (node.taskSQL) {
      html += `<div class="detail-section">
        <h4>SQL</h4>
        <pre class="detail-sql">${escapeHtml(node.taskSQL)}</pre>
      </div>`;
    }

    // Datasets
    if (node.datasets.inputs.length > 0 || node.datasets.outputs.length > 0) {
      html += `<div class="detail-section"><h4>Datasets</h4>`;

      if (node.datasets.inputs.length > 0) {
        html += `<div class="detail-ds-group"><h5>Inputs</h5>`;
        for (const ds of node.datasets.inputs) {
          html += this._renderDataset(ds, 'input');
        }
        html += `</div>`;
      }

      if (node.datasets.outputs.length > 0) {
        html += `<div class="detail-ds-group"><h5>Outputs</h5>`;
        for (const ds of node.datasets.outputs) {
          html += this._renderDataset(ds, 'output');
        }
        html += `</div>`;
      }

      html += `</div>`;
    }

    // Event log
    if (node.events.length > 0) {
      html += `<div class="detail-section">
        <h4>Event Log</h4>
        <div class="detail-events">`;
      for (const evt of node.events) {
        const time = evt.eventTime.substring(11, 19);
        const typeClass = `event-${evt.eventType.toLowerCase()}`;
        html += `<div class="detail-event ${typeClass}">
          <span class="detail-event-time">${time}</span>
          <span class="detail-event-type">${escapeHtml(evt.eventType)}</span>
          <span class="detail-event-job">${escapeHtml(evt.jobName)}</span>
        </div>`;
      }
      html += `</div></div>`;
    }

    html += `</div>`; // detail-body

    this.container.innerHTML = html;

    // Close button
    this.container.querySelector('#detail-close')?.addEventListener('click', () => {
      this.hide();
    });

    // JSON inspector buttons
    this.container.querySelector('#btn-pipeline-json')?.addEventListener('click', () => {
      const raw = this.rawPipelines.get(node.pipelineName);
      this._showJsonModal(`Pipeline: ${node.pipelineName}`, raw ?? null);
    });
    this.container.querySelector('#btn-events-json')?.addEventListener('click', () => {
      const rawEvents = node.events.map(e => e._raw).filter(Boolean);
      this._showJsonModal(`Events: ${node.displayName}`, rawEvents);
    });

    // Wire up clickable datasets (all datasets are clickable now)
    this.container.querySelectorAll('.detail-dataset-clickable').forEach(el => {
      el.addEventListener('click', (e) => {
        // Don't open preview if they clicked the inline download button
        if ((e.target as HTMLElement).closest('.detail-ds-download-btn')) return;
        const dsIndex = parseInt((el as HTMLElement).dataset.dsIndex!, 10);
        const dsType = (el as HTMLElement).dataset.dsType!;
        const datasets = dsType === 'input' ? node.datasets.inputs : node.datasets.outputs;
        const ds = datasets[dsIndex];
        if (ds) this._showPreview(ds);
      });
    });

    // Wire up inline download buttons
    this.container.querySelectorAll('.detail-ds-download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dsIndex = parseInt((btn as HTMLElement).dataset.dsIndex!, 10);
        const dsType = (btn as HTMLElement).dataset.dsType!;
        const datasets = dsType === 'input' ? node.datasets.inputs : node.datasets.outputs;
        const ds = datasets[dsIndex];
        if (ds && ds.fields && ds.fields.length > 0) {
          this._downloadData(ds);
        }
      });
    });
  }

  _showJsonModal(title: string, json: unknown): void {
    const jsonStr = JSON.stringify(json, null, 2) || 'null';
    const highlighted = highlightJson(jsonStr);
    const overlay = document.createElement('div');
    overlay.className = 'data-preview-overlay';
    overlay.innerHTML = `
      <div class="data-preview-modal">
        <div class="data-preview-header">
          <h3>${escapeHtml(title)}</h3>
          <div class="data-preview-actions">
            <button class="data-preview-download" id="json-modal-copy">Copy</button>
            <button class="data-preview-close">&times;</button>
          </div>
        </div>
        <div class="data-preview-table-wrap">
          <pre class="data-preview-json">${highlighted}</pre>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.data-preview-close')!.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.querySelector('#json-modal-copy')!.addEventListener('click', () => {
      navigator.clipboard.writeText(jsonStr).then(() => {
        const btn = overlay.querySelector('#json-modal-copy')!;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    });
  }

  _renderDataset(ds: Dataset, type: 'input' | 'output'): string {
    const shortName = ds.name.split('/').pop() || ds.name;
    const hasFields = ds.fields && ds.fields.length > 0;
    const fmt = detectFormat(ds);
    const fmtLabel = fmt === 'json' ? 'JSON' : 'CSV';
    const dsIndex = type === 'input'
      ? this.currentNode!.datasets.inputs.indexOf(ds)
      : this.currentNode!.datasets.outputs.indexOf(ds);

    let html = `<div class="detail-dataset detail-dataset-clickable" data-ds-index="${dsIndex}" data-ds-type="${type}">
      <div class="detail-ds-name" title="${escapeHtml(ds.namespace)}/${escapeHtml(ds.name)}">
        ${escapeHtml(shortName)}
        <button class="detail-ds-download-btn${hasFields ? '' : ' disabled'}" data-ds-index="${dsIndex}" data-ds-type="${type}" title="${hasFields ? `Download ${fmtLabel}` : 'No schema available for download'}">&#8615;</button>
      </div>
      <div class="detail-ds-ns">${escapeHtml(ds.namespace)}</div>`;

    if (ds.stats) {
      html += `<div class="detail-ds-stats">`;
      if (ds.stats.rowCount != null) html += `<span>Rows: ${formatRowCount(ds.stats.rowCount)}</span>`;
      if (ds.stats.size != null) html += `<span>Size: ${formatBytes(ds.stats.size)}</span>`;
      html += `</div>`;
    }

    if (ds.fields) {
      html += `<div class="detail-ds-fields">`;
      for (const f of ds.fields.slice(0, 8)) {
        html += `<span class="detail-field">${escapeHtml(f.name)}: <em>${escapeHtml(f.type)}</em></span>`;
      }
      if (ds.fields.length > 8) {
        html += `<span class="detail-field">... +${ds.fields.length - 8} more</span>`;
      }
      html += `</div>`;
    }

    html += `<div class="detail-ds-preview-hint">${hasFields ? 'Click to preview data' : 'Click to view details'}</div>`;

    html += `</div>`;
    return html;
  }

  async _showPreview(ds: Dataset): Promise<void> {
    const shortName = ds.name.split('/').pop() || ds.name;
    const hasFields = ds.fields && ds.fields.length > 0;
    const fmt = detectFormat(ds);
    const fmtLabel = fmt === 'json' ? 'JSON' : 'CSV';
    const overlay = document.createElement('div');
    overlay.className = 'data-preview-overlay';
    overlay.innerHTML = `
      <div class="data-preview-modal">
        <div class="data-preview-header">
          <h3>${escapeHtml(shortName)}</h3>
          <div class="data-preview-actions">
            ${hasFields ? `<button class="data-preview-download">Download ${fmtLabel}</button>` : ''}
            <button class="data-preview-close">&times;</button>
          </div>
        </div>
        <div class="data-preview-meta">
          <span class="data-preview-meta-label">Namespace:</span> ${escapeHtml(ds.namespace)}<br>
          <span class="data-preview-meta-label">Name:</span> ${escapeHtml(ds.name)}
          ${ds.stats ? `<br><span class="data-preview-meta-label">Stats:</span> ${ds.stats.rowCount != null ? formatRowCount(ds.stats.rowCount) + ' rows' : ''}${ds.stats.size != null ? ', ' + formatBytes(ds.stats.size) : ''}` : ''}
        </div>
        <div class="data-preview-status">${hasFields ? 'Loading preview...' : ''}</div>
        <div class="data-preview-table-wrap"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close handlers
    const close = () => overlay.remove();
    overlay.querySelector('.data-preview-close')!.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Download handler
    const dlBtn = overlay.querySelector('.data-preview-download');
    if (dlBtn) {
      dlBtn.addEventListener('click', () => this._downloadData(ds));
    }

    const statusEl = overlay.querySelector('.data-preview-status')!;
    const tableWrap = overlay.querySelector('.data-preview-table-wrap')!;

    // No fields — show info-only view
    if (!hasFields) {
      tableWrap.innerHTML = `
        <div class="data-preview-no-schema">
          <p>No schema information available for this dataset.</p>
          <p>Schema data is needed to generate a preview and download.</p>
        </div>
      `;
      return;
    }

    // Fetch preview
    try {
      const res = await fetch(`${DATA_API_BASE}/api/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: ds.fields, datasetName: shortName }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      statusEl.textContent = `Showing ${data.rows.length} of ~${data.totalAvailable.toLocaleString()} rows`;

      if (fmt === 'json') {
        // Render as JSON objects
        const objects = data.rows.map((row: unknown[]) => {
          const obj: Record<string, unknown> = {};
          data.columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
          return obj;
        });
        const jsonStr = objects.map((o: Record<string, unknown>) => JSON.stringify(o, null, 2)).join(',\n');
        tableWrap.innerHTML = `<pre class="data-preview-json">${highlightJson(`[\n${jsonStr}\n]`)}</pre>`;
      } else {
        // Render as table
        let tableHtml = '<table class="data-preview-table"><thead><tr>';
        for (const col of data.columns) {
          tableHtml += `<th>${escapeHtml(col)}</th>`;
        }
        tableHtml += '</tr></thead><tbody>';
        for (const row of data.rows) {
          tableHtml += '<tr>';
          for (const cell of row) {
            const val = cell === null || cell === undefined ? '' : String(cell);
            tableHtml += `<td title="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';
        tableWrap.innerHTML = tableHtml;
      }
    } catch (err) {
      statusEl.textContent = '';
      tableWrap.innerHTML = `
        <div class="data-preview-error">
          <p>Could not load preview data.</p>
          <p>Make sure the data server is running:<br>
          <code>python3 api/data_server.py</code></p>
          <p class="data-preview-error-detail">${escapeHtml((err as Error).message)}</p>
        </div>
      `;
    }
  }

  async _downloadData(ds: Dataset): Promise<void> {
    const shortName = ds.name.split('/').pop() || ds.name;
    const fmt = detectFormat(ds);
    const endpoint = fmt === 'json' ? '/api/download-json' : '/api/download';
    const ext = fmt === 'json' ? (shortName.endsWith('.jsonl') ? '.jsonl' : '.json') : '.csv';

    try {
      const res = await fetch(`${DATA_API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: ds.fields, datasetName: shortName }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use original name if it already has the right extension, else append
      a.download = shortName.endsWith(ext) ? shortName : shortName + ext;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${(err as Error).message}\n\nMake sure the data server is running:\npython3 api/data_server.py`);
    }
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Syntax-highlight a JSON string by wrapping tokens in <span> elements.
 * Handles keys, strings, numbers, booleans, and null.
 */
function highlightJson(json: string): string {
  // Regex matches JSON tokens in order: strings, numbers, booleans/null, structural chars
  return json.replace(
    /("(?:\\.|[^"\\])*")\s*(:)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(true|false|null)\b|([{}[\],])/g,
    (match, key, colon, str, num, lit, punct) => {
      if (key !== undefined) {
        return `<span class="json-key">${escapeHtml(key)}</span>${colon}`;
      }
      if (str !== undefined) {
        return `<span class="json-string">${escapeHtml(str)}</span>`;
      }
      if (num !== undefined) {
        return `<span class="json-number">${escapeHtml(num)}</span>`;
      }
      if (lit !== undefined) {
        return `<span class="json-${lit === 'null' ? 'null' : 'boolean'}">${lit}</span>`;
      }
      if (punct !== undefined) {
        return `<span class="json-punct">${punct}</span>`;
      }
      return match;
    }
  );
}
