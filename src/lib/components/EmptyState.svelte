<script lang="ts">
  let { message } = $props<{ message: string }>();
</script>

<div
  class="border-primary/30 bg-surface/40 flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-sm border border-dashed p-6 text-center"
>
  <span class="text-muted font-cyber text-sm tracking-widest uppercase">{message}</span>
</div>
