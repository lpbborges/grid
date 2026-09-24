<script lang="ts">
  // Inline copy of static/logo.svg, so the hover animation can reach its parts.
  // The animation is driven by the nearest `group` ancestor (the header link),
  // so hovering the "Grid" label next to the mark animates it too.
  let { class: className = '' }: { class?: string } = $props();

  const uid = $props.id();
  const ids = {
    glow: `${uid}-glow`,
    scan: `${uid}-scan`,
    band: (i: number) => `${uid}-band-${i}`
  };

  const G_PATH =
    'M 416 150 A 58 58 0 0 0 358 92 L 154 92 A 58 58 0 0 0 96 150 L 96 362 A 58 58 0 0 0 154 420 L 358 420 A 58 58 0 0 0 416 362 L 416 266';
  // Must match the translateY of the `logo-scan` keyframes in app.css, or the
  // scrolling scanlines jump at the end of every loop.
  const SCANLINE_PITCH = 17;
  // One extra line above the mark so the scrolled-in gap is never visible.
  const scanlines = Array.from({ length: 24 }, (_, i) => 62 + i * SCANLINE_PITCH);
  // Horizontal slices that flash out of place while hovered.
  const glitchBands = [
    { y: 176, height: 26, shift: 20, delay: '0s' },
    { y: 300, height: 20, shift: -16, delay: '0.55s' }
  ];
</script>

{#snippet mark()}
  <g mask="url(#{ids.scan})">
    <g
      class="stroke-orange motion-safe:group-hover:animate-logo-chroma"
      transform="translate(-7 0)"
      opacity=".85"
    >
      <path d={G_PATH} fill="none" stroke-width="40" stroke-linecap="round" />
    </g>
    <g filter="url(#{ids.glow})">
      <path
        d={G_PATH}
        class="stroke-primary"
        fill="none"
        stroke-width="40"
        stroke-linecap="round"
      />
    </g>
  </g>
  <g filter="url(#{ids.glow})">
    <polygon
      points="214,186 214,326 338,256"
      class="fill-green stroke-green"
      stroke-width="18"
      stroke-linejoin="round"
    />
  </g>
{/snippet}

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 512 512"
  role="img"
  aria-label="Grid Logo"
  class={className}
>
  <defs>
    <filter id={ids.glow} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="7" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <mask id={ids.scan} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="white" />
      <g data-testid="logo-scanlines" class="motion-safe:group-hover:animate-logo-scan">
        {#each scanlines as y (y)}
          <rect x="0" {y} width="512" height="5" fill="black" />
        {/each}
      </g>
    </mask>
    {#each glitchBands as band, i (band.y)}
      <clipPath id={ids.band(i)}>
        <rect x="0" y={band.y} width="512" height={band.height} />
      </clipPath>
    {/each}
  </defs>

  {@render mark()}

  {#each glitchBands as band, i (band.y)}
    <g
      data-testid="logo-glitch"
      class="motion-safe:group-hover:animate-logo-glitch opacity-0"
      style:animation-delay={band.delay}
    >
      <rect class="fill-dark" x="60" y={band.y} width="392" height={band.height} />
      <g clip-path="url(#{ids.band(i)})">
        <g transform="translate({band.shift} 0)">{@render mark()}</g>
      </g>
    </g>
  {/each}
</svg>
