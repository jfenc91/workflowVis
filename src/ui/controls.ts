// Toolbar: run picker, theme toggle

import type { Capabilities, RunDefinition } from '../types.js';

export class Controls {
  container: HTMLElement;
  onRunChange: ((key: string) => void) | null;
  onThemeToggle: (() => void) | null;
  _runs: Record<string, RunDefinition>;

  constructor(container: HTMLElement, runs: Record<string, RunDefinition> = {}) {
    this.container = container;
    this.onRunChange = null;
    this.onThemeToggle = null;
    this._runs = runs;
    this._build();
  }

  _build(): void {
    this.container.innerHTML = `
      <div class="toolbar-left">
        <span class="toolbar-title">Pipeline Visualizer</span>
        <label class="toolbar-label" data-cap="runPicker">
          Run:
          <select id="run-select" class="toolbar-select"></select>
        </label>
      </div>
      <div class="toolbar-center" id="toolbar-playback"></div>
      <div class="toolbar-right" id="toolbar-status">
        <button id="btn-theme" class="theme-toggle" title="Toggle dark/light mode">&#x263E;</button>
      </div>
    `;

    // Populate run select from provided runs
    const runSelect = this.container.querySelector('#run-select') as HTMLSelectElement;
    for (const [key, run] of Object.entries(this._runs)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = run.label;
      runSelect.appendChild(opt);
    }

    // Event handlers
    runSelect.addEventListener('change', () => {
      this.onRunChange?.(runSelect.value);
    });

    // Theme toggle
    this.container.querySelector('#btn-theme')!.addEventListener('click', () => {
      this.onThemeToggle?.();
    });
  }

  setRun(key: string): void {
    (this.container.querySelector('#run-select') as HTMLSelectElement).value = key;
  }

  setThemeIcon(isDark: boolean): void {
    const btn = this.container.querySelector('#btn-theme')!;
    btn.innerHTML = isDark ? '&#x2600;' : '&#x263E;';
    (btn as HTMLElement).title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  setCapabilities(caps: Capabilities): void {
    for (const el of this.container.querySelectorAll('[data-cap]')) {
      const key = el.getAttribute('data-cap') as keyof Capabilities;
      (el as HTMLElement).style.display = caps[key] ? '' : 'none';
    }
  }
}
