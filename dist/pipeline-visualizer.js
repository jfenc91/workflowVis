// src/layout/dagre-layout.ts
var NODE_WIDTH = 200;
var NODE_HEIGHT = 60;
var LAYER_SPACING = 280;
var NODE_SPACING = 90;
var GROUP_PADDING = 40;
var GROUP_HEADER = 30;
function layoutDag(dagModel) {
  const rootTaskIds = [];
  for (const node of dagModel.nodes.values()) {
    if (!node.parent) {
      rootTaskIds.push(node.id);
    }
  }
  const layers = assignLayers(dagModel, rootTaskIds);
  barycenterOrdering(dagModel, layers);
  assignPositions(dagModel, layers);
  for (const node of dagModel.nodes.values()) {
    if (node.isSubPipeline && node.expanded && node.children.length > 0) {
      layoutSubPipeline(dagModel, node);
    }
  }
}
function assignLayers(dagModel, nodeIds) {
  const inDegree = /* @__PURE__ */ new Map();
  const adj = /* @__PURE__ */ new Map();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const id of nodeIds) {
    const node = dagModel.getNode(id);
    for (const edgeId of node.edges) {
      const edge = dagModel.getEdge(edgeId);
      if (nodeIds.includes(edge.targetId)) {
        adj.get(id).push(edge.targetId);
        inDegree.set(edge.targetId, (inDegree.get(edge.targetId) || 0) + 1);
      }
    }
  }
  const layerOf = /* @__PURE__ */ new Map();
  const queue = [];
  for (const id of nodeIds) {
    if (inDegree.get(id) === 0) {
      queue.push(id);
      layerOf.set(id, 0);
    }
  }
  while (queue.length > 0) {
    const id = queue.shift();
    const currentLayer = layerOf.get(id);
    for (const targetId of adj.get(id)) {
      const newLayer = currentLayer + 1;
      if (!layerOf.has(targetId) || layerOf.get(targetId) < newLayer) {
        layerOf.set(targetId, newLayer);
      }
      inDegree.set(targetId, inDegree.get(targetId) - 1);
      if (inDegree.get(targetId) === 0) {
        queue.push(targetId);
      }
    }
  }
  const maxLayer = Math.max(...layerOf.values(), 0);
  const layers = [];
  for (let i = 0; i <= maxLayer; i++) layers.push([]);
  for (const [id, layer] of layerOf) {
    layers[layer].push(id);
    dagModel.getNode(id).layer = layer;
  }
  return layers;
}
function barycenterOrdering(dagModel, layers) {
  for (let i = 1; i < layers.length; i++) {
    const prevPositions = /* @__PURE__ */ new Map();
    layers[i - 1].forEach((id, idx) => prevPositions.set(id, idx));
    const barycenters = layers[i].map((id) => {
      const node = dagModel.getNode(id);
      let sum = 0, count = 0;
      for (const edgeId of node.inEdges) {
        const edge = dagModel.getEdge(edgeId);
        if (prevPositions.has(edge.sourceId)) {
          sum += prevPositions.get(edge.sourceId);
          count++;
        }
      }
      return { id, bc: count > 0 ? sum / count : 0 };
    });
    barycenters.sort((a, b) => a.bc - b.bc);
    layers[i] = barycenters.map((b) => b.id);
  }
}
function assignPositions(dagModel, layers) {
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    const totalHeight = layer.length * NODE_HEIGHT + (layer.length - 1) * NODE_SPACING;
    const startY = -totalHeight / 2;
    for (let i = 0; i < layer.length; i++) {
      const node = dagModel.getNode(layer[i]);
      node.x = layerIdx * LAYER_SPACING;
      node.y = startY + i * (NODE_HEIGHT + NODE_SPACING);
      node.width = NODE_WIDTH;
      node.height = NODE_HEIGHT;
    }
  }
}
function layoutSubPipeline(dagModel, parentNode) {
  const children = parentNode.children;
  if (children.length === 0) return;
  const childIds = children.map((c) => c.id);
  const layers = assignLayers(dagModel, childIds);
  barycenterOrdering(dagModel, layers);
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    const totalHeight = layer.length * NODE_HEIGHT + (layer.length - 1) * NODE_SPACING;
    const startY = -totalHeight / 2;
    for (let i = 0; i < layer.length; i++) {
      const node = dagModel.getNode(layer[i]);
      node.x = layerIdx * LAYER_SPACING;
      node.y = startY + i * (NODE_HEIGHT + NODE_SPACING);
      node.width = NODE_WIDTH;
      node.height = NODE_HEIGHT;
    }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const child of children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + child.width);
    maxY = Math.max(maxY, child.y + child.height);
  }
  const groupWidth = maxX - minX + GROUP_PADDING * 2;
  const groupHeight = maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER;
  const offsetX = parentNode.x + GROUP_PADDING - minX;
  const offsetY = parentNode.y + GROUP_PADDING + GROUP_HEADER - minY;
  for (const child of children) {
    child.x += offsetX;
    child.y += offsetY;
  }
  parentNode.width = groupWidth;
  parentNode.height = groupHeight;
}

// src/layout/group-layout.ts
function relayout(dagModel) {
  layoutDag(dagModel);
  adjustForGroups(dagModel);
}
function adjustForGroups(dagModel) {
  const topLevel = [];
  for (const node of dagModel.nodes.values()) {
    if (!node.parent) {
      topLevel.push(node);
    }
  }
  const layerMap = /* @__PURE__ */ new Map();
  for (const node of topLevel) {
    if (!layerMap.has(node.layer)) layerMap.set(node.layer, []);
    layerMap.get(node.layer).push(node);
  }
  for (const [_layer, nodes] of layerMap) {
    nodes.sort((a, b) => a.y - b.y);
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const prevBottom = prev.y + prev.height;
      const minY = prevBottom + NODE_SPACING;
      if (curr.y < minY) {
        const shift = minY - curr.y;
        curr.y = minY;
        if (curr.isSubPipeline && curr.expanded) {
          for (const child of curr.children) {
            child.y += shift;
          }
        }
      }
    }
  }
  for (const [_layer, nodes] of layerMap) {
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y + n.height));
    const center = (minY + maxY) / 2;
    const offset = -center;
    for (const node of nodes) {
      node.y += offset;
      if (node.isSubPipeline && node.expanded) {
        for (const child of node.children) {
          child.y += offset;
        }
      }
    }
  }
  adjustLayerXPositions(dagModel, layerMap);
}
function adjustLayerXPositions(_dagModel, layerMap) {
  const sortedLayers = [...layerMap.keys()].sort((a, b) => a - b);
  let currentX = 0;
  for (const layerIdx of sortedLayers) {
    const nodes = layerMap.get(layerIdx);
    const maxWidth = Math.max(...nodes.map((n) => n.width));
    for (const node of nodes) {
      const oldX = node.x;
      node.x = currentX;
      if (node.isSubPipeline && node.expanded) {
        const dx = node.x - oldX;
        for (const child of node.children) {
          child.x += dx;
        }
      }
    }
    currentX += maxWidth + (LAYER_SPACING - NODE_WIDTH);
  }
}
function toggleSubPipeline(dagModel, nodeId) {
  const node = dagModel.getNode(nodeId);
  if (!node || !node.isSubPipeline) return;
  node.expanded = !node.expanded;
  if (!node.expanded) {
    node.width = NODE_WIDTH;
    node.height = NODE_HEIGHT;
  }
  relayout(dagModel);
}

// src/render/camera.ts
var Camera = class {
  x;
  y;
  zoom;
  minZoom;
  maxZoom;
  width;
  height;
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.minZoom = 0.1;
    this.maxZoom = 3;
    this.width = 0;
    this.height = 0;
  }
  setViewport(width, height) {
    if (this.width > 0 && this.height > 0 && this.zoom > 0) {
      this.x += (this.width - width) / (2 * this.zoom);
      this.y += (this.height - height) / (2 * this.zoom);
    }
    this.width = width;
    this.height = height;
  }
  // Convert screen coords to world coords
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.width / 2) / this.zoom - this.x,
      y: (sy - this.height / 2) / this.zoom - this.y
    };
  }
  // Convert world coords to screen coords
  worldToScreen(wx, wy) {
    return {
      x: (wx + this.x) * this.zoom + this.width / 2,
      y: (wy + this.y) * this.zoom + this.height / 2
    };
  }
  // Apply camera transform to a Canvas 2D context
  applyTransform(ctx) {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(this.x, this.y);
  }
  // Zoom toward a screen point
  zoomAt(sx, sy, factor) {
    const worldBefore = this.screenToWorld(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const worldAfter = this.screenToWorld(sx, sy);
    this.x += worldAfter.x - worldBefore.x;
    this.y += worldAfter.y - worldBefore.y;
  }
  pan(dx, dy) {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
  }
  // Fit all nodes in view with padding
  fitToContent(nodes, padding = 80) {
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
};

// src/util/geometry.ts
function roundRect(ctx, x, y, w, h, r) {
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
function drawBezierEdge(ctx, x1, y1, x2, y2) {
  const cpOffset = Math.min(Math.abs(x2 - x1) * 0.5, 120);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1 + cpOffset, y1, x2 - cpOffset, y2, x2, y2);
  ctx.stroke();
}
function getBezierPoints(x1, y1, x2, y2) {
  const cpOffset = Math.min(Math.abs(x2 - x1) * 0.5, 120);
  return {
    p0: { x: x1, y: y1 },
    p1: { x: x1 + cpOffset, y: y1 },
    p2: { x: x2 - cpOffset, y: y2 },
    p3: { x: x2, y: y2 }
  };
}
function bezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
  };
}

// src/util/color.ts
function isDark() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}
var TASK_TYPE_COLORS_LIGHT = {
  Extract: { bg: "#eef2ff", accent: "#6366f1", text: "#4338ca", gradient: ["#818cf8", "#6366f1"] },
  Transform: { bg: "#f5f3ff", accent: "#8b5cf6", text: "#6d28d9", gradient: ["#a78bfa", "#8b5cf6"] },
  Load: { bg: "#ecfdf5", accent: "#10b981", text: "#047857", gradient: ["#34d399", "#10b981"] },
  Test: { bg: "#fff7ed", accent: "#f59e0b", text: "#b45309", gradient: ["#fbbf24", "#f59e0b"] },
  Publish: { bg: "#ecfeff", accent: "#06b6d4", text: "#0e7490", gradient: ["#22d3ee", "#06b6d4"] },
  SubPipeline: { bg: "#f8fafc", accent: "#64748b", text: "#334155", gradient: ["#94a3b8", "#64748b"] },
  Notification: { bg: "#fff1f2", accent: "#f43f5e", text: "#be123c", gradient: ["#fb7185", "#f43f5e"] }
};
var TASK_TYPE_COLORS_DARK = {
  Extract: { bg: "rgba(99,102,241,0.12)", accent: "#818cf8", text: "#a5b4fc", gradient: ["#818cf8", "#6366f1"] },
  Transform: { bg: "rgba(139,92,246,0.12)", accent: "#a78bfa", text: "#c4b5fd", gradient: ["#a78bfa", "#8b5cf6"] },
  Load: { bg: "rgba(16,185,129,0.12)", accent: "#34d399", text: "#6ee7b7", gradient: ["#34d399", "#10b981"] },
  Test: { bg: "rgba(245,158,11,0.12)", accent: "#fbbf24", text: "#fcd34d", gradient: ["#fbbf24", "#f59e0b"] },
  Publish: { bg: "rgba(6,182,212,0.12)", accent: "#22d3ee", text: "#67e8f9", gradient: ["#22d3ee", "#06b6d4"] },
  SubPipeline: { bg: "rgba(100,116,139,0.12)", accent: "#94a3b8", text: "#cbd5e1", gradient: ["#94a3b8", "#64748b"] },
  Notification: { bg: "rgba(244,63,94,0.12)", accent: "#fb7185", text: "#fda4af", gradient: ["#fb7185", "#f43f5e"] }
};
var STATUS_COLORS_LIGHT = {
  pending: { fill: "#f1f5f9", stroke: "#94a3b8", badge: "#64748b", glow: "transparent" },
  running: { fill: "#eef2ff", stroke: "#6366f1", badge: "#4f46e5", glow: "rgba(99,102,241,0.3)" },
  complete: { fill: "#ecfdf5", stroke: "#10b981", badge: "#059669", glow: "rgba(16,185,129,0.2)" },
  failed: { fill: "#fff1f2", stroke: "#f43f5e", badge: "#e11d48", glow: "rgba(244,63,94,0.3)" }
};
var STATUS_COLORS_DARK = {
  pending: { fill: "rgba(100,116,139,0.08)", stroke: "#475569", badge: "#64748b", glow: "transparent" },
  running: { fill: "rgba(99,102,241,0.15)", stroke: "#818cf8", badge: "#818cf8", glow: "rgba(129,140,248,0.4)" },
  complete: { fill: "rgba(16,185,129,0.12)", stroke: "#34d399", badge: "#34d399", glow: "rgba(52,211,153,0.25)" },
  failed: { fill: "rgba(244,63,94,0.15)", stroke: "#fb7185", badge: "#fb7185", glow: "rgba(251,113,133,0.35)" }
};
var GROUP_COLORS_LIGHT = {
  bg: "rgba(241, 245, 249, 0.6)",
  border: "#cbd5e1",
  headerBg: "rgba(226, 232, 240, 0.7)"
};
var GROUP_COLORS_DARK = {
  bg: "rgba(30, 30, 60, 0.4)",
  border: "rgba(148, 163, 184, 0.2)",
  headerBg: "rgba(40, 40, 70, 0.6)"
};
var EDGE_COLORS_LIGHT = {
  pending: "#cbd5e1",
  running: "#818cf8",
  complete: "#34d399",
  failed: "#fb7185"
};
var EDGE_COLORS_DARK = {
  pending: "#334155",
  running: "#818cf8",
  complete: "#34d399",
  failed: "#fb7185"
};
var CANVAS_BG_LIGHT = "#f0f2f5";
var CANVAS_BG_DARK = "#0f0f1a";
var NODE_COLORS_LIGHT = {
  bg: "#ffffff",
  text: "#1e293b",
  subtext: "#64748b",
  duration: "#94a3b8",
  selectedStroke: "#6366f1"
};
var NODE_COLORS_DARK = {
  bg: "#1e1e36",
  text: "#e2e8f0",
  subtext: "#94a3b8",
  duration: "#64748b",
  selectedStroke: "#818cf8"
};
function getTaskTypeColor(taskType) {
  const palette = isDark() ? TASK_TYPE_COLORS_DARK : TASK_TYPE_COLORS_LIGHT;
  return palette[taskType] || palette.SubPipeline;
}
function getStatusColor(status) {
  const palette = isDark() ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;
  return palette[status] || palette.pending;
}
function getEdgeColor(status) {
  const palette = isDark() ? EDGE_COLORS_DARK : EDGE_COLORS_LIGHT;
  return palette[status] || palette.pending;
}
function getGroupColors() {
  return isDark() ? GROUP_COLORS_DARK : GROUP_COLORS_LIGHT;
}
function getCanvasBg() {
  return isDark() ? CANVAS_BG_DARK : CANVAS_BG_LIGHT;
}
function getNodeColors() {
  return isDark() ? NODE_COLORS_DARK : NODE_COLORS_LIGHT;
}
function getParticleColors() {
  if (isDark()) {
    return {
      edge: { r: 0.51, g: 0.55, b: 0.97, a: 0.9 },
      // bright indigo
      glow: { r: 0.39, g: 0.43, b: 0.95, a: 0.6 },
      // deep indigo
      ripple: { r: 0.65, g: 0.55, b: 0.98, a: 0.8 },
      // purple
      fail: { r: 0.98, g: 0.44, b: 0.52, a: 0.95 },
      // bright pink
      complete: { r: 0.2, g: 0.83, b: 0.6, a: 0.9 },
      // bright green
      ambient: { r: 0.51, g: 0.55, b: 0.97, a: 0.08 }
      // subtle dots
    };
  }
  return {
    edge: { r: 0.39, g: 0.4, b: 0.95, a: 0.75 },
    glow: { r: 0.3, g: 0.35, b: 0.85, a: 0.4 },
    ripple: { r: 0.39, g: 0.4, b: 0.95, a: 0.6 },
    fail: { r: 0.96, g: 0.25, b: 0.37, a: 0.85 },
    complete: { r: 0.06, g: 0.73, b: 0.5, a: 0.7 },
    ambient: { r: 0.39, g: 0.4, b: 0.95, a: 0.04 }
  };
}

// src/util/format.ts
function formatBytes(bytes) {
  if (bytes == null) return "\u2014";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function formatDuration(ms) {
  if (ms == null) return "\u2014";
  const totalSec = Math.floor(ms / 1e3);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec.toString().padStart(2, "0")}s`;
}
function formatRowCount(count) {
  if (count == null) return "\u2014";
  if (count < 1e3) return count.toString();
  if (count < 1e6) return `${(count / 1e3).toFixed(1)}K`;
  return `${(count / 1e6).toFixed(2)}M`;
}
function formatElapsed(ms) {
  const totalSec = Math.floor(Math.max(0, ms) / 1e3);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, "0")}s`;
}

// src/render/canvas-renderer.ts
var TASK_ICONS = {
  Extract: "\u2B07",
  // ⬇
  Transform: "\u2699",
  // ⚙
  Load: "\u2B06",
  // ⬆
  Test: "\u2714",
  // ✔
  Publish: "\u{1F4E4}",
  // 📤
  SubPipeline: "\u{1F517}",
  // 🔗
  Notification: "\u{1F514}"
  // 🔔
};
var STATUS_BADGES = {
  pending: "",
  running: "\u25B6",
  // ▶
  complete: "\u2714",
  // ✔
  failed: "\u2718"
  // ✘
};
var CanvasRenderer = class {
  canvas;
  ctx;
  camera;
  selectedNodeId;
  hoveredNodeId;
  animTime;
  _completionFlashes;
  _dagModel;
  _currentTime;
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.camera = camera;
    this.selectedNodeId = null;
    this.hoveredNodeId = null;
    this.animTime = 0;
    this._completionFlashes = /* @__PURE__ */ new Map();
    this._dagModel = null;
    this._currentTime = 0;
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.camera.setViewport(rect.width, rect.height);
  }
  // Trigger a completion flash for a node
  flashCompletion(nodeId) {
    this._completionFlashes.set(nodeId, performance.now());
  }
  render(dagModel, time, currentTime) {
    this.animTime = time;
    this._currentTime = currentTime || 0;
    const ctx = this.ctx;
    const canvasBg = getCanvasBg();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (document.documentElement.getAttribute("data-theme") === "dark") {
      this._drawGrid(ctx);
    }
    this.camera.applyTransform(ctx);
    this._drawEdges(dagModel, ctx);
    for (const node of dagModel.nodes.values()) {
      if (node.isSubPipeline && node.expanded && node.children.length > 0 && !node.parent) {
        this._drawGroup(node, ctx);
      }
    }
    for (const node of dagModel.nodes.values()) {
      if (node.parent && node.parent.isSubPipeline && !node.parent.expanded) {
        continue;
      }
      if (node.isSubPipeline && node.expanded && node.children.length > 0) {
        continue;
      }
      this._drawNode(node, ctx);
    }
    const now = performance.now();
    for (const [id, t] of this._completionFlashes) {
      if (now - t > 1e3) this._completionFlashes.delete(id);
    }
  }
  _drawGrid(ctx) {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.025)";
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
    this.camera.applyTransform(ctx);
  }
  _drawEdges(dagModel, ctx) {
    for (const edge of dagModel.edges.values()) {
      const source = dagModel.getNode(edge.sourceId);
      const target = dagModel.getNode(edge.targetId);
      if (!source || !target) continue;
      if (source.parent?.isSubPipeline && !source.parent.expanded) continue;
      if (target.parent?.isSubPipeline && !target.parent.expanded) continue;
      const color = getEdgeColor(edge.status);
      ctx.lineWidth = edge.status === "running" ? 2.5 : 2;
      if (edge.status === "running") {
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
      ctx.setLineDash([]);
      this._drawArrow(ctx, x2, y2, color);
    }
    ctx.setLineDash([]);
  }
  _drawArrow(ctx, x, y, color) {
    const size = 9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size, y - size / 2);
    ctx.lineTo(x - size, y + size / 2);
    ctx.closePath();
    ctx.fill();
  }
  _drawGroup(node, ctx) {
    const typeColor = getTaskTypeColor(node.taskType);
    const statusColor = getStatusColor(node.status);
    const groupColors = getGroupColors();
    const isDark2 = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark2) {
      ctx.shadowColor = statusColor.glow;
      ctx.shadowBlur = 15;
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.06)";
      ctx.shadowBlur = 8;
    }
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = groupColors.bg;
    ctx.strokeStyle = isDark2 ? statusColor.stroke : groupColors.border;
    ctx.lineWidth = isDark2 ? 1.5 : 2;
    roundRect(ctx, node.x, node.y, node.width, node.height, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const headerGrad = ctx.createLinearGradient(node.x, node.y, node.x + node.width, node.y);
    if (isDark2) {
      headerGrad.addColorStop(0, `${typeColor.accent}18`);
      headerGrad.addColorStop(1, "transparent");
    } else {
      headerGrad.addColorStop(0, groupColors.headerBg);
      headerGrad.addColorStop(1, "rgba(241,245,249,0.3)");
    }
    ctx.fillStyle = headerGrad;
    ctx.save();
    ctx.beginPath();
    ctx.rect(node.x, node.y, node.width, GROUP_HEADER);
    ctx.clip();
    roundRect(ctx, node.x, node.y, node.width, GROUP_HEADER + 12, 12);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = typeColor.accent;
    ctx.globalAlpha = isDark2 ? 0.4 : 0.25;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(node.x, node.y + GROUP_HEADER);
    ctx.lineTo(node.x + node.width, node.y + GROUP_HEADER);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = isDark2 ? typeColor.text : typeColor.text;
    ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(node.displayName, node.x + 12, node.y + GROUP_HEADER / 2);
    if (node.status !== "pending") {
      const badge = STATUS_BADGES[node.status];
      if (badge) {
        ctx.fillStyle = statusColor.badge;
        ctx.font = "bold 14px system-ui";
        ctx.textAlign = "right";
        ctx.fillText(badge, node.x + node.width - 12, node.y + GROUP_HEADER / 2);
      }
    }
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
  _drawNode(node, ctx) {
    const typeColor = getTaskTypeColor(node.taskType);
    const statusColor = getStatusColor(node.status);
    const nodeColors = getNodeColors();
    const isHovered = this.hoveredNodeId === node.id;
    const isSelected = this.selectedNodeId === node.id;
    const isDark2 = document.documentElement.getAttribute("data-theme") === "dark";
    const flashT = this._completionFlashes.has(node.id) ? (performance.now() - this._completionFlashes.get(node.id)) / 1e3 : -1;
    if (node.status === "running" || node.status === "failed" || isSelected) {
      ctx.shadowColor = node.status === "running" ? statusColor.glow : node.status === "failed" ? statusColor.glow : nodeColors.selectedStroke;
      ctx.shadowBlur = isHovered ? 20 : 14;
      ctx.shadowOffsetY = 0;
    } else if (isHovered) {
      ctx.shadowColor = isDark2 ? "rgba(129,140,248,0.2)" : "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
    } else {
      ctx.shadowColor = isDark2 ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.08)";
      ctx.shadowBlur = isDark2 ? 8 : 6;
      ctx.shadowOffsetY = 2;
    }
    if (node.status === "pending") {
      ctx.fillStyle = nodeColors.bg;
    } else {
      const grad = ctx.createLinearGradient(node.x, node.y, node.x + node.width, node.y + node.height);
      grad.addColorStop(0, statusColor.fill);
      if (isDark2) {
        grad.addColorStop(1, nodeColors.bg);
      } else {
        grad.addColorStop(1, "#ffffff");
      }
      ctx.fillStyle = grad;
    }
    ctx.strokeStyle = isSelected ? nodeColors.selectedStroke : statusColor.stroke;
    ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5;
    roundRect(ctx, node.x, node.y, node.width, node.height, 10);
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
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
    ctx.font = "16px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = typeColor.accent;
    const icon = TASK_ICONS[node.taskType] || "\u2B24";
    ctx.fillText(icon, node.x + 14, node.y + node.height / 2 - 6);
    ctx.fillStyle = nodeColors.text;
    ctx.font = "600 13px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let label = node.displayName;
    const maxLabelWidth = node.width - 60;
    while (ctx.measureText(label).width > maxLabelWidth && label.length > 3) {
      label = label.slice(0, -1);
    }
    if (label !== node.displayName) label += "\u2026";
    ctx.fillText(label, node.x + 34, node.y + node.height / 2 - 6);
    ctx.fillStyle = nodeColors.subtext;
    ctx.font = "10px system-ui";
    ctx.fillText(node.taskType, node.x + 34, node.y + node.height / 2 + 10);
    if (node.status === "running" && node.startTime != null && this._currentTime > 0) {
      const elapsed = this._currentTime - node.startTime;
      ctx.fillStyle = statusColor.badge;
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(formatElapsed(elapsed), node.x + node.width - 10, node.y + node.height / 2 + 10);
    } else if (node.duration) {
      ctx.fillStyle = nodeColors.duration;
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(formatDuration(node.duration), node.x + node.width - 10, node.y + node.height / 2 + 10);
    }
    const badge = STATUS_BADGES[node.status];
    if (badge) {
      ctx.fillStyle = statusColor.badge;
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(badge, node.x + node.width - 10, node.y + node.height / 2 - 6);
    }
    if (node.status === "running") {
      const alpha = 0.2 + 0.3 * Math.sin(this.animTime * 5e-3);
      ctx.strokeStyle = statusColor.stroke;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      roundRect(ctx, node.x - 3, node.y - 3, node.width + 6, node.height + 6, 12);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (flashT >= 0 && flashT < 1) {
      const expand = flashT * 12;
      const alpha = (1 - flashT) * 0.6;
      ctx.strokeStyle = statusColor.stroke;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      roundRect(
        ctx,
        node.x - expand,
        node.y - expand,
        node.width + expand * 2,
        node.height + expand * 2,
        10 + expand
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (isSelected && node.status !== "running") {
      ctx.strokeStyle = nodeColors.selectedStroke;
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.animTime * 3e-3);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -this.animTime * 0.02;
      roundRect(ctx, node.x - 4, node.y - 4, node.width + 8, node.height + 8, 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (node.isSubPipeline && node.children.length > 0 && !node.expanded) {
      ctx.fillStyle = nodeColors.subtext;
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText("\u25B6 expand", node.x + node.width - 10, node.y + node.height - 8);
    }
  }
  // Hit test: find node at screen coordinates
  hitTest(sx, sy) {
    const world = this.camera.screenToWorld(sx, sy);
    for (const node of this._dagModel?.nodes?.values() || []) {
      if (node.parent?.isSubPipeline && !node.parent.expanded) continue;
      if (node.isSubPipeline && node.expanded && node.children.length > 0) continue;
      if (world.x >= node.x && world.x <= node.x + node.width && world.y >= node.y && world.y <= node.y + node.height) {
        return node;
      }
    }
    for (const node of this._dagModel?.nodes?.values() || []) {
      if (!node.isSubPipeline || !node.expanded || node.children.length === 0) continue;
      if (node.parent?.isSubPipeline && !node.parent.expanded) continue;
      if (world.x >= node.x && world.x <= node.x + node.width && world.y >= node.y && world.y <= node.y + node.height) {
        return node;
      }
    }
    return null;
  }
  _getVisibleNodes() {
    const visible = [];
    for (const node of this._dagModel?.nodes?.values() || []) {
      if (node.parent?.isSubPipeline && !node.parent.expanded) continue;
      visible.push(node);
    }
    return visible;
  }
  setDagModel(dagModel) {
    this._dagModel = dagModel;
  }
};

// src/render/webgl-overlay.ts
var VERT_SHADER = `
  attribute vec2 a_position;
  attribute vec4 a_color;
  attribute float a_size;
  uniform vec2 u_resolution;
  uniform vec2 u_pan;
  uniform float u_zoom;
  uniform float u_dpr;
  varying vec4 v_color;
  void main() {
    vec2 world = (a_position + u_pan) * u_zoom + u_resolution * 0.5;
    vec2 clip = (world / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0, 1);
    gl_PointSize = a_size * u_zoom * u_dpr;
    v_color = a_color;
  }
`;
var FRAG_SHADER = `
  precision mediump float;
  varying vec4 v_color;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    // Softer falloff for more glow-like appearance
    float alpha = v_color.a * smoothstep(1.0, 0.2, d);
    // Add bright center for sparkle
    float core = smoothstep(0.4, 0.0, d) * 0.5;
    alpha += core * v_color.a;
    if (alpha < 0.005) discard;
    // Slightly boost brightness at center
    vec3 color = v_color.rgb + vec3(core * 0.3);
    gl_FragColor = vec4(color, alpha);
  }
`;
var WebGLOverlay = class {
  canvas;
  gl;
  particles;
  ripples;
  trails;
  program;
  maxParticles;
  _lastAmbientSpawn;
  // Attribute/uniform locations
  a_position;
  a_color;
  a_size;
  u_resolution;
  u_pan;
  u_zoom;
  u_dpr;
  // Buffers
  posBuffer;
  colorBuffer;
  sizeBuffer;
  // Display dimensions
  _displayWidth;
  _displayHeight;
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });
    this.particles = [];
    this.ripples = [];
    this.trails = [];
    this.program = null;
    this.maxParticles = 4e3;
    this._lastAmbientSpawn = 0;
    this._displayWidth = 0;
    this._displayHeight = 0;
    this._init();
  }
  _init() {
    const gl = this.gl;
    if (!gl) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const vs = this._compileShader(gl.VERTEX_SHADER, VERT_SHADER);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, FRAG_SHADER);
    if (!vs || !fs) return;
    this.program = gl.createProgram();
    if (!this.program) return;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error("WebGL program link failed:", gl.getProgramInfoLog(this.program));
      return;
    }
    this.a_position = gl.getAttribLocation(this.program, "a_position");
    this.a_color = gl.getAttribLocation(this.program, "a_color");
    this.a_size = gl.getAttribLocation(this.program, "a_size");
    this.u_resolution = gl.getUniformLocation(this.program, "u_resolution");
    this.u_pan = gl.getUniformLocation(this.program, "u_pan");
    this.u_zoom = gl.getUniformLocation(this.program, "u_zoom");
    this.u_dpr = gl.getUniformLocation(this.program, "u_dpr");
    this.posBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.sizeBuffer = gl.createBuffer();
  }
  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    }
    return shader;
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
    this._displayWidth = rect.width;
    this._displayHeight = rect.height;
  }
  // Spawn particles along running edges — enhanced with trails
  spawnEdgeParticles(dagModel, time) {
    const colors = getParticleColors();
    for (const edge of dagModel.edges.values()) {
      if (edge.status !== "running") continue;
      const source = dagModel.getNode(edge.sourceId);
      const target = dagModel.getNode(edge.targetId);
      if (!source || !target) continue;
      if (source.parent?.isSubPipeline && !source.parent.expanded) continue;
      const x1 = source.x + source.width;
      const y1 = source.y + source.height / 2;
      const x2 = target.x;
      const y2 = target.y + target.height / 2;
      const pts = getBezierPoints(x1, y1, x2, y2);
      if (this.particles.length < this.maxParticles) {
        const t = time * 1e-3 * 0.4 % 1;
        for (let i = 0; i < 3; i++) {
          const tt = (t + i * 0.33) % 1;
          const p = bezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, tt);
          this.particles.push({
            x: p.x + (Math.random() - 0.5) * 4,
            y: p.y + (Math.random() - 0.5) * 4,
            ...colors.edge,
            size: 7 + Math.random() * 5,
            life: 0,
            maxLife: 25
          });
        }
        const trailT = time * 1e-3 * 0.3 % 1;
        for (let i = 0; i < 5; i++) {
          const tt = (trailT + i * 0.2) % 1;
          const p = bezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, tt);
          this.particles.push({
            x: p.x + (Math.random() - 0.5) * 8,
            y: p.y + (Math.random() - 0.5) * 8,
            r: colors.edge.r,
            g: colors.edge.g,
            b: colors.edge.b,
            a: colors.edge.a * 0.25,
            size: 12 + Math.random() * 8,
            life: 0,
            maxLife: 15
          });
        }
      }
    }
  }
  // Enhanced glow around running nodes
  spawnNodeGlow(dagModel, time) {
    const colors = getParticleColors();
    for (const node of dagModel.nodes.values()) {
      if (node.status !== "running") continue;
      if (node.parent?.isSubPipeline && !node.parent.expanded) continue;
      if (node.isSubPipeline && node.expanded) continue;
      if (this.particles.length < this.maxParticles && Math.random() < 0.5) {
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.max(node.width, node.height) * 0.55;
        this.particles.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          ...colors.glow,
          size: 14 + Math.random() * 10,
          life: 0,
          maxLife: 35
        });
        if (Math.random() < 0.3) {
          this.particles.push({
            x: cx + (Math.random() - 0.5) * node.width * 0.6,
            y: cy + (Math.random() - 0.5) * node.height * 0.6,
            r: colors.glow.r,
            g: colors.glow.g,
            b: colors.glow.b,
            a: colors.glow.a * 0.3,
            size: 20 + Math.random() * 15,
            life: 0,
            maxLife: 20
          });
        }
      }
    }
  }
  // Ambient floating particles across the canvas
  spawnAmbientParticles(dagModel, time) {
    if (time - this._lastAmbientSpawn < 200) return;
    this._lastAmbientSpawn = time;
    const colors = getParticleColors();
    if (this.particles.length >= this.maxParticles) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of dagModel.nodes.values()) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    const pad = 200;
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: minX - pad + Math.random() * (maxX - minX + pad * 2),
        y: minY - pad + Math.random() * (maxY - minY + pad * 2),
        ...colors.ambient,
        size: 3 + Math.random() * 5,
        life: 0,
        maxLife: 60 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3
      });
    }
  }
  addRipple(x, y) {
    this.ripples.push({ x, y, startTime: performance.now(), duration: 800 });
  }
  // Enhanced completion burst
  spawnCompletionBurst(node) {
    const colors = getParticleColors();
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    for (let i = 0; i < 30; i++) {
      const angle = i / 30 * Math.PI * 2 + Math.random() * 0.3;
      const speed = 1.5 + Math.random() * 3;
      this.particles.push({
        x: cx + Math.cos(angle) * 15,
        y: cy + Math.sin(angle) * 15,
        ...colors.complete,
        size: 6 + Math.random() * 8,
        life: 0,
        maxLife: 35 + Math.random() * 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed
      });
    }
    this.particles.push({
      x: cx,
      y: cy,
      r: colors.complete.r + 0.2,
      g: colors.complete.g + 0.2,
      b: colors.complete.b + 0.2,
      a: 0.8,
      size: 40,
      life: 0,
      maxLife: 20
    });
  }
  spawnFailFlash(node) {
    const colors = getParticleColors();
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.particles.push({
        x: cx + Math.cos(angle) * 15,
        y: cy + Math.sin(angle) * 15,
        ...colors.fail,
        size: 8 + Math.random() * 8,
        life: 0,
        maxLife: 35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed
      });
    }
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      this.particles.push({
        x: cx + Math.cos(angle) * 5,
        y: cy + Math.sin(angle) * 5,
        ...colors.fail,
        size: 12,
        life: 0,
        maxLife: 25,
        vx: Math.cos(angle) * 3,
        vy: Math.sin(angle) * 3
      });
    }
  }
  render(camera, time) {
    const gl = this.gl;
    if (!gl || !this.program) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    const now = performance.now();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;
      if (p.vx) {
        p.x += p.vx;
        p.vx *= 0.97;
      }
      if (p.vy) {
        p.y += p.vy;
        p.vy *= 0.97;
      }
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
    const colors = getParticleColors();
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      const elapsed = now - r.startTime;
      if (elapsed > r.duration) {
        this.ripples.splice(i, 1);
        continue;
      }
      const t = elapsed / r.duration;
      const radius = t * 80;
      const alpha = (1 - t) * 0.7;
      for (let a = 0; a < 12; a++) {
        const angle = a / 12 * Math.PI * 2 + t * Math.PI;
        if (this.particles.length < this.maxParticles) {
          this.particles.push({
            x: r.x + Math.cos(angle) * radius,
            y: r.y + Math.sin(angle) * radius,
            ...colors.ripple,
            a: alpha * colors.ripple.a,
            size: 7 * (1 - t * 0.5),
            life: 0,
            maxLife: 5
          });
        }
      }
      if (t < 0.5 && this.particles.length < this.maxParticles) {
        this.particles.push({
          x: r.x + (Math.random() - 0.5) * radius * 0.5,
          y: r.y + (Math.random() - 0.5) * radius * 0.5,
          r: colors.ripple.r + 0.2,
          g: colors.ripple.g + 0.2,
          b: colors.ripple.b + 0.2,
          a: alpha * 0.5,
          size: 4 + Math.random() * 6,
          life: 0,
          maxLife: 8
        });
      }
    }
    if (this.particles.length === 0) return;
    const count = this.particles.length;
    const positions = new Float32Array(count * 2);
    const colorsArr = new Float32Array(count * 4);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      const fadeT = p.life / p.maxLife;
      const fadeAlpha = 1 - fadeT * fadeT;
      positions[i * 2] = p.x;
      positions[i * 2 + 1] = p.y;
      colorsArr[i * 4] = p.r;
      colorsArr[i * 4 + 1] = p.g;
      colorsArr[i * 4 + 2] = p.b;
      colorsArr[i * 4 + 3] = p.a * fadeAlpha;
      sizes[i] = p.size * (1 - fadeT * 0.3);
    }
    gl.useProgram(this.program);
    const dpr = window.devicePixelRatio || 1;
    gl.uniform2f(this.u_resolution, this._displayWidth, this._displayHeight);
    gl.uniform2f(this.u_pan, camera.x, camera.y);
    gl.uniform1f(this.u_zoom, camera.zoom);
    gl.uniform1f(this.u_dpr, dpr);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.a_position);
    gl.vertexAttribPointer(this.a_position, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colorsArr, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.a_color);
    gl.vertexAttribPointer(this.a_color, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.a_size);
    gl.vertexAttribPointer(this.a_size, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, count);
  }
};

// src/ui/controls.ts
var Controls = class {
  container;
  onRunChange;
  onThemeToggle;
  _runs;
  constructor(container, runs = {}) {
    this.container = container;
    this.onRunChange = null;
    this.onThemeToggle = null;
    this._runs = runs;
    this._build();
  }
  _build() {
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
    const runSelect = this.container.querySelector("#run-select");
    for (const [key, run] of Object.entries(this._runs)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = run.label;
      runSelect.appendChild(opt);
    }
    runSelect.addEventListener("change", () => {
      this.onRunChange?.(runSelect.value);
    });
    this.container.querySelector("#btn-theme").addEventListener("click", () => {
      this.onThemeToggle?.();
    });
  }
  setRun(key) {
    this.container.querySelector("#run-select").value = key;
  }
  setThemeIcon(isDark2) {
    const btn = this.container.querySelector("#btn-theme");
    btn.innerHTML = isDark2 ? "&#x2600;" : "&#x263E;";
    btn.title = isDark2 ? "Switch to light mode" : "Switch to dark mode";
  }
  setCapabilities(caps) {
    for (const el of this.container.querySelectorAll("[data-cap]")) {
      const key = el.getAttribute("data-cap");
      el.style.display = caps[key] ? "" : "none";
    }
  }
};

// src/ui/detail-panel.ts
var DATA_API_BASE = "http://localhost:8001";
function detectFormat(ds) {
  const name = (ds.name || "").toLowerCase();
  const ns = (ds.namespace || "").toLowerCase();
  if (name.endsWith(".json") || name.endsWith(".jsonl") || name.endsWith(".ndjson") || ns.includes("/json") || ns.includes("api/") || name.includes(".json")) {
    return "json";
  }
  return "csv";
}
var DetailPanel = class {
  container;
  currentNode;
  constructor(container) {
    this.container = container;
    this.currentNode = null;
  }
  show(node) {
    this.currentNode = node;
    this.container.classList.add("visible");
    this._render(node);
  }
  hide() {
    this.currentNode = null;
    this.container.classList.remove("visible");
    this.container.innerHTML = "";
  }
  update() {
    if (this.currentNode) this._render(this.currentNode);
  }
  _render(node) {
    const typeColor = getTaskTypeColor(node.taskType);
    const statusColor = getStatusColor(node.status);
    let html = `
      <div class="detail-header">
        <div class="detail-close" id="detail-close">&times;</div>
        <h3 class="detail-title">${node.displayName}</h3>
        <div class="detail-meta">
          <span class="detail-badge" style="background:${typeColor.accent};color:white">${node.taskType}</span>
          <span class="detail-badge" style="background:${statusColor.badge};color:white">${node.status}</span>
        </div>
      </div>
      <div class="detail-body">
    `;
    if (node.description) {
      html += `<div class="detail-section">
        <h4>Description</h4>
        <p class="detail-desc">${node.description}</p>
      </div>`;
    }
    html += `<div class="detail-section">
      <h4>Timing</h4>
      <div class="detail-grid">
        <span class="detail-label">Duration:</span>
        <span>${formatDuration(node.duration)}</span>
        <span class="detail-label">Start:</span>
        <span>${node.startTime ? new Date(node.startTime).toISOString().substring(11, 19) : "\u2014"}</span>
        <span class="detail-label">End:</span>
        <span>${node.endTime ? new Date(node.endTime).toISOString().substring(11, 19) : "\u2014"}</span>
      </div>
    </div>`;
    if (node.attempts.length > 0) {
      html += `<div class="detail-section">
        <h4>Retry History</h4>`;
      for (let i = 0; i < node.attempts.length; i++) {
        const a = node.attempts[i];
        html += `<div class="detail-attempt detail-attempt-${a.status}">
          <strong>Attempt ${i + 1}</strong> \u2014 ${a.status}
          ${a.error ? `<div class="detail-error">${a.error.message}</div>` : ""}
        </div>`;
      }
      html += `</div>`;
    }
    if (node.error) {
      html += `<div class="detail-section">
        <h4>Error</h4>
        <div class="detail-error-box">
          <div class="detail-error-msg">${node.error.message}</div>
          ${node.error.stackTrace ? `<pre class="detail-stacktrace">${escapeHtml(node.error.stackTrace)}</pre>` : ""}
        </div>
      </div>`;
    }
    if (node.taskSQL) {
      html += `<div class="detail-section">
        <h4>SQL</h4>
        <pre class="detail-sql">${escapeHtml(node.taskSQL)}</pre>
      </div>`;
    }
    if (node.datasets.inputs.length > 0 || node.datasets.outputs.length > 0) {
      html += `<div class="detail-section"><h4>Datasets</h4>`;
      if (node.datasets.inputs.length > 0) {
        html += `<div class="detail-ds-group"><h5>Inputs</h5>`;
        for (const ds of node.datasets.inputs) {
          html += this._renderDataset(ds, "input");
        }
        html += `</div>`;
      }
      if (node.datasets.outputs.length > 0) {
        html += `<div class="detail-ds-group"><h5>Outputs</h5>`;
        for (const ds of node.datasets.outputs) {
          html += this._renderDataset(ds, "output");
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    if (node.events.length > 0) {
      html += `<div class="detail-section">
        <h4>Event Log</h4>
        <div class="detail-events">`;
      for (const evt of node.events) {
        const time = evt.eventTime.substring(11, 19);
        const typeClass = `event-${evt.eventType.toLowerCase()}`;
        html += `<div class="detail-event ${typeClass}">
          <span class="detail-event-time">${time}</span>
          <span class="detail-event-type">${evt.eventType}</span>
          <span class="detail-event-job">${evt.jobName}</span>
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
    this.container.innerHTML = html;
    this.container.querySelector("#detail-close")?.addEventListener("click", () => {
      this.hide();
    });
    this.container.querySelectorAll(".detail-dataset-clickable").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".detail-ds-download-btn")) return;
        const dsIndex = parseInt(el.dataset.dsIndex, 10);
        const dsType = el.dataset.dsType;
        const datasets = dsType === "input" ? node.datasets.inputs : node.datasets.outputs;
        const ds = datasets[dsIndex];
        if (ds) this._showPreview(ds);
      });
    });
    this.container.querySelectorAll(".detail-ds-download-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const dsIndex = parseInt(btn.dataset.dsIndex, 10);
        const dsType = btn.dataset.dsType;
        const datasets = dsType === "input" ? node.datasets.inputs : node.datasets.outputs;
        const ds = datasets[dsIndex];
        if (ds && ds.fields && ds.fields.length > 0) {
          this._downloadData(ds);
        }
      });
    });
  }
  _renderDataset(ds, type) {
    const shortName = ds.name.split("/").pop() || ds.name;
    const hasFields = ds.fields && ds.fields.length > 0;
    const fmt = detectFormat(ds);
    const fmtLabel = fmt === "json" ? "JSON" : "CSV";
    const dsIndex = type === "input" ? this.currentNode.datasets.inputs.indexOf(ds) : this.currentNode.datasets.outputs.indexOf(ds);
    let html = `<div class="detail-dataset detail-dataset-clickable" data-ds-index="${dsIndex}" data-ds-type="${type}">
      <div class="detail-ds-name" title="${escapeHtml(ds.namespace)}/${escapeHtml(ds.name)}">
        ${escapeHtml(shortName)}
        <button class="detail-ds-download-btn${hasFields ? "" : " disabled"}" data-ds-index="${dsIndex}" data-ds-type="${type}" title="${hasFields ? `Download ${fmtLabel}` : "No schema available for download"}">&#8615;</button>
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
    html += `<div class="detail-ds-preview-hint">${hasFields ? "Click to preview data" : "Click to view details"}</div>`;
    html += `</div>`;
    return html;
  }
  async _showPreview(ds) {
    const shortName = ds.name.split("/").pop() || ds.name;
    const hasFields = ds.fields && ds.fields.length > 0;
    const fmt = detectFormat(ds);
    const fmtLabel = fmt === "json" ? "JSON" : "CSV";
    const overlay = document.createElement("div");
    overlay.className = "data-preview-overlay";
    overlay.innerHTML = `
      <div class="data-preview-modal">
        <div class="data-preview-header">
          <h3>${escapeHtml(shortName)}</h3>
          <div class="data-preview-actions">
            ${hasFields ? `<button class="data-preview-download">Download ${fmtLabel}</button>` : ""}
            <button class="data-preview-close">&times;</button>
          </div>
        </div>
        <div class="data-preview-meta">
          <span class="data-preview-meta-label">Namespace:</span> ${escapeHtml(ds.namespace)}<br>
          <span class="data-preview-meta-label">Name:</span> ${escapeHtml(ds.name)}
          ${ds.stats ? `<br><span class="data-preview-meta-label">Stats:</span> ${ds.stats.rowCount != null ? formatRowCount(ds.stats.rowCount) + " rows" : ""}${ds.stats.size != null ? ", " + formatBytes(ds.stats.size) : ""}` : ""}
        </div>
        <div class="data-preview-status">${hasFields ? "Loading preview..." : ""}</div>
        <div class="data-preview-table-wrap"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector(".data-preview-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    const dlBtn = overlay.querySelector(".data-preview-download");
    if (dlBtn) {
      dlBtn.addEventListener("click", () => this._downloadData(ds));
    }
    const statusEl = overlay.querySelector(".data-preview-status");
    const tableWrap = overlay.querySelector(".data-preview-table-wrap");
    if (!hasFields) {
      tableWrap.innerHTML = `
        <div class="data-preview-no-schema">
          <p>No schema information available for this dataset.</p>
          <p>Schema data is needed to generate a preview and download.</p>
        </div>
      `;
      return;
    }
    try {
      const res = await fetch(`${DATA_API_BASE}/api/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: ds.fields, datasetName: shortName })
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      statusEl.textContent = `Showing ${data.rows.length} of ~${data.totalAvailable.toLocaleString()} rows`;
      if (fmt === "json") {
        const objects = data.rows.map((row) => {
          const obj = {};
          data.columns.forEach((col, i) => {
            obj[col] = row[i];
          });
          return obj;
        });
        const jsonStr = objects.map((o) => JSON.stringify(o, null, 2)).join(",\n");
        tableWrap.innerHTML = `<pre class="data-preview-json">[${"\n"}${jsonStr}${"\n"}]</pre>`;
      } else {
        let tableHtml = '<table class="data-preview-table"><thead><tr>';
        for (const col of data.columns) {
          tableHtml += `<th>${escapeHtml(col)}</th>`;
        }
        tableHtml += "</tr></thead><tbody>";
        for (const row of data.rows) {
          tableHtml += "<tr>";
          for (const cell of row) {
            const val = cell === null || cell === void 0 ? "" : String(cell);
            tableHtml += `<td title="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
          }
          tableHtml += "</tr>";
        }
        tableHtml += "</tbody></table>";
        tableWrap.innerHTML = tableHtml;
      }
    } catch (err) {
      statusEl.textContent = "";
      tableWrap.innerHTML = `
        <div class="data-preview-error">
          <p>Could not load preview data.</p>
          <p>Make sure the data server is running:<br>
          <code>python3 api/data_server.py</code></p>
          <p class="data-preview-error-detail">${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }
  async _downloadData(ds) {
    const shortName = ds.name.split("/").pop() || ds.name;
    const fmt = detectFormat(ds);
    const endpoint = fmt === "json" ? "/api/download-json" : "/api/download";
    const ext = fmt === "json" ? shortName.endsWith(".jsonl") ? ".jsonl" : ".json" : ".csv";
    try {
      const res = await fetch(`${DATA_API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: ds.fields, datasetName: shortName })
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = shortName.endsWith(ext) ? shortName : shortName + ext;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}

Make sure the data server is running:
python3 api/data_server.py`);
    }
  }
};
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// src/ui/interaction.ts
var Interaction = class {
  canvas;
  camera;
  renderer;
  dagModel;
  // Callbacks
  onNodeClick;
  onNodeHover;
  onToggleSubPipeline;
  // State
  _isMouseDown;
  _isPanning;
  _lastMouse;
  _mouseDownPos;
  constructor(canvas, camera, renderer) {
    this.canvas = canvas;
    this.camera = camera;
    this.renderer = renderer;
    this.dagModel = null;
    this.onNodeClick = null;
    this.onNodeHover = null;
    this.onToggleSubPipeline = null;
    this._isMouseDown = false;
    this._isPanning = false;
    this._lastMouse = { x: 0, y: 0 };
    this._mouseDownPos = { x: 0, y: 0 };
    this._bindEvents();
  }
  setDagModel(dagModel) {
    this.dagModel = dagModel;
  }
  _bindEvents() {
    const el = this.canvas;
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.camera.zoomAt(e.offsetX, e.offsetY, factor);
    }, { passive: false });
    el.addEventListener("dblclick", (e) => {
      const node = this.renderer.hitTest(e.offsetX, e.offsetY);
      if (node) this._handleDblClick(node);
    });
    el.addEventListener("mousedown", (e) => {
      this._isMouseDown = true;
      this._isPanning = false;
      this._lastMouse = { x: e.clientX, y: e.clientY };
      this._mouseDownPos = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener("mousemove", (e) => {
      if (this._isMouseDown) {
        const dxFromDown = Math.abs(e.clientX - this._mouseDownPos.x);
        const dyFromDown = Math.abs(e.clientY - this._mouseDownPos.y);
        if (!this._isPanning && (dxFromDown >= 5 || dyFromDown >= 5)) {
          this._isPanning = true;
          this._lastMouse = { x: e.clientX, y: e.clientY };
        }
        if (this._isPanning) {
          const dx = e.clientX - this._lastMouse.x;
          const dy = e.clientY - this._lastMouse.y;
          this.camera.pan(dx, dy);
          this._lastMouse = { x: e.clientX, y: e.clientY };
          el.style.cursor = "grabbing";
        }
      } else {
        const node = this.renderer.hitTest(e.offsetX, e.offsetY);
        this.renderer.hoveredNodeId = node?.id || null;
        el.style.cursor = node ? "pointer" : "grab";
        this.onNodeHover?.(node);
      }
    });
    window.addEventListener("mouseup", (e) => {
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
    let lastTouchDist = 0;
    el.addEventListener("touchstart", (e) => {
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
    el.addEventListener("touchmove", (e) => {
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
    el.addEventListener("touchend", (e) => {
      if (e.touches.length === 0) {
        this._isPanning = false;
        lastTouchDist = 0;
      }
    }, { passive: true });
  }
  _handleClick(node) {
    this.renderer.selectedNodeId = node.id;
    this.onNodeClick?.(node);
  }
  _handleDblClick(node) {
    if (node.isSubPipeline && node.children.length > 0) {
      this.onToggleSubPipeline?.(node.id);
    }
  }
};

// src/pipeline-visualizer.ts
var PipelineVisualizer = class {
  container;
  source;
  dagModel;
  camera;
  _loopRunning;
  mainCanvas;
  glCanvas;
  renderer;
  webgl;
  controls;
  detailPanel;
  interaction;
  // Extension point: called each render frame so harness can update its UI
  onFrame;
  constructor(container, source) {
    this.container = container;
    this.source = source;
    this.dagModel = null;
    this.camera = new Camera();
    this._loopRunning = false;
    this.onFrame = null;
    this._ensureDom();
    this.mainCanvas = container.querySelector("#main-canvas");
    this.glCanvas = container.querySelector("#gl-canvas");
    this.renderer = new CanvasRenderer(this.mainCanvas, this.camera);
    this.webgl = new WebGLOverlay(this.glCanvas);
    this.controls = new Controls(container.querySelector("#toolbar"), source.runs);
    this.detailPanel = new DetailPanel(container.querySelector("#detail-panel"));
    this.interaction = new Interaction(this.mainCanvas, this.camera, this.renderer);
    this.controls.setCapabilities(source.capabilities);
    this._initTheme();
    this._wireEvents();
    this._handleResize();
    window.addEventListener("resize", () => this._handleResize());
    const canvasContainer = container.querySelector("#canvas-container");
    if (typeof ResizeObserver !== "undefined" && canvasContainer) {
      new ResizeObserver(() => this._handleResize()).observe(canvasContainer);
    }
    this.source.onNodeEvent((nodeId, event) => {
      if (!this.dagModel) return;
      const node = this.dagModel.getNode(nodeId);
      if (!node) return;
      this.webgl.addRipple(node.x + node.width / 2, node.y + node.height / 2);
      if (event.eventType === "COMPLETE") {
        this.webgl.spawnCompletionBurst(node);
        this.renderer.flashCompletion(nodeId);
      }
      if (event.eventType === "FAIL") {
        this.webgl.spawnFailFlash(node);
      }
      this.detailPanel.update();
    });
  }
  // Create the expected DOM structure if it doesn't already exist.
  _ensureDom() {
    if (this.container.querySelector("#toolbar")) return;
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
  get playbackSlot() {
    return this.container.querySelector("#toolbar-playback");
  }
  // Slot for harness to inject timeline UI
  get timelineSlot() {
    return this.container.querySelector("#timeline");
  }
  // Slot for harness to inject status info (event counter, etc.) into toolbar right
  get statusSlot() {
    return this.container.querySelector("#toolbar-status");
  }
  _initTheme() {
    try {
      const saved = localStorage.getItem("pv-theme");
      if (saved) {
        document.documentElement.setAttribute("data-theme", saved);
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    } catch (_) {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    }
    const isDark2 = document.documentElement.getAttribute("data-theme") === "dark";
    this.controls.setThemeIcon(isDark2);
  }
  _toggleTheme() {
    const isDark2 = document.documentElement.getAttribute("data-theme") === "dark";
    const newTheme = isDark2 ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    try {
      localStorage.setItem("pv-theme", newTheme);
    } catch (_) {
    }
    this.controls.setThemeIcon(!isDark2);
  }
  _wireEvents() {
    this.controls.onRunChange = (key) => this.loadRun(key);
    this.controls.onThemeToggle = () => this._toggleTheme();
    this.interaction.onNodeClick = (node) => {
      if (node) {
        this.detailPanel.show(node);
      } else {
        this.detailPanel.hide();
      }
    };
    this.interaction.onToggleSubPipeline = (nodeId) => {
      if (this.dagModel) {
        toggleSubPipeline(this.dagModel, nodeId);
        this.camera.fitToContent(this.dagModel.allNodes());
      }
    };
  }
  _handleResize() {
    this.renderer.resize();
    this.webgl.resize();
  }
  async loadRun(key) {
    if (this.source.capabilities.runPicker) {
      this.controls.setRun(key);
    }
    this.dagModel = await this.source.load(key);
    if (!this.dagModel) return;
    this.renderer.setDagModel(this.dagModel);
    this.interaction.setDagModel(this.dagModel);
    relayout(this.dagModel);
    this.camera.fitToContent(this.dagModel.allNodes());
    this.detailPanel.hide();
    if (!this._loopRunning) {
      this._loopRunning = true;
      this._renderLoop();
    }
  }
  _renderLoop() {
    const loop = (time) => {
      this.source.tick(time);
      if (this.dagModel) {
        this.renderer.render(this.dagModel, time, this.source.frameState.currentTime);
      }
      if (this.dagModel) {
        this.webgl.spawnEdgeParticles(this.dagModel, time);
        this.webgl.spawnNodeGlow(this.dagModel, time);
        this.webgl.spawnAmbientParticles(this.dagModel, time);
        this.webgl.render(this.camera, time);
      }
      this.onFrame?.(time);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  destroy() {
    this._loopRunning = false;
    this.source.dispose();
  }
};

// src/data/data-source.ts
var DataSource = class {
  // Which UI controls this source supports
  get capabilities() {
    return {
      runPicker: false
    };
  }
  // Available run options for the picker: { key: { label } }
  get runs() {
    return {};
  }
  // Load data for a given run key. Returns a DagModel.
  async load(_config) {
    return null;
  }
  // Cleanup (close websocket, clear timers, etc.)
  dispose() {
  }
  // Called every animation frame with the rAF timestamp
  tick(_rafTime) {
  }
  // Current frame state snapshot, read each frame
  get frameState() {
    return {
      currentTime: 0
    };
  }
  // Register callback for node status changes: fn(nodeId, event)
  onNodeEvent(_fn) {
  }
  // Register callback for playback/stream end: fn()
  onEnd(_fn) {
  }
};
export {
  DataSource,
  PipelineVisualizer
};
//# sourceMappingURL=pipeline-visualizer.js.map
