// Task type color palettes — theme-aware
// Light mode uses softer fills, dark mode uses deeper bg with vibrant accents

import type { TaskTypeColorSet, StatusColorSet, GroupColorSet, NodeColorSet, ParticleColorSet } from '../types.js';

function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

const TASK_TYPE_COLORS_LIGHT: Record<string, TaskTypeColorSet> = {
  Extract:     { bg: '#eef2ff', accent: '#6366f1', text: '#4338ca', gradient: ['#818cf8', '#6366f1'] },
  Transform:   { bg: '#f5f3ff', accent: '#8b5cf6', text: '#6d28d9', gradient: ['#a78bfa', '#8b5cf6'] },
  Load:        { bg: '#ecfdf5', accent: '#10b981', text: '#047857', gradient: ['#34d399', '#10b981'] },
  Test:        { bg: '#fff7ed', accent: '#f59e0b', text: '#b45309', gradient: ['#fbbf24', '#f59e0b'] },
  Publish:     { bg: '#ecfeff', accent: '#06b6d4', text: '#0e7490', gradient: ['#22d3ee', '#06b6d4'] },
  SubPipeline: { bg: '#f8fafc', accent: '#64748b', text: '#334155', gradient: ['#94a3b8', '#64748b'] },
  Notification:{ bg: '#fff1f2', accent: '#f43f5e', text: '#be123c', gradient: ['#fb7185', '#f43f5e'] },
};

const TASK_TYPE_COLORS_DARK: Record<string, TaskTypeColorSet> = {
  Extract:     { bg: 'rgba(99,102,241,0.12)', accent: '#818cf8', text: '#a5b4fc', gradient: ['#818cf8', '#6366f1'] },
  Transform:   { bg: 'rgba(139,92,246,0.12)', accent: '#a78bfa', text: '#c4b5fd', gradient: ['#a78bfa', '#8b5cf6'] },
  Load:        { bg: 'rgba(16,185,129,0.12)', accent: '#34d399', text: '#6ee7b7', gradient: ['#34d399', '#10b981'] },
  Test:        { bg: 'rgba(245,158,11,0.12)', accent: '#fbbf24', text: '#fcd34d', gradient: ['#fbbf24', '#f59e0b'] },
  Publish:     { bg: 'rgba(6,182,212,0.12)', accent: '#22d3ee', text: '#67e8f9', gradient: ['#22d3ee', '#06b6d4'] },
  SubPipeline: { bg: 'rgba(100,116,139,0.12)', accent: '#94a3b8', text: '#cbd5e1', gradient: ['#94a3b8', '#64748b'] },
  Notification:{ bg: 'rgba(244,63,94,0.12)', accent: '#fb7185', text: '#fda4af', gradient: ['#fb7185', '#f43f5e'] },
};

// Status colors
const STATUS_COLORS_LIGHT: Record<string, StatusColorSet> = {
  pending:  { fill: '#f1f5f9', stroke: '#94a3b8', badge: '#64748b', glow: 'transparent' },
  running:  { fill: '#eef2ff', stroke: '#6366f1', badge: '#4f46e5', glow: 'rgba(99,102,241,0.3)' },
  complete: { fill: '#ecfdf5', stroke: '#10b981', badge: '#059669', glow: 'rgba(16,185,129,0.2)' },
  failed:   { fill: '#fff1f2', stroke: '#f43f5e', badge: '#e11d48', glow: 'rgba(244,63,94,0.3)' },
};

const STATUS_COLORS_DARK: Record<string, StatusColorSet> = {
  pending:  { fill: 'rgba(100,116,139,0.08)', stroke: '#475569', badge: '#64748b', glow: 'transparent' },
  running:  { fill: 'rgba(99,102,241,0.15)', stroke: '#818cf8', badge: '#818cf8', glow: 'rgba(129,140,248,0.4)' },
  complete: { fill: 'rgba(16,185,129,0.12)', stroke: '#34d399', badge: '#34d399', glow: 'rgba(52,211,153,0.25)' },
  failed:   { fill: 'rgba(244,63,94,0.15)', stroke: '#fb7185', badge: '#fb7185', glow: 'rgba(251,113,133,0.35)' },
};

// Group container colors
const GROUP_COLORS_LIGHT: GroupColorSet = {
  bg: 'rgba(241, 245, 249, 0.6)',
  border: '#cbd5e1',
  headerBg: 'rgba(226, 232, 240, 0.7)',
};

const GROUP_COLORS_DARK: GroupColorSet = {
  bg: 'rgba(30, 30, 60, 0.4)',
  border: 'rgba(148, 163, 184, 0.2)',
  headerBg: 'rgba(40, 40, 70, 0.6)',
};

// Edge colors by status
const EDGE_COLORS_LIGHT: Record<string, string> = {
  pending:  '#cbd5e1',
  running:  '#818cf8',
  complete: '#34d399',
  failed:   '#fb7185',
};

const EDGE_COLORS_DARK: Record<string, string> = {
  pending:  '#334155',
  running:  '#818cf8',
  complete: '#34d399',
  failed:   '#fb7185',
};

// Canvas background
const CANVAS_BG_LIGHT = '#f0f2f5';
const CANVAS_BG_DARK = '#0f0f1a';

// Node colors for canvas
const NODE_COLORS_LIGHT: NodeColorSet = {
  bg: '#ffffff',
  text: '#1e293b',
  subtext: '#64748b',
  duration: '#94a3b8',
  selectedStroke: '#6366f1',
};

const NODE_COLORS_DARK: NodeColorSet = {
  bg: '#1e1e36',
  text: '#e2e8f0',
  subtext: '#94a3b8',
  duration: '#64748b',
  selectedStroke: '#818cf8',
};

export function getTaskTypeColor(taskType: string): TaskTypeColorSet {
  const palette = isDark() ? TASK_TYPE_COLORS_DARK : TASK_TYPE_COLORS_LIGHT;
  return palette[taskType] || palette.SubPipeline;
}

export function getStatusColor(status: string): StatusColorSet {
  const palette = isDark() ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;
  return palette[status] || palette.pending;
}

export function getEdgeColor(status: string): string {
  const palette = isDark() ? EDGE_COLORS_DARK : EDGE_COLORS_LIGHT;
  return palette[status] || palette.pending;
}

export function getGroupColors(): GroupColorSet {
  return isDark() ? GROUP_COLORS_DARK : GROUP_COLORS_LIGHT;
}

export function getCanvasBg(): string {
  return isDark() ? CANVAS_BG_DARK : CANVAS_BG_LIGHT;
}

export function getNodeColors(): NodeColorSet {
  return isDark() ? NODE_COLORS_DARK : NODE_COLORS_LIGHT;
}

// WebGL particle colors per theme
export function getParticleColors(): ParticleColorSet {
  if (isDark()) {
    return {
      edge: { r: 0.51, g: 0.55, b: 0.97, a: 0.9 },       // bright indigo
      glow: { r: 0.39, g: 0.43, b: 0.95, a: 0.6 },        // deep indigo
      ripple: { r: 0.65, g: 0.55, b: 0.98, a: 0.8 },      // purple
      fail: { r: 0.98, g: 0.44, b: 0.52, a: 0.95 },       // bright pink
      complete: { r: 0.20, g: 0.83, b: 0.60, a: 0.9 },    // bright green
      ambient: { r: 0.51, g: 0.55, b: 0.97, a: 0.08 },    // subtle dots
    };
  }
  return {
    edge: { r: 0.39, g: 0.40, b: 0.95, a: 0.75 },
    glow: { r: 0.30, g: 0.35, b: 0.85, a: 0.4 },
    ripple: { r: 0.39, g: 0.40, b: 0.95, a: 0.6 },
    fail: { r: 0.96, g: 0.25, b: 0.37, a: 0.85 },
    complete: { r: 0.06, g: 0.73, b: 0.50, a: 0.7 },
    ambient: { r: 0.39, g: 0.40, b: 0.95, a: 0.04 },
  };
}

// Backward compat re-exports
export function getGROUP_COLORS(): GroupColorSet { return getGroupColors(); }

// Legacy named exports (used in some tests)
export const TASK_TYPE_COLORS = TASK_TYPE_COLORS_LIGHT;
export const STATUS_COLORS = STATUS_COLORS_LIGHT;
export const GROUP_COLORS = GROUP_COLORS_LIGHT;
export const EDGE_COLORS = EDGE_COLORS_LIGHT;
