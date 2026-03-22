// WebGL overlay: glow, particles, ripples, trails, ambient effects
// Enhanced for maximum visual impact

import type { DagModel, DagNode } from '../data/dag-builder.js';
import type { Camera } from './camera.js';
import type { Particle, Ripple } from '../types.js';
import { getBezierPoints, bezierPoint } from '../util/geometry.js';
import { getParticleColors } from '../util/color.js';

const VERT_SHADER = `
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

const FRAG_SHADER = `
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

export class WebGLOverlay {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | null;
  particles: Particle[];
  ripples: Ripple[];
  trails: Particle[];
  program: WebGLProgram | null;
  maxParticles: number;
  _lastAmbientSpawn: number;

  // Attribute/uniform locations
  a_position!: number;
  a_color!: number;
  a_size!: number;
  u_resolution!: WebGLUniformLocation | null;
  u_pan!: WebGLUniformLocation | null;
  u_zoom!: WebGLUniformLocation | null;
  u_dpr!: WebGLUniformLocation | null;

  // Buffers
  posBuffer!: WebGLBuffer | null;
  colorBuffer!: WebGLBuffer | null;
  sizeBuffer!: WebGLBuffer | null;

  // Display dimensions
  _displayWidth: number;
  _displayHeight: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    this.particles = [];
    this.ripples = [];
    this.trails = [];
    this.program = null;
    this.maxParticles = 4000;
    this._lastAmbientSpawn = 0;
    this._displayWidth = 0;
    this._displayHeight = 0;
    this._init();
  }

  _init(): void {
    const gl = this.gl;
    if (!gl) return;

    gl.enable(gl.BLEND);
    // Additive blending for glow effect
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
      console.error('WebGL program link failed:', gl.getProgramInfoLog(this.program));
      return;
    }

    this.a_position = gl.getAttribLocation(this.program, 'a_position');
    this.a_color = gl.getAttribLocation(this.program, 'a_color');
    this.a_size = gl.getAttribLocation(this.program, 'a_size');
    this.u_resolution = gl.getUniformLocation(this.program, 'u_resolution');
    this.u_pan = gl.getUniformLocation(this.program, 'u_pan');
    this.u_zoom = gl.getUniformLocation(this.program, 'u_zoom');
    this.u_dpr = gl.getUniformLocation(this.program, 'u_dpr');

    this.posBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.sizeBuffer = gl.createBuffer();
  }

  _compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
    this._displayWidth = rect.width;
    this._displayHeight = rect.height;
  }

  // Spawn particles along running edges — enhanced with trails
  spawnEdgeParticles(dagModel: DagModel, time: number): void {
    const colors = getParticleColors();

    for (const edge of dagModel.edges.values()) {
      if (edge.status !== 'running') continue;

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
        // Main bright particles
        const t = (time * 0.001 * 0.4) % 1;
        for (let i = 0; i < 3; i++) {
          const tt = (t + i * 0.33) % 1;
          const p = bezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, tt);
          this.particles.push({
            x: p.x + (Math.random() - 0.5) * 4,
            y: p.y + (Math.random() - 0.5) * 4,
            ...colors.edge,
            size: 7 + Math.random() * 5,
            life: 0,
            maxLife: 25,
          });
        }

        // Trail particles (smaller, longer lived)
        const trailT = (time * 0.001 * 0.3) % 1;
        for (let i = 0; i < 5; i++) {
          const tt = (trailT + i * 0.2) % 1;
          const p = bezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, tt);
          this.particles.push({
            x: p.x + (Math.random() - 0.5) * 8,
            y: p.y + (Math.random() - 0.5) * 8,
            r: colors.edge.r, g: colors.edge.g, b: colors.edge.b,
            a: colors.edge.a * 0.25,
            size: 12 + Math.random() * 8,
            life: 0,
            maxLife: 15,
          });
        }
      }
    }
  }

  // Enhanced glow around running nodes
  spawnNodeGlow(dagModel: DagModel, time: number): void {
    const colors = getParticleColors();

    for (const node of dagModel.nodes.values()) {
      if (node.status !== 'running') continue;
      if (node.parent?.isSubPipeline && !node.parent.expanded) continue;
      if (node.isSubPipeline && node.expanded) continue;

      if (this.particles.length < this.maxParticles && Math.random() < 0.5) {
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.max(node.width, node.height) * 0.55;

        // Bright orbiting particles
        this.particles.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          ...colors.glow,
          size: 14 + Math.random() * 10,
          life: 0,
          maxLife: 35,
        });

        // Inner glow particles
        if (Math.random() < 0.3) {
          this.particles.push({
            x: cx + (Math.random() - 0.5) * node.width * 0.6,
            y: cy + (Math.random() - 0.5) * node.height * 0.6,
            r: colors.glow.r, g: colors.glow.g, b: colors.glow.b,
            a: colors.glow.a * 0.3,
            size: 20 + Math.random() * 15,
            life: 0,
            maxLife: 20,
          });
        }
      }
    }
  }

  // Ambient floating particles across the canvas
  spawnAmbientParticles(dagModel: DagModel, time: number): void {
    if (time - this._lastAmbientSpawn < 200) return;
    this._lastAmbientSpawn = time;

    const colors = getParticleColors();
    if (this.particles.length >= this.maxParticles) return;

    // Find bounds of all nodes
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
        vy: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  addRipple(x: number, y: number): void {
    this.ripples.push({ x, y, startTime: performance.now(), duration: 800 });
  }

  // Enhanced completion burst
  spawnCompletionBurst(node: DagNode): void {
    const colors = getParticleColors();
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 1.5 + Math.random() * 3;
      this.particles.push({
        x: cx + Math.cos(angle) * 15,
        y: cy + Math.sin(angle) * 15,
        ...colors.complete,
        size: 6 + Math.random() * 8,
        life: 0,
        maxLife: 35 + Math.random() * 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      });
    }
    // Central flash
    this.particles.push({
      x: cx, y: cy,
      r: colors.complete.r + 0.2,
      g: colors.complete.g + 0.2,
      b: colors.complete.b + 0.2,
      a: 0.8,
      size: 40,
      life: 0,
      maxLife: 20,
    });
  }

  spawnFailFlash(node: DagNode): void {
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
        vy: Math.sin(angle) * speed,
      });
    }
    // Shockwave ring
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      this.particles.push({
        x: cx + Math.cos(angle) * 5,
        y: cy + Math.sin(angle) * 5,
        ...colors.fail,
        size: 12,
        life: 0,
        maxLife: 25,
        vx: Math.cos(angle) * 3,
        vy: Math.sin(angle) * 3,
      });
    }
  }

  render(camera: Camera, time: number): void {
    const gl = this.gl;
    if (!gl || !this.program) return;

    gl.clear(gl.COLOR_BUFFER_BIT);

    // Update particles
    const now = performance.now();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;
      if (p.vx) { p.x += p.vx; p.vx *= 0.97; }
      if (p.vy) { p.y += p.vy; p.vy *= 0.97; }
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    // Add ripple particles — enhanced with more particles and color
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

      // Outer ring
      for (let a = 0; a < 12; a++) {
        const angle = (a / 12) * Math.PI * 2 + t * Math.PI;
        if (this.particles.length < this.maxParticles) {
          this.particles.push({
            x: r.x + Math.cos(angle) * radius,
            y: r.y + Math.sin(angle) * radius,
            ...colors.ripple,
            a: alpha * colors.ripple.a,
            size: 7 * (1 - t * 0.5),
            life: 0,
            maxLife: 5,
          });
        }
      }

      // Inner sparkle
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
          maxLife: 8,
        });
      }
    }

    if (this.particles.length === 0) return;

    // Build arrays
    const count = this.particles.length;
    const positions = new Float32Array(count * 2);
    const colorsArr = new Float32Array(count * 4);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      const fadeT = p.life / p.maxLife;
      // Ease-out fade for smoother disappearance
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
}
