// Mouse/touch: click, hover, pan, zoom

import type { DagModel, DagNode } from '../data/dag-builder.js';
import type { Camera } from '../render/camera.js';
import type { CanvasRenderer } from '../render/canvas-renderer.js';
import type { Point } from '../types.js';

export class Interaction {
  canvas: HTMLCanvasElement;
  camera: Camera;
  renderer: CanvasRenderer;
  dagModel: DagModel | null;

  // Callbacks
  onNodeClick: ((node: DagNode | null) => void) | null;
  onNodeHover: ((node: DagNode | null) => void) | null;
  onToggleSubPipeline: ((nodeId: string) => void) | null;

  // State
  _isMouseDown: boolean;
  _isPanning: boolean;
  _lastMouse: Point;
  _mouseDownPos: Point;

  constructor(canvas: HTMLCanvasElement, camera: Camera, renderer: CanvasRenderer) {
    this.canvas = canvas;
    this.camera = camera;
    this.renderer = renderer;
    this.dagModel = null;

    // Callbacks
    this.onNodeClick = null;
    this.onNodeHover = null;
    this.onToggleSubPipeline = null;

    // State
    this._isMouseDown = false;
    this._isPanning = false;
    this._lastMouse = { x: 0, y: 0 };
    this._mouseDownPos = { x: 0, y: 0 };

    this._bindEvents();
  }

  setDagModel(dagModel: DagModel): void {
    this.dagModel = dagModel;
  }

  _bindEvents(): void {
    const el = this.canvas;

    // Mouse wheel zoom
    el.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.camera.zoomAt(e.offsetX, e.offsetY, factor);
    }, { passive: false });

    // Double click to expand/collapse sub-pipelines
    el.addEventListener('dblclick', (e: MouseEvent) => {
      const node = this.renderer.hitTest(e.offsetX, e.offsetY);
      if (node) this._handleDblClick(node);
    });

    // Mouse down: record position, wait for movement to determine pan vs click
    el.addEventListener('mousedown', (e: MouseEvent) => {
      this._isMouseDown = true;
      this._isPanning = false;
      this._lastMouse = { x: e.clientX, y: e.clientY };
      this._mouseDownPos = { x: e.clientX, y: e.clientY };
    });

    // Mouse move: only start panning after exceeding click threshold (5px)
    el.addEventListener('mousemove', (e: MouseEvent) => {
      if (this._isMouseDown) {
        const dxFromDown = Math.abs(e.clientX - this._mouseDownPos.x);
        const dyFromDown = Math.abs(e.clientY - this._mouseDownPos.y);

        if (!this._isPanning && (dxFromDown >= 5 || dyFromDown >= 5)) {
          // Crossed the threshold — start panning from current position
          this._isPanning = true;
          this._lastMouse = { x: e.clientX, y: e.clientY };
        }

        if (this._isPanning) {
          const dx = e.clientX - this._lastMouse.x;
          const dy = e.clientY - this._lastMouse.y;
          this.camera.pan(dx, dy);
          this._lastMouse = { x: e.clientX, y: e.clientY };
          el.style.cursor = 'grabbing';
        }
      } else {
        // Hover detection (mouse not pressed)
        const node = this.renderer.hitTest(e.offsetX, e.offsetY);
        this.renderer.hoveredNodeId = node?.id || null;
        el.style.cursor = node ? 'pointer' : 'grab';
        this.onNodeHover?.(node);
      }
    });

    // Mouse up: if we never started panning, treat as click
    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (this._isMouseDown && !this._isPanning) {
        const rect = this.canvas.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        const node = this.renderer.hitTest(ox, oy);
        if (node) {
          this._handleClick(node);
        } else {
          this.renderer.selectedNodeId = null;
          this.onNodeClick?.(null);
        }
      }
      this._isMouseDown = false;
      this._isPanning = false;
    });

    // Touch events
    let lastTouchDist = 0;

    el.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length === 1) {
        this._isPanning = true;
        this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this._mouseDownPos = { ...this._lastMouse };
      } else if (e.touches.length === 2) {
        lastTouchDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
      }
    }, { passive: true });

    el.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length === 1 && this._isPanning) {
        const dx = e.touches[0].clientX - this._lastMouse.x;
        const dy = e.touches[0].clientY - this._lastMouse.y;
        this.camera.pan(dx, dy);
        this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const newDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        if (lastTouchDist > 0) {
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const rect = this.canvas.getBoundingClientRect();
          this.camera.zoomAt(cx - rect.left, cy - rect.top, newDist / lastTouchDist);
        }
        lastTouchDist = newDist;
      }
    }, { passive: true });

    el.addEventListener('touchend', (e: TouchEvent) => {
      if (e.touches.length === 0) {
        this._isPanning = false;
        lastTouchDist = 0;
      }
    }, { passive: true });
  }

  _handleClick(node: DagNode): void {
    this.renderer.selectedNodeId = node.id;
    this.onNodeClick?.(node);
  }

  _handleDblClick(node: DagNode): void {
    // Double click to toggle sub-pipeline expand/collapse
    if (node.isSubPipeline && node.children.length > 0) {
      this.onToggleSubPipeline?.(node.id);
    }
  }
}
