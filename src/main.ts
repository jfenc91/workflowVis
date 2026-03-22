// Bootstrap: wire a data source to the visualization engine

import { SimulationSource } from './harness/simulation-source.js';
import { Timeline } from './harness/timeline.js';
import { PipelineVisualizer } from './pipeline-visualizer.js';

function init(): void {
  const source = new SimulationSource();
  const vis = new PipelineVisualizer(document.getElementById('app')!, source);

  // --- Harness-owned playback UI ---

  // Play/pause + reset buttons → toolbar center slot
  const playbackSlot = vis.playbackSlot;
  playbackSlot.innerHTML = `
    <button id="btn-reset" class="toolbar-btn" title="Reset">&#x23EE;</button>
    <button id="btn-play" class="toolbar-btn toolbar-btn-play" title="Play/Pause">&#x25B6;</button>
  `;

  // Speed selector + event counter → status slot (before theme button)
  const statusSlot = vis.statusSlot;
  const themeBtn = statusSlot.querySelector('#btn-theme')!;

  const speedLabel = document.createElement('label');
  speedLabel.className = 'toolbar-label';
  speedLabel.innerHTML = `
    Speed:
    <select id="speed-select" class="toolbar-select">
      <option value="1">1x</option>
      <option value="10">10x</option>
      <option value="50" selected>50x</option>
      <option value="100">100x</option>
    </select>
  `;
  statusSlot.insertBefore(speedLabel, themeBtn);

  const eventCounter = document.createElement('span');
  eventCounter.id = 'event-counter';
  eventCounter.className = 'toolbar-info';
  eventCounter.textContent = '0 / 0 events';
  statusSlot.insertBefore(eventCounter, themeBtn);

  // Timeline → timeline slot
  const timeline = new Timeline(vis.timelineSlot);

  // --- Wire playback controls ---

  const btnPlay = playbackSlot.querySelector('#btn-play')!;
  const btnReset = playbackSlot.querySelector('#btn-reset')!;
  const speedSelect = speedLabel.querySelector('#speed-select') as HTMLSelectElement;

  const updatePlayButton = (isPlaying: boolean): void => {
    btnPlay.innerHTML = isPlaying ? '&#x23F8;' : '&#x25B6;';
    (btnPlay as HTMLElement).title = isPlaying ? 'Pause' : 'Play';
  };

  btnPlay.addEventListener('click', () => {
    source.togglePlayPause();
    updatePlayButton(source.playbackState.playing);
  });

  btnReset.addEventListener('click', () => {
    source.reset();
    updatePlayButton(false);
  });

  speedSelect.addEventListener('change', () => {
    source.setSpeed(parseInt(speedSelect.value));
  });

  timeline.onSeek = (fraction) => {
    source.seekFraction(fraction);
    updatePlayButton(false);
  };

  source.onEnd(() => {
    updatePlayButton(false);
  });

  // --- Frame callback: update timeline + event counter from playback state ---
  vis.onFrame = () => {
    const ps = source.playbackState;
    timeline.update(ps.progress, ps.elapsed, ps.totalDuration);
    eventCounter.textContent = `${ps.deliveredCount} / ${ps.totalEvents} events`;
  };

  vis.loadRun('elt');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
