// Pan/zoom camera shared by both Canvas 2D and WebGL layers

import type { DagNode } from '../data/dag-builder.js';
import type { Point } from '../types.js';

export class Camera {
  x: number;
  y: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  width: number;
  height: number;

  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.minZoom = 0.1;
    this.maxZoom = 3;
    this.width = 0;
    this.height = 0;
  }

  setViewport(width: number, height: number): void {
    // Compensate camera offset so content stays visually stable
    // when viewport size changes (e.g., detail panel open/close).
    // Without this, the transform's width/2 center shift causes a jump.
    if (this.width > 0 && this.height > 0 && this.zoom > 0) {
      this.x += (this.width - width) / (2 * this.zoom);
      this.y += (this.height - height) / (2 * this.zoom);
    }
    this.width = width;
    this.height = height;
  }

  // Convert screen coords to world coords
  screenToWorld(sx: number, sy: number): Point {
    return {
      x: (sx - this.width / 2) / this.zoom - this.x,
      y: (sy - this.height / 2) / this.zoom - this.y,
    };
  }

  // Convert world coords to screen coords
  worldToScreen(wx: number, wy: number): Point {
    return {
      x: (wx + this.x) * this.zoom + this.width / 2,
      y: (wy + this.y) * this.zoom + this.height / 2,
    };
  }

  // Apply camera transform to a Canvas 2D context
  applyTransform(ctx: CanvasRenderingContext2D): void {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(this.x, this.y);
  }

  // Zoom toward a screen point
  zoomAt(sx: number, sy: number, factor: number): void {
    const worldBefore = this.screenToWorld(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const worldAfter = this.screenToWorld(sx, sy);
    this.x += worldAfter.x - worldBefore.x;
    this.y += worldAfter.y - worldBefore.y;
  }

  pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
  }

  // Fit all nodes in view with padding
  fitToContent(nodes: DagNode[], padding: number = 80): void {
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.zoom = Math.min(
      this.width / contentWidth,
      this.height / contentHeight,
      1.5
    );
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));

    this.x = -centerX;
    this.y = -centerY;
  }
}
