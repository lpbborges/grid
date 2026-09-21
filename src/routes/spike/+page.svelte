<!--
  SPIKE (spike/windows-mpv-wid-overlay): the only consumer of `spike_embed_player`.

  Answers one question on a real Windows machine: does this Svelte UI draw on
  top of an mpv surface embedded in the same Tauri window, and does it still
  receive clicks? Everything below is arranged so the answer is readable from
  a screenshot.

  Copy here is English, not pt-BR: this is a developer diagnostic that is
  deleted with the branch, never a user-facing screen.
-->
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  let path = $state('');
  let report = $state('');
  let failed = $state(false);
  let clicks = $state(0);
  let running = $state(false);

  async function start() {
    running = true;
    failed = false;
    report = 'starting mpv...';
    try {
      report = await invoke<string>('spike_embed_player', { path });
    } catch (error) {
      failed = true;
      report = String(error);
    } finally {
      running = false;
    }
  }

  async function stop() {
    try {
      await invoke('stop_native_player');
      report = 'stopped';
    } catch (error) {
      failed = true;
      report = String(error);
    }
  }
</script>

<!--
  The whole chain has to be transparent for mpv's sibling window to show
  through: html, body, and the layout's own bg-dark wrapper.
-->
<svelte:head>
  <title>Grid embedding spike</title>
</svelte:head>

<div class="spike-root">
  <!-- The hole. If compositing works, mpv's video is visible here. -->
  <div class="video-hole">
    <p class="hint">
      VIDEO SHOULD BE VISIBLE HERE.<br />
      If this text sits on a plain background, compositing failed.
    </p>
  </div>

  <!-- The overlay. Must stay visible and clickable over the video. -->
  <div class="overlay">
    <div class="row">
      <input
        class="path"
        type="text"
        bind:value={path}
        placeholder="C:\path\to\test.mkv"
        spellcheck="false"
      />
      <button class="btn" onclick={start} disabled={running || path.trim() === ''}>
        {running ? 'STARTING' : 'EMBED MPV'}
      </button>
      <button class="btn" onclick={stop}>STOP</button>
    </div>

    <div class="row">
      <button class="btn" onclick={() => (clicks += 1)}>
        CLICKS REACHING THE UI: {clicks}
      </button>
      <span class="note">
        If this counter increments while video plays underneath, the webview is receiving input and
        the overlay is live.
      </span>
    </div>

    {#if report}
      <p class="report" class:failed>{report}</p>
    {/if}
  </div>
</div>

<style>
  /* The layout wraps every route in an opaque bg-dark shell; punch through it. */
  :global(html),
  :global(body) {
    background: transparent !important;
    background-image: none !important;
  }
  :global(body > div) {
    background: transparent !important;
  }

  .spike-root {
    position: relative;
    display: flex;
    height: 100%;
    flex-direction: column;
  }

  .video-hole {
    position: relative;
    flex: 1;
    display: grid;
    place-items: center;
    /* Deliberately no background: this is the hole mpv shows through. */
  }

  .hint {
    text-align: center;
    letter-spacing: 0.15em;
    color: var(--color-muted);
    font-size: 0.8rem;
    line-height: 1.8;
  }

  .overlay {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    /* Translucent on purpose: an opaque bar would prove nothing about
       compositing, since it would look identical either way. */
    background: color-mix(in srgb, var(--color-surface) 70%, transparent);
    border-top: 1px solid var(--color-primary);
    backdrop-filter: blur(6px);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .path {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-primary);
    border-radius: 0.25rem;
    background: color-mix(in srgb, var(--color-dark) 60%, transparent);
    color: var(--color-main);
    outline: none;
  }

  .btn {
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--color-green);
    border-radius: 0.25rem;
    background: color-mix(in srgb, var(--color-dark) 60%, transparent);
    color: var(--color-green);
    letter-spacing: 0.1em;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .note {
    color: var(--color-muted);
    font-size: 0.75rem;
  }

  .report {
    margin: 0;
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--color-green);
    word-break: break-all;
  }

  .report.failed {
    color: var(--color-error);
  }
</style>
