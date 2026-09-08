<script lang="ts">
  let {
    torrents,
    selectedTorrentHash = $bindable(),
    onPlay
  } = $props<{
    torrents: any[];
    selectedTorrentHash: string;
    onPlay: () => void;
  }>();
</script>

<div class="mt-6 flex flex-col gap-4">
  <div class="flex flex-col gap-2">
    <label for="quality-select" class="text-primary text-sm font-bold tracking-widest uppercase"
      >Qualidade</label
    >
    <div class="relative w-full">
      <select
        id="quality-select"
        bind:value={selectedTorrentHash}
        class="border-primary/50 focus:border-accent-green bg-surface text-main w-full appearance-none rounded border p-3 pr-10 font-mono text-sm focus:outline-none"
      >
        {#each torrents as torrent}
          <option value={torrent.hash} class="bg-surface text-main">
            {torrent.quality} - {torrent.type} ({torrent.size})
          </option>
        {/each}
      </select>
      <div
        class="text-primary pointer-events-none absolute inset-y-0 right-0 flex items-center px-3"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
        >
      </div>
    </div>
  </div>

  <button
    onclick={onPlay}
    class="group bg-primary/20 hover:bg-primary text-main border-primary font-cyber relative flex w-full items-center justify-center gap-2 border py-4 text-lg tracking-widest uppercase transition-all duration-300 hover:shadow-[0_0_20px_rgba(107,33,168,0.8)]"
  >
    <!-- Cyberpunk border effect -->
    <div
      class="border-accent-green absolute -top-[1px] -left-[1px] h-3 w-3 border-t-2 border-l-2 transition-colors duration-300 group-hover:border-white"
    ></div>
    <div
      class="border-accent-green absolute -right-[1px] -bottom-[1px] h-3 w-3 border-r-2 border-b-2 transition-colors duration-300 group-hover:border-white"
    ></div>

    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg
    >
    Reproduzir
  </button>
</div>
