// Reusable pipeline visualization engine.
// Accepts a DataSource and a DOM container; owns all rendering, UI, and interaction.

import type { DagModel } from './data/dag-builder.js';
import type { DataSource } from './data/data-source.js';
import type { SimulationSource } from './harness/simulation-source.js';
import type { LayoutOptions } from './types.js';
import { ValidationError } from './data/validators.js';
import { LayoutAnimator } from './layout/animator.js';
import { relayout, toggleSubPipeline } from './layout/group-layout.js';
import { Camera } from './render/camera.js';
import { CanvasRenderer } from './render/canvas-renderer.js';
import { WebGLOverlay } from './render/webgl-overlay.js';
import { Controls } from './ui/controls.js';
import { DetailPanel } from './ui/detail-panel.js';
import { Interaction } from './ui/interaction.js';
import { Minimap } from './ui/minimap.js';

export class PipelineVisualizer {
  container: HTMLElement;
  source: DataSource;
  dagModel: DagModel | null;
  camera: Camera;
  _loopRunning: boolean;

  mainCanvas!: HTMLCanvasElement;
  glCanvas!: HTMLCanvasElement;

  renderer!: CanvasRenderer;
  webgl!: WebGLOverlay;

  controls!: Controls;
  detailPanel!: DetailPanel;
  interaction!: Interaction;
  minimap!: Minimap;

  // Extension point: called each render frame so harness can update its UI
  onFrame: ((time: number) => void) | null;

  _layoutOptions: LayoutOptions | undefined;
  _animator: LayoutAnimator;

  constructor(container: HTMLElement, source: DataSource, layoutOptions?: LayoutOptions) {
    this.container = container;
    this.source = source;
    this.dagModel = null;
    this.camera = new Camera();
    this._loopRunning = false;
    this.onFrame = null;
    this._layoutOptions = layoutOptions;
    this._animator = new LayoutAnimator();

    this._ensureDom();

    // DOM elements
    this.mainCanvas = container.querySelector('#main-canvas') as HTMLCanvasElement;
    this.glCanvas = container.querySelector('#gl-canvas') as HTMLCanvasElement;

    // Renderers
    this.renderer = new CanvasRenderer(this.mainCanvas, this.camera);
    this.webgl = new WebGLOverlay(this.glCanvas);

    // UI — pass source's runs to Controls
    this.controls = new Controls(container.querySelector('#toolbar') as HTMLElement, source.runs);
    this.detailPanel = new DetailPanel(container.querySelector('#detail-panel') as HTMLElement);
    this.interaction = new Interaction(this.mainCanvas, this.camera, this.renderer);
    this.minimap = new Minimap(container.querySelector('#canvas-container') as HTMLElement, this.camera);

    // Apply capability gating
    this.controls.setCapabilities(source.capabilities);

    // Theme
    this._initTheme();

    this._wireEvents();
    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());

    // No ResizeObserver — the render loop handles canvas resizing each frame
    // so resize + draw always happen together (no blank-frame flicker).

    // Wire source callbacks once — handler references this.dagModel which
    // is updated on each loadRun, so no re-registration needed.
    this.source.onNodeEvent((nodeId, event) => {
      if (!this.dagModel) return;
      const node = this.dagModel.getNode(nodeId);
      if (!node) return;
      this.webgl.addRipple(node.x + node.width / 2, node.y + node.height / 2);
      if (event.eventType === 'COMPLETE') {
        this.webgl.spawnCompletionBurst(node);
        this.renderer.flashCompletion(nodeId);
      }
      if (event.eventType === 'FAIL') {
        this.webgl.spawnFailFlash(node);
      }
      this.detailPanel.update();
    });

    this.source.onDynamicBind(() => {
      if (this.dagModel) {
        this._animator.snapshot(this.dagModel);
        relayout(this.dagModel, this._layoutOptions);
        this._animator.start(this.dagModel, performance.now());
        this.camera.fitToContentAnimated(this.dagModel.allNodes());
      }
    });
  }

  // Create the expected DOM structure if it doesn't already exist.
  _ensureDom(): void {
    if (this.container.querySelector('#toolbar')) return;

    this.container.innerHTML = `
      <div id="toolbar"></div>
      <div id="main-area">
        <div id="canvas-container">
          <canvas id="main-canvas"></canvas>
          <canvas id="gl-canvas"></canvas>
        </div>
        <div id="detail-panel"></div>
      </div>
      <div id="timeline"></div>
    `;
  }

  // Slot for harness to inject playback buttons into toolbar center
  get playbackSlot(): HTMLElement {
    return this.container.querySelector('#toolbar-playback') as HTMLElement;
  }

  // Slot for harness to inject timeline UI
  get timelineSlot(): HTMLElement {
    return this.container.querySelector('#timeline') as HTMLElement;
  }

  // Slot for harness to inject status info (event counter, etc.) into toolbar right
  get statusSlot(): HTMLElement {
    return this.container.querySelector('#toolbar-status') as HTMLElement;
  }

  _initTheme(): void {
    try {
      const saved = localStorage.getItem('pv-theme');
      if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch (_) {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    this.controls.setThemeIcon(isDark);
  }

  _toggleTheme(): void {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    try { localStorage.setItem('pv-theme', newTheme); } catch (_) {}
    this.controls.setThemeIcon(!isDark);
  }

  _wireEvents(): void {
    // Controls
    this.controls.onRunChange = (key) => this.loadRun(key);

    // Theme toggle
    this.controls.onThemeToggle = () => this._toggleTheme();

    // Node interaction
    this.interaction.onNodeClick = (node) => {
      if (node) {
        this.detailPanel.show(node);
      } else {
        this.detailPanel.hide();
      }
    };

    this.interaction.onToggleSubPipeline = (nodeId) => {
      if (this.dagModel) {
        this._animator.snapshot(this.dagModel);
        toggleSubPipeline(this.dagModel, nodeId, this._layoutOptions);
        this._animator.start(this.dagModel, performance.now());
        this.camera.fitToContentAnimated(this.dagModel.allNodes());
      }
    };
  }

  _handleResize(): void {
    this.renderer.resize();
    this.webgl.resize();
  }

  /** Check if canvas container changed size and update buffers + camera in the same frame as render. */
  _syncCanvasSize(): void {
    const rect = this.mainCanvas.parentElement!.getBoundingClientRect();
    if (Math.abs(rect.width - this.camera.width) > 0.5 ||
        Math.abs(rect.height - this.camera.height) > 0.5) {
      this.renderer.resize();
      this.webgl.resize();
    }
  }

  async loadRun(key: string): Promise<void> {
    if (this.source.capabilities.runPicker) {
      this.controls.setRun(key);
    }

    this._clearError();

    try {
      this.dagModel = await this.source.load(key);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const rawJson = err instanceof ValidationError ? err.rawJson : undefined;
      this._showError(message, rawJson);
      return;
    }

    if (!this.dagModel) return;

    // Pass raw pipeline JSON to detail panel if available
    const simSource = this.source as SimulationSource;
    if (simSource.rawPipelines) {
      this.detailPanel.setRawPipelines(simSource.rawPipelines);
    }

    this.renderer.setDagModel(this.dagModel);
    this.interaction.setDagModel(this.dagModel);
    this.minimap.setDagModel(this.dagModel);

    relayout(this.dagModel, this._layoutOptions);

    this.camera.fitToContent(this.dagModel.allNodes());

    this.detailPanel.hide();

    if (!this._loopRunning) {
      this._loopRunning = true;
      this._renderLoop();
    }
  }

  _showError(message: string, rawJson?: unknown): void {
    this._clearError();
    const container = this.container.querySelector('#canvas-container');
    if (!container) return;

    const jsonBlock = rawJson !== undefined
      ? `<details class="load-error-details">
           <summary>Show raw JSON</summary>
           <pre class="load-error-json">${this._escapeHtml(JSON.stringify(rawJson, null, 2))}</pre>
         </details>`
      : '';

    const banner = document.createElement('div');
    banner.id = 'load-error';
    banner.innerHTML = `
      <div class="load-error-icon">&#x26A0;</div>
      <div class="load-error-content">
        <div class="load-error-title">Failed to load run</div>
        <div class="load-error-message">${this._escapeHtml(message)}</div>
        ${jsonBlock}
      </div>
    `;
    container.appendChild(banner);
  }

  _clearError(): void {
    const existing = this.container.querySelector('#load-error');
    if (existing) existing.remove();
  }

  _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _renderLoop(): void {
    const loop = (time: number): void => {
      // Sync canvas size with container each frame so resize + draw
      // always happen together (no blank frame when detail panel animates).
      this._syncCanvasSize();

      this.source.tick(time);

      // Animate layout transitions and camera
      if (this.dagModel) {
        this._animator.tick(this.dagModel, time);
      }
      this.camera.tickAnimation(time);

      if (this.dagModel) {
        this.renderer.render(this.dagModel, time, this.source.frameState.currentTime);
      }

      if (this.dagModel) {
        this.webgl.spawnEdgeParticles(this.dagModel, time);
        this.webgl.spawnNodeGlow(this.dagModel, time);
        this.webgl.spawnAmbientParticles(this.dagModel, time);
        this.webgl.render(this.camera, time);
      }

      this.minimap.render();

      this.onFrame?.(time);

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  destroy(): void {
    this._loopRunning = false;
    this.source.dispose();
  }
}
