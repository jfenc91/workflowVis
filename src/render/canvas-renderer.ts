// Canvas 2D renderer: nodes, edges, groups, labels
// Enhanced with gradients, glow effects, and theme-aware visuals

import type { DagModel, DagNode, DagEdge } from '../data/dag-builder.js';
import type { Camera } from './camera.js';
import { roundRect, drawBezierEdge } from '../util/geometry.js';
import { getTaskTypeColor, getStatusColor, getEdgeColor, getGroupColors, getCanvasBg, getNodeColors } from '../util/color.js';
import { formatDuration, formatElapsed } from '../util/format.js';
import { GROUP_HEADER, GROUP_PADDING } from '../layout/dagre-layout.js';

// Task type icons (Unicode symbols)
const TASK_ICONS: Record<string, string> = {
  Extract: '\u2B07',      // ⬇
  Transform: '\u2699',    // ⚙
  Load: '\u2B06',         // ⬆
  Test: '\u2714',         // ✔
  Publish: '\uD83D\uDCE4', // 📤
  SubPipeline: '\uD83D\uDD17', // 🔗
  Notification: '\uD83D\uDD14', // 🔔
};

// Status badge symbols
const STATUS_BADGES: Record<string, string> = {
  pending: '',
  running: '\u25B6',  // ▶
  complete: '\u2714', // ✔
  failed: '\u2718',   // ✘
};

export class CanvasRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  animTime: number;
  _completionFlashes: Map<string, number>;
  _dagModel: DagModel | null;
  _currentTime: number;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = camera;
    this.selectedNodeId = null;
    this.hoveredNodeId = null;
    this.animTime = 0;
    this._completionFlashes = new Map();
    this._dagModel = null;
    this._currentTime = 0;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.camera.setViewport(rect.width, rect.height);
  }

  // Trigger a completion flash for a node
  flashCompletion(nodeId: string): void {
    this._completionFlashes.set(nodeId, performance.now());
  }

  render(dagModel: DagModel, time: number, currentTime: number): void {
    this.animTime = time;
    this._currentTime = currentTime || 0;
    const ctx = this.ctx;
    const canvasBg = getCanvasBg();

    // Clear with theme background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw subtle grid in dark mode
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      this._drawGrid(ctx);
    }

    // Apply camera
    this.camera.applyTransform(ctx);

    // Draw edges first (behind nodes)
    this._drawEdges(dagModel, ctx);

    // Draw group containers for expanded sub-pipelines
    for (const node of dagModel.nodes.values()) {
      if (node.isSubPipeline && node.expanded && node.children.length > 0 && !node.parent) {
        this._drawGroup(node, ctx);
      }
    }

    // Draw nodes
    for (const node of dagModel.nodes.values()) {
      if (node.parent && node.parent.isSubPipeline && !node.parent.expanded) {
        continue;
      }
      if (node.isSubPipeline && node.expanded && node.children.length > 0) {
        continue;
      }
      this._drawNode(node, ctx);
    }

    // Cleanup old flashes
    const now = performance.now();
    for (const [id, t] of this._completionFlashes) {
      if (now - t > 1000) this._completionFlashes.delete(id);
    }
  }

  _drawGrid(ctx: CanvasRenderingContext2D): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 0.5;
    const gridSize = 40;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Re-apply camera transform after grid
    this.camera.applyTransform(ctx);
  }

  _drawEdges(dagModel: DagModel, ctx: CanvasRenderingContext2D): void {
    for (const edge of dagModel.edges.values()) {
      const source = dagModel.getNode(edge.sourceId);
      const target = dagModel.getNode(edge.targetId);
      if (!source || !target) continue;

      if (source.parent?.isSubPipeline && !source.parent.expanded) continue;
      if (target.parent?.isSubPipeline && !target.parent.expanded) continue;

      const color = getEdgeColor(edge.status);
      ctx.lineWidth = edge.status === 'running' ? 2.5 : 2;

      // Running edges: animated dash with glow
      if (edge.status === 'running') {
        // Outer glow
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 6;
        ctx.setLineDash([]);
        const x1g = source.x + source.width;
        const y1g = source.y + source.height / 2;
        const x2g = target.x;
        const y2g = target.y + target.height / 2;
        drawBezierEdge(ctx, x1g, y1g, x2g, y2g);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([10, 5]);
        ctx.lineDashOffset = -this.animTime * 0.06;
      } else {
        ctx.strokeStyle = color;
        ctx.setLineDash([]);
      }

      const x1 = source.x + source.width;
      const y1 = source.y + source.height / 2;
      const x2 = target.x;
      const y2 = target.y + target.height / 2;

      drawBezierEdge(ctx, x1, y1, x2, y2);

      // Arrow head
      ctx.setLineDash([]);
      this._drawArrow(ctx, x2, y2, color);
    }
    ctx.setLineDash([]);
  }

  _drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    const size = 9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size, y - size / 2);
    ctx.lineTo(x - size, y + size / 2);
    ctx.closePath();
    ctx.fill();
  }

  _drawGroup(node: DagNode, ctx: CanvasRenderingContext2D): void {
    const typeColor = getTaskTypeColor(node.taskType);
    const statusColor = getStatusColor(node.status);
    const groupColors = getGroupColors();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Group shadow/glow
    if (isDark) {
      ctx.shadowColor = statusColor.glow;
      ctx.shadowBlur = 15;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = 8;
    }
    ctx.shadowOffsetY = 2;

    // Group background
    ctx.fillStyle = groupColors.bg;
    ctx.strokeStyle = isDark ? statusColor.stroke : groupColors.border;
    ctx.lineWidth = isDark ? 1.5 : 2;
    roundRect(ctx, node.x, node.y, node.width, node.height, 12);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Header bar with gradient
    const headerGrad = ctx.createLinearGradient(node.x, node.y, node.x + node.width, node.y);
    if (isDark) {
      headerGrad.addColorStop(0, `${typeColor.accent}18`);
      headerGrad.addColorStop(1, 'transparent');
    } else {
      headerGrad.addColorStop(0, groupColors.headerBg);
      headerGrad.addColorStop(1, 'rgba(241,245,249,0.3)');
    }
    ctx.fillStyle = headerGrad;
    ctx.save();
    ctx.beginPath();
    ctx.rect(node.x, node.y, node.width, GROUP_HEADER);
    ctx.clip();
    roundRect(ctx, node.x, node.y, node.width, GROUP_HEADER + 12, 12);
    ctx.fill();
    ctx.restore();

    // Accent line under header
    ctx.strokeStyle = typeColor.accent;
    ctx.globalAlpha = isDark ? 0.4 : 0.25;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(node.x, node.y + GROUP_HEADER);
    ctx.lineTo(node.x + node.width, node.y + GROUP_HEADER);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Group label
    ctx.fillStyle = isDark ? typeColor.text : typeColor.text;
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.displayName, node.x + 12, node.y + GROUP_HEADER / 2);

    // Status badge on group header
    if (node.status !== 'pending') {
      const badge = STATUS_BADGES[node.status];
      if (badge) {
        ctx.fillStyle = statusColor.badge;
        ctx.font = 'bold 14px system-ui';
        ctx.textAlign = 'right';
        ctx.fillText(badge, node.x + node.width - 12, node.y + GROUP_HEADER / 2);
      }
    }

    // Selection highlight
    if (this.selectedNodeId === node.id) {
      const nodeColors = getNodeColors();
      ctx.strokeStyle = nodeColors.selectedStroke;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      roundRect(ctx, node.x - 3, node.y - 3, node.width + 6, node.height + 6, 14);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _drawNode(node: DagNode, ctx: CanvasRenderingContext2D): void {
    const typeColor = getTaskTypeColor(node.taskType);
    const statusColor = getStatusColor(node.status);
    const nodeColors = getNodeColors();
    const isHovered = this.hoveredNodeId === node.id;
    const isSelected = this.selectedNodeId === node.id;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Completion flash effect
    const flashT = this._completionFlashes.has(node.id)
      ? (performance.now() - this._completionFlashes.get(node.id)!) / 1000
      : -1;

    // Node outer glow for running/failed/selected
    if (node.status === 'running' || node.status === 'failed' || isSelected) {
      ctx.shadowColor = node.status === 'running'
        ? statusColor.glow
        : (node.status === 'failed' ? statusColor.glow : nodeColors.selectedStroke);
      ctx.shadowBlur = isHovered ? 20 : 14;
      ctx.shadowOffsetY = 0;
    } else if (isHovered) {
      ctx.shadowColor = isDark ? 'rgba(129,140,248,0.2)' : 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
    } else {
      ctx.shadowColor = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = isDark ? 8 : 6;
      ctx.shadowOffsetY = 2;
    }

    // Node background — gradient fill
    if (node.status === 'pending') {
      ctx.fillStyle = nodeColors.bg;
    } else {
      const grad = ctx.createLinearGradient(node.x, node.y, node.x + node.width, node.y + node.height);
      grad.addColorStop(0, statusColor.fill);
      if (isDark) {
        grad.addColorStop(1, nodeColors.bg);
      } else {
        grad.addColorStop(1, '#ffffff');
      }
      ctx.fillStyle = grad;
    }

    ctx.strokeStyle = isSelected ? nodeColors.selectedStroke : statusColor.stroke;
    ctx.lineWidth = isSelected ? 2.5 : (isHovered ? 2 : 1.5);
    roundRect(ctx, node.x, node.y, node.width, node.height, 10);
    ctx.fill();
    ctx.stroke();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Left accent bar — gradient
    if (typeColor.gradient) {
      const barGrad = ctx.createLinearGradient(node.x + 4, node.y + 4, node.x + 4, node.y + node.height - 4);
      barGrad.addColorStop(0, typeColor.gradient[0]);
      barGrad.addColorStop(1, typeColor.gradient[1]);
      ctx.fillStyle = barGrad;
    } else {
      ctx.fillStyle = typeColor.accent;
    }
    roundRect(ctx, node.x + 4, node.y + 4, 4, node.height - 8, 2);
    ctx.fill();

    // Icon
    ctx.font = '16px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = typeColor.accent;
    const icon = TASK_ICONS[node.taskType] || '\u2B24';
    ctx.fillText(icon, node.x + 14, node.y + node.height / 2 - 6);

    // Label
    ctx.fillStyle = nodeColors.text;
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    let label = node.displayName;
    const maxLabelWidth = node.width - 60;
    while (ctx.measureText(label).width > maxLabelWidth && label.length > 3) {
      label = label.slice(0, -1);
    }
    if (label !== node.displayName) label += '\u2026';
    ctx.fillText(label, node.x + 34, node.y + node.height / 2 - 6);

    // Task type subtitle
    ctx.fillStyle = nodeColors.subtext;
    ctx.font = '10px system-ui';
    ctx.fillText(node.taskType, node.x + 34, node.y + node.height / 2 + 10);

    // Duration or live running timer
    if (node.status === 'running' && node.startTime != null && this._currentTime > 0) {
      const elapsed = this._currentTime - node.startTime;
      ctx.fillStyle = statusColor.badge;
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(formatElapsed(elapsed), node.x + node.width - 10, node.y + node.height / 2 + 10);
    } else if (node.duration) {
      ctx.fillStyle = nodeColors.duration;
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(formatDuration(node.duration), node.x + node.width - 10, node.y + node.height / 2 + 10);
    }

    // Status badge
    const badge = STATUS_BADGES[node.status];
    if (badge) {
      ctx.fillStyle = statusColor.badge;
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, node.x + node.width - 10, node.y + node.height / 2 - 6);
    }

    // Running animation: neon pulsing border
    if (node.status === 'running') {
      const alpha = 0.2 + 0.3 * Math.sin(this.animTime * 0.005);
      ctx.strokeStyle = statusColor.stroke;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      roundRect(ctx, node.x - 3, node.y - 3, node.width + 6, node.height + 6, 12);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Completion flash: bright expanding ring
    if (flashT >= 0 && flashT < 1) {
      const expand = flashT * 12;
      const alpha = (1 - flashT) * 0.6;
      ctx.strokeStyle = statusColor.stroke;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      roundRect(ctx, node.x - expand, node.y - expand,
        node.width + expand * 2, node.height + expand * 2, 10 + expand);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Selection ring
    if (isSelected && node.status !== 'running') {
      ctx.strokeStyle = nodeColors.selectedStroke;
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.animTime * 0.003);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -this.animTime * 0.02;
      roundRect(ctx, node.x - 4, node.y - 4, node.width + 8, node.height + 8, 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Collapse/expand indicator for sub-pipelines
    if (node.isSubPipeline && node.children.length > 0 && !node.expanded) {
      ctx.fillStyle = nodeColors.subtext;
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('\u25B6 expand', node.x + node.width - 10, node.y + node.height - 8);
    }
  }

  // Hit test: find node at screen coordinates
  hitTest(sx: number, sy: number): DagNode | null {
    const world = this.camera.screenToWorld(sx, sy);

    // First pass: check non-group leaf nodes and children inside expanded groups
    for (const node of this._dagModel?.nodes?.values() || []) {
      if (node.parent?.isSubPipeline && !node.parent.expanded) continue;
      if (node.isSubPipeline && node.expanded && node.children.length > 0) continue;
      if (world.x >= node.x && world.x <= node.x + node.width &&
          world.y >= node.y && world.y <= node.y + node.height) {
        return node;
      }
    }

    // Second pass: check group containers (expanded sub-pipelines)
    for (const node of this._dagModel?.nodes?.values() || []) {
      if (!node.isSubPipeline || !node.expanded || node.children.length === 0) continue;
      if (node.parent?.isSubPipeline && !node.parent.expanded) continue;
      if (world.x >= node.x && world.x <= node.x + node.width &&
          world.y >= node.y && world.y <= node.y + node.height) {
        return node;
      }
    }

    return null;
  }

  _getVisibleNodes(): DagNode[] {
    const visible: DagNode[] = [];
    for (const node of this._dagModel?.nodes?.values() || []) {
      if (node.parent?.isSubPipeline && !node.parent.expanded) continue;
      visible.push(node);
    }
    return visible;
  }

  setDagModel(dagModel: DagModel): void {
    this._dagModel = dagModel;
  }
}
