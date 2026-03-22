// Bottom timeline scrubber

import { formatTime } from '../util/format.js';

export class Timeline {
  container: HTMLElement;
  onSeek: ((fraction: number) => void) | null;
  isDragging: boolean;

  constructor(container: HTMLElement) {
    this.container = container;
    this.onSeek = null;
    this.isDragging = false;
    this._build();
  }

  _build(): void {
    this.container.innerHTML = `
      <div class="timeline-track" id="timeline-track">
        <div class="timeline-fill" id="timeline-fill"></div>
        <div class="timeline-thumb" id="timeline-thumb"></div>
      </div>
      <div class="timeline-time">
        <span id="timeline-elapsed">00:00:00</span>
        <span class="timeline-sep">/</span>
        <span id="timeline-total">00:00:00</span>
      </div>
    `;

    const track = this.container.querySelector('#timeline-track')!;

    const getSeekFraction = (e: MouseEvent | TouchEvent): number => {
      const rect = track.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    track.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.onSeek?.(getSeekFraction(e as MouseEvent));
    });

    track.addEventListener('touchstart', (e) => {
      this.isDragging = true;
      this.onSeek?.(getSeekFraction(e as TouchEvent));
    }, { passive: true });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) this.onSeek?.(getSeekFraction(e));
    });

    window.addEventListener('touchmove', (e) => {
      if (this.isDragging) this.onSeek?.(getSeekFraction(e));
    }, { passive: true });

    window.addEventListener('mouseup', () => { this.isDragging = false; });
    window.addEventListener('touchend', () => { this.isDragging = false; });
  }

  update(progress: number, elapsedMs: number, totalMs: number): void {
    const pct = (progress * 100).toFixed(2) + '%';
    (this.container.querySelector('#timeline-fill') as HTMLElement).style.width = pct;
    (this.container.querySelector('#timeline-thumb') as HTMLElement).style.left = pct;
    this.container.querySelector('#timeline-elapsed')!.textContent = formatTime(elapsedMs);
    this.container.querySelector('#timeline-total')!.textContent = formatTime(totalMs);
  }

  setSeekable(enabled: boolean): void {
    const track = this.container.querySelector('#timeline-track') as HTMLElement | null;
    const thumb = this.container.querySelector('#timeline-thumb') as HTMLElement | null;
    if (track) track.style.pointerEvents = enabled ? '' : 'none';
    if (thumb) thumb.style.display = enabled ? '' : 'none';
  }
}
