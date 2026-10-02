<script lang="ts">
  let { label }: { label: string } = $props();
</script>

<div class="flex h-full min-h-[400px] items-center justify-center">
  <div class="flex flex-col items-center gap-4">
    <div class="relative h-16 w-16">
      <div
        class="border-t-green border-b-primary absolute inset-0 animate-spin rounded-full border-4 border-transparent"
      ></div>
      <div
        class="border-l-primary border-r-green absolute inset-2 animate-[spin_1.5s_linear_reverse] rounded-full border-4 border-transparent"
      ></div>
    </div>
    <div
      class="text-green font-cyber animate-pulse text-xl tracking-[0.3em] uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.8)]"
    >
      {label}
    </div>
  </div>
</div>
