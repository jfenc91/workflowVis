// Minimap inset showing the full DAG with a viewport indicator

import type { DagModel, DagNode } from '../data/dag-builder.js';
import type { Camera } from '../render/camera.js';
import { getStatusColor, getGroupColors, getEdgeColor } from '../util/color.js';

const MINIMAP_W = 200;
const MINIMAP_H = 140;
const MINIMAP_PAD = 12;

export class Minimap {
  private _wrap: HTMLElement;
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _toggle: HTMLButtonElement;
  private _camera: Camera;
  private _dagModel: DagModel | null = null;
  private _collapsed: boolean = false;

  // World-to-minimap transform (recomputed each render)
  private _scale: number = 1;
  private _offsetX: number = 0;
  private _offsetY: number = 0;

  private _dragging: boolean = false;

  constructor(container: HTMLElement, camera: Camera) {
    this._camera = camera;

    // Wrapper div holds canvas + toggle button
    this._wrap = document.createElement('div');
    this._wrap.className = 'minimap-wrap';
    container.appendChild(this._wrap);

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'minimap-canvas';
    this._canvas.width = MINIMAP_W * (window.devicePixelRatio || 1);
    this._canvas.height = MINIMAP_H * (window.devicePixelRatio || 1);
    this._canvas.style.width = `${MINIMAP_W}px`;
    this._canvas.style.height = `${MINIMAP_H}px`;
    this._wrap.appendChild(this._canvas);

    this._toggle = document.createElement('button');
    this._toggle.className = 'minimap-toggle';
    this._toggle.title = 'Toggle minimap';
    this._toggle.textContent = '\u25BF'; // ▿ down-pointing triangle (collapse)
    this._toggle.addEventListener('click', () => this._setCollapsed(!this._collapsed));
    this._wrap.appendChild(this._toggle);

    this._ctx = this._canvas.getContext('2d')!;

    // Restore saved state
    try {
      if (localStorage.getItem('pv-minimap') === 'collapsed') {
        this._setCollapsed(true);
      }
    } catch (_) {}

    // Interaction
    this._canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this._canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this._canvas.addEventListener('pointerup', () => this._onPointerUp());
    this._canvas.addEventListener('pointerleave', () => this._onPointerUp());
  }

  private _setCollapsed(collapsed: boolean): void {
    this._collapsed = collapsed;
    this._canvas.style.display = collapsed ? 'none' : '';
    this._toggle.textContent = collapsed ? '\u25B5' : '\u25BF'; // ▵ up / ▿ down
    this._wrap.classList.toggle('minimap-collapsed', collapsed);
    try { localStorage.setItem('pv-minimap', collapsed ? 'collapsed' : 'expanded'); } catch (_) {}
  }

  setDagModel(dagModel: DagModel | null): void {
    this._dagModel = dagModel;
  }

  render(): void {
    if (this._collapsed) return;

    const ctx = this._ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = MINIMAP_W;
    const h = MINIMAP_H;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!this._dagModel) return;

    const nodes = this._dagModel.allNodes();
    if (nodes.length === 0) return;

    // Compute world bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;

    // Fit world into minimap with padding
    const drawW = w - MINIMAP_PAD * 2;
    const drawH = h - MINIMAP_PAD * 2;
    this._scale = Math.min(drawW / worldW, drawH / worldH);
    this._offsetX = MINIMAP_PAD + (drawW - worldW * this._scale) / 2 - minX * this._scale;
    this._offsetY = MINIMAP_PAD + (drawH - worldH * this._scale) / 2 - minY * this._scale;

    // Draw background
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.fillStyle = isDark ? 'rgba(15, 15, 26, 0.85)' : 'rgba(240, 242, 245, 0.85)';
    this._roundRect(ctx, 0, 0, w, h, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 8);
    ctx.stroke();

    // Draw edges (straight lines)
    this._drawEdges(ctx, isDark);

    // Draw nodes
    this._drawNodes(ctx, nodes);

    // Draw viewport indicator
    this._drawViewport(ctx, isDark);
  }

  private _drawEdges(ctx: CanvasRenderingContext2D, _isDark: boolean): void {
    if (!this._dagModel) return;

    ctx.lineWidth = 1;
    for (const edge of this._dagModel.allEdges()) {
      const src = this._dagModel.getNode(edge.sourceId);
      const tgt = this._dagModel.getNode(edge.targetId);
      if (!src || !tgt) continue;

      const x1 = this._worldToMinimapX(src.x + src.width / 2);
      const y1 = this._worldToMinimapY(src.y + src.height / 2);
      const x2 = this._worldToMinimapX(tgt.x + tgt.width / 2);
      const y2 = this._worldToMinimapY(tgt.y + tgt.height / 2);

      ctx.strokeStyle = getEdgeColor(edge.status);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private _drawNodes(ctx: CanvasRenderingContext2D, nodes: DagNode[]): void {
    const groupColors = getGroupColors();

    for (const node of nodes) {
      const mx = this._worldToMinimapX(node.x);
      const my = this._worldToMinimapY(node.y);
      const mw = node.width * this._scale;
      const mh = node.height * this._scale;

      if (node.isSubPipeline && node.expanded) {
        // Draw group container outline
        ctx.strokeStyle = groupColors.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(mx, my, mw, mh);
      } else {
        // Draw filled node rectangle
        const statusColor = getStatusColor(node.status);
        ctx.fillStyle = statusColor.stroke;
        const r = Math.min(3, mw / 4, mh / 4);
        this._roundRect(ctx, mx, my, Math.max(mw, 2), Math.max(mh, 2), r);
        ctx.fill();
      }
    }
  }

  private _drawViewport(ctx: CanvasRenderingContext2D, isDark: boolean): void {
    const cam = this._camera;
    // Camera visible area in world coords
    const topLeft = cam.screenToWorld(0, 0);
    const bottomRight = cam.screenToWorld(cam.width, cam.height);

    const vx = this._worldToMinimapX(topLeft.x);
    const vy = this._worldToMinimapY(topLeft.y);
    const vw = (bottomRight.x - topLeft.x) * this._scale;
    const vh = (bottomRight.y - topLeft.y) * this._scale;

    // Semi-transparent fill
    ctx.fillStyle = isDark ? 'rgba(129, 140, 248, 0.08)' : 'rgba(99, 102, 241, 0.06)';
    ctx.fillRect(vx, vy, vw, vh);

    // Bright border
    ctx.strokeStyle = isDark ? 'rgba(129, 140, 248, 0.6)' : 'rgba(99, 102, 241, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);
  }

  private _worldToMinimapX(wx: number): number {
    return wx * this._scale + this._offsetX;
  }

  private _worldToMinimapY(wy: number): number {
    return wy * this._scale + this._offsetY;
  }

  private _minimapToWorldX(mx: number): number {
    return (mx - this._offsetX) / this._scale;
  }

  private _minimapToWorldY(my: number): number {
    return (my - this._offsetY) / this._scale;
  }

  private _onPointerDown(e: PointerEvent): void {
    this._dragging = true;
    this._canvas.setPointerCapture(e.pointerId);
    this._panToEvent(e);
  }

  private _onPointerMove(e: PointerEvent): void {
    if (!this._dragging) return;
    this._panToEvent(e);
  }

  private _onPointerUp(): void {
    this._dragging = false;
  }

  private _panToEvent(e: PointerEvent): void {
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const worldX = this._minimapToWorldX(mx);
    const worldY = this._minimapToWorldY(my);

    // Center camera on this world point
    this._camera.x = -worldX;
    this._camera.y = -worldY;
  }

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
