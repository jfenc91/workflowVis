// Geometry helpers for rendering

import type { Point, BezierPoints } from '../types.js';

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Cubic bezier for left-to-right edges
export function drawBezierEdge(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const cpOffset = Math.min(Math.abs(x2 - x1) * 0.5, 120);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1 + cpOffset, y1, x2 - cpOffset, y2, x2, y2);
  ctx.stroke();
}

// Get bezier control points for particle animation
export function getBezierPoints(x1: number, y1: number, x2: number, y2: number): BezierPoints {
  const cpOffset = Math.min(Math.abs(x2 - x1) * 0.5, 120);
  return {
    p0: { x: x1, y: y1 },
    p1: { x: x1 + cpOffset, y: y1 },
    p2: { x: x2 - cpOffset, y: y2 },
    p3: { x: x2, y: y2 },
  };
}

// Evaluate cubic bezier at t
export function bezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
    y: mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
  };
}

// Hit test: point inside rectangle
export function pointInRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

// Distance between two points
export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
