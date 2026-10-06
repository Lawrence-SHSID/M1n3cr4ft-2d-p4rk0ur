<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Renderer } from './game/renderer'
import { createGame } from './game/physics'
import type { Level } from '../shared/types'
const props = defineProps<{ loading: boolean; coins: number }>()
const emit = defineEmits<{ singleplayer: []; multiplayer: []; editor: []; levels: []; help: []; shop: [] }>()
const backdrop = ref<HTMLCanvasElement>(), image = ref('')
let renderer: Renderer | null = null, observer: ResizeObserver | undefined
let disposed = false
const scene: Level = { number: -1, length: 12, name: 'Menu parkour', subtitle: '', spawn: { x: 1, y: 9 }, flag: { x: 11.5, y: 8 },
  blocks: [], spikes: [] }
for (const [start, end, top] of [[0, 4, 9], [6, 8, 9], [10, 12, 8]]) for (let x = start!; x < end!; x++) {
  scene.blocks.push({ id: `grass-${x}`, x, y: top!, kind: 'grass', solid: true })
  for (let y = top! + 1; y < top! + 4; y++) scene.blocks.push({ id: `dirt-${x}-${y}`, x, y, kind: 'dirt', solid: true })
}
for (let y = 6; y < 9; y++) scene.blocks.push({ id: `tree-${y}`, x: 1, y, kind: 'wood', solid: false })
for (const [x,y] of [[0,6],[1,6],[2,6],[0,5],[1,5],[2,5],[1,4]]) scene.blocks.push({ id: `leaf-${x}-${y}`, x: x!, y: y!, kind: 'leaf', solid: false })
scene.blocks.push({ id: 'slab', x: 4.6, y: 9.5, width: 1.5, height: .5, kind: 'stone', solid: true, motion: { axis: 'y', range: .6, speed: 1, phase: 0 } })
const pose = createGame(scene)
pose.player.x = 8.25; pose.player.y = 6.6; pose.player.vx = 6.5; pose.player.vy = -2; pose.player.grounded = false; pose.player.sprinting = true
function draw() { if (!renderer || !backdrop.value) return; renderer.resize(); renderer.draw(pose, 1000); image.value = backdrop.value.toDataURL('image/png') }
onMounted(async () => {
  renderer = new Renderer(backdrop.value!)
  try { await renderer.load() } catch { /* The renderer also paints fallback blocks. */ }
  if (disposed || !backdrop.value) return
  draw(); observer = new ResizeObserver(draw); observer.observe(backdrop.value!)
})
onUnmounted(() => { disposed = true; observer?.disconnect() })
</script>
<template>
  <section class="home-menu" aria-label="Main menu">
    <canvas ref="backdrop" class="menu-scene" aria-hidden="true"></canvas>
    <img v-if="image" class="menu-scene menu-image" :src="image" alt="Steve jumping between floating islands" />
    <div class="menu-shade"></div>
    <div class="menu-content"><span class="menu-eyebrow">A WHOLE WORLD ABOVE THE CLOUDS</span><h1>skybound<span>.</span></h1><p>One more block. One bigger adventure.</p>
      <div class="menu-buttons"><button class="menu-play" @click="emit('singleplayer')" :disabled="props.loading"><span>Singleplayer</span><span>→</span></button><button @click="emit('multiplayer')" :disabled="props.loading"><span>Multiplayer</span><span>↗</span></button><div class="menu-build"><button @click="emit('editor')"><span>✎</span>Level editor</button><button @click="emit('levels')"><span>▦</span>My levels</button></div><button class="menu-help" @click="emit('help')">How to play <span>?</span></button></div>
      <button class="menu-shop-button" @click="emit('shop')">● {{ props.coins }} coins · Shop →</button>
      <span class="menu-caption">{{ props.loading ? 'Getting your adventure ready…' : 'Play a course. Or build a world of your own.' }}</span>
    </div><span class="menu-corner">SMALL BLOCKS. BIG ADVENTURES.</span>
  </section>
</template>
