<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
const paths: Record<string, string> = {
  play: 'm9 5 11 7-11 7V5Z', pause: 'M8 5v14M16 5v14',
  reset: 'M3 10a9 9 0 1 1 1 8M3 4v6h6',
  right: 'M4 12h16m-6-6 6 6-6 6', up: 'M12 20V4m-6 6 6-6 6 6',
  arrow: 'M5 19 19 5M5 5h14v14', chevron: 'm9 5 7 7-7 7',
  sound: 'M11 4 5 9H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  muted: 'M11 4 5 9H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6',
  help: 'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  flag: 'M5 21V3m0 1h14l-3 4 3 4H5',
  clock: 'M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M6 18 18 6',
  leaf: 'M20 4C9 3 3 9 5 16s17 6 15-12ZM5 20 16 9',
  spark: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z',
}
</script>
<template>
  <svg :width="size ?? 20" :height="size ?? 20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.spark" /></svg>
</template>
