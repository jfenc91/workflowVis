// Smooth animated transitions when nodes reposition (expand/collapse, relayout)

import type { DagModel } from '../data/dag-builder.js';

interface NodeSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DURATION = 400; // ms

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export class LayoutAnimator {
  private _snapshots: Map<string, NodeSnapshot> = new Map();
  private _targets: Map<string, NodeSnapshot> = new Map();
  private _startTime: number = 0;
  private _animating: boolean = false;

  /** Call before relayout to capture current positions. */
  snapshot(dagModel: DagModel): void {
    this._snapshots.clear();
    for (const node of dagModel.allNodes()) {
      this._snapshots.set(node.id, {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      });
    }
  }

  /** Call after relayout to store target positions and start animation. */
  start(dagModel: DagModel, time: number): void {
    this._targets.clear();
    for (const node of dagModel.allNodes()) {
      this._targets.set(node.id, {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      });
    }
    this._startTime = time;
    this._animating = true;
  }

  /** Returns true while animating. Call each frame before render. */
  tick(dagModel: DagModel, time: number): boolean {
    if (!this._animating) return false;

    const elapsed = time - this._startTime;
    const t = Math.min(elapsed / DURATION, 1);
    const e = easeOutCubic(t);

    for (const node of dagModel.allNodes()) {
      const from = this._snapshots.get(node.id);
      const to = this._targets.get(node.id);

      if (from && to) {
        node.x = from.x + (to.x - from.x) * e;
        node.y = from.y + (to.y - from.y) * e;
        node.width = from.width + (to.width - from.width) * e;
        node.height = from.height + (to.height - from.height) * e;
      } else if (to) {
        // New node (no snapshot) — snap to target
        node.x = to.x;
        node.y = to.y;
        node.width = to.width;
        node.height = to.height;
      }
    }

    if (t >= 1) {
      // Snap to final positions
      for (const node of dagModel.allNodes()) {
        const to = this._targets.get(node.id);
        if (to) {
          node.x = to.x;
          node.y = to.y;
          node.width = to.width;
          node.height = to.height;
        }
      }
      this._animating = false;
      this._snapshots.clear();
      this._targets.clear();
    }

    return this._animating;
  }

  get animating(): boolean {
    return this._animating;
  }
}
