<script lang="ts">
  let { heading }: { heading: string } = $props();
</script>

<div class="border-primary/30 mb-4 flex items-center justify-between border-b pb-2">
  <h1
    class="text-green font-cyber flex items-center gap-2 text-2xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.5)]"
  >
    <span class="bg-primary inline-block h-5 w-2"></span>
    {heading}
  </h1>
</div>
