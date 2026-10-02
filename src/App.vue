<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'
import { generateLevel } from '../shared/levels'
import type { CharacterId, GameMode, GameSession, GameStatus, Level } from '../shared/types'
import { createSession, startSession, stepSession, retrySession } from './game/session'
import { KeyboardControls } from './game/controls'
import { Renderer } from './game/renderer'
import { GameAudio } from './game/audio'

interface RunnerView { id: CharacterId; name: string; status: GameStatus; progress: number; checkpoint: number; deaths: number }
const canvas = ref<HTMLCanvasElement>()
const alexCanvas = ref<HTMLCanvasElement>()
const loading = ref(true), loadError = ref(''), apiConnected = ref(false)
const helpOpen = ref(false), sound = ref(false), attempts = ref(1)
const mode = ref<GameMode>('solo')
const checkpointNotice = ref('')
const highestLevel = ref(Number(localStorage.getItem('skybound.highest')) || 1)
const view = ref({ status: 'ready' as GameStatus, level: 1, length: 10, name: 'First flight', subtitle: '', elapsed: 0, progress: 0, slime: false, deathReason: '', mode: 'walk', checkpoint: 0, checkpointTotal: 0, flight: false, runners: [] as RunnerView[] })
const steveView = computed(() => view.value.runners.find(run => run.id === 'steve'))
const alexView = computed(() => view.value.runners.find(run => run.id === 'alex'))
const levelLabel = computed(() => String(view.value.level).padStart(2, '0'))
const featuredCourses = [...Array.from({ length: 12 }, (_, index) => index + 1), 20, 30]
const courseOptions = ref(featuredCourses.map(number => {
  const level = generateLevel(number)
  return { number: level.number, name: level.name, length: level.length }
}))
const timer = computed(() => `${String(Math.floor(view.value.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(view.value.elapsed % 60)).padStart(2, '0')}`)
const blocks = [
  { kind: 'grass', name: 'Grass', description: 'The surface of your floating islands.' },
  { kind: 'dirt', name: 'Dirt', description: 'The earthy foundation below the grass.' },
  { kind: 'stone', name: 'Stone', description: 'Half-height slabs travel sideways or up and down. Hop on and ride.' },
  { kind: 'wood', name: 'Wood', description: 'Tree trunks, growing above the clouds.' },
  { kind: 'leaf', name: 'Leaves', description: 'A little green for your sky-high adventure.' },
  { kind: 'slime', name: 'Slime', description: 'Jump five blocks high from this bouncy block.' },
]
const selectedBlock = ref('slime')
const blockDescription = computed(() => view.value.flight && selectedBlock.value === 'stone' ? 'Stone gates. Steer clear while you glide.' : blocks.find(b => b.kind === selectedBlock.value)?.description)
let session: GameSession | null = null
let initialPositions: Partial<Record<CharacterId, number>> = {}
function freshSession(level: Level, gameMode: GameMode) {
  const created = createSession(level, gameMode)
  initialPositions = Object.fromEntries(created.runs.map(run => [run.id, run.state.player.x]))
  return created
}
let controls = new KeyboardControls('solo')
let renderer: Renderer | null = null, alexRenderer: Renderer | null = null
let frame = 0, previousTime = 0, accumulator = 0, noticeRemaining = 0
let resizeObserver: ResizeObserver | undefined
let pausedForHelp = false
const audio = new GameAudio()

function sync() {
  if (!session) return
  const first = session.runs[0]!, p = first.state.player
  const runners: RunnerView[] = session.runs.map(run => ({
    id: run.id, name: run.id === 'alex' ? 'Alex' : 'Steve', status: run.state.status,
    progress: run.state.status === 'won' ? 100 : Math.max(0, Math.min(100, ((run.state.player.x - (initialPositions[run.id] ?? session!.level.spawn.x)) / (session!.level.flag.x - (initialPositions[run.id] ?? session!.level.spawn.x))) * 100)),
    checkpoint: run.checkpoint ? (session!.level.checkpoints ?? []).findIndex(cp => cp.id === run.checkpoint!.id) + 1 : 0,
    deaths: run.deaths,
  }))
  view.value = { status: session.status, level: session.level.number, length: session.level.length, name: session.level.name, subtitle: session.level.subtitle, elapsed: session.elapsed,
    progress: Math.min(...runners.map(run => run.progress)), slime: p.groundKind === 'slime', deathReason: first.state.deathReason ?? '', mode: session.level.kind === 'elytra' ? p.vx > 6 ? 'boost' : 'glide' : p.sneaking ? 'sneak' : p.sprinting ? 'sprint' : 'walk',
    checkpoint: runners[0]!.checkpoint, checkpointTotal: session.level.checkpoints?.length ?? 0, flight: session.level.kind === 'elytra', runners }
}
function clearInput() { controls.clear() }
function focusGame() { canvas.value?.focus({ preventScroll: true }) }
function resetCameras() { renderer?.resetCamera(); alexRenderer?.resetCamera() }
async function loadLevel(number: number) {
  loading.value = true; clearInput(); checkpointNotice.value = ''
  if (session?.status === 'playing') session.status = 'paused'
  let level = generateLevel(number)
  try {
    const response = await fetch(`/api/levels/${number}`, { signal: AbortSignal.timeout(4000) })
    if (!response.ok) throw new Error('Level service unavailable')
    level = await response.json(); apiConnected.value = true
  } catch { apiConnected.value = false }
  session = freshSession(level, mode.value); resetCameras(); attempts.value = 1
  courseOptions.value = courseOptions.value.filter(course => featuredCourses.includes(course.number))
  if (!featuredCourses.includes(number)) courseOptions.value.push({ number, name: level.name, length: level.length })
  sync(); loading.value = false
}
function chooseCourse(event: Event) { void loadLevel(Number((event.target as HTMLSelectElement).value)) }
async function setMode(value: GameMode) {
  if (mode.value === value || !session || loading.value) return
  mode.value = value; controls = new KeyboardControls(value)
  session = freshSession(session.level, value); attempts.value = 1; checkpointNotice.value = ''; resetCameras(); sync()
  await nextTick(); renderer?.resize(); alexRenderer?.resize()
}
function play() {
  if (!session || loading.value || helpOpen.value) return
  const ready = session.status === 'ready'
  startSession(session); if (ready) audio.play('start')
  sync(); focusGame()
}
function retry() {
  if (!session) return
  attempts.value++; retrySession(session); clearInput(); resetCameras(); sync(); focusGame()
}
function restartCourse() {
  if (!session) return
  session = freshSession(session.level, mode.value); attempts.value = 1; checkpointNotice.value = ''; clearInput(); resetCameras(); play()
}
function pause() {
  if (!session || loading.value) return
  if (session.status === 'playing') { session.status = 'paused'; clearInput() }
  else if (session.status === 'paused') { startSession(session); focusGame() }
  sync()
}
async function nextLevel() { if (view.value.level < 1000) { await loadLevel(view.value.level + 1); play() } }
function openHelp() { pausedForHelp = session?.status === 'playing'; if (pausedForHelp) pause(); helpOpen.value = true; clearInput() }
function closeHelp() { helpOpen.value = false; if (pausedForHelp && session?.status === 'paused') { startSession(session); sync() }; pausedForHelp = false; focusGame() }
function toggleSound() { sound.value = !sound.value; audio.enabled = sound.value; if (sound.value) audio.play('start') }
function keydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) return
  if (event.code === 'Escape') { event.preventDefault(); helpOpen.value ? closeHelp() : pause(); return }
  if (helpOpen.value || loading.value) return
  if (event.code === 'KeyR' && !event.repeat) { event.preventDefault(); retry(); return }
  if (event.code === 'Space') { if (event.target === canvas.value || event.target === alexCanvas.value) event.preventDefault(); return }
  const actor = controls.press(event.code, event.repeat, performance.now())
  if (!actor) return
  event.preventDefault(); if (session?.status === 'ready') play()
}
function keyup(event: KeyboardEvent) { controls.release(event.code) }
function touch(action: string, event: PointerEvent, down: boolean) {
  event.preventDefault()
  const code = ({ left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', sneak: 'ArrowDown' } as Record<string, string>)[action]!
  if (down) { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); controls.press(code); if (session?.status === 'ready') play() }
  else controls.release(code)
}
function blur() { clearInput(); if (session?.status === 'playing') { session.status = 'paused'; sync() } }
function animate(now: number) {
  const delta = previousTime ? Math.min((now - previousTime) / 1000, .1) : 0
  previousTime = now; accumulator += delta
  if (noticeRemaining > 0) { noticeRemaining -= delta; if (noticeRemaining <= 0) checkpointNotice.value = '' }
  if (session) {
    const oldStatus = session.status
    const before = session.runs.map(run => ({ id: run.id, jumps: run.state.jumps, deaths: run.deaths, slime: run.state.player.groundKind === 'slime', checkpoint: run.checkpoint?.id }))
    while (accumulator >= 1 / 120) { stepSession(session, controls.inputs(), 1 / 120); accumulator -= 1 / 120 }
    for (const run of session.runs) {
      const previous = before.find(item => item.id === run.id)!
      if (run.state.jumps > previous.jumps) audio.play(previous.slime ? 'slime' : 'jump')
      if (run.deaths > previous.deaths) { audio.play('dead'); if (mode.value === 'solo') clearInput() }
      if (run.checkpoint?.id && run.checkpoint.id !== previous.checkpoint) {
        checkpointNotice.value = `${run.id === 'alex' ? 'Alex' : 'Steve'} saved checkpoint ${(session.level.checkpoints ?? []).findIndex(cp => cp.id === run.checkpoint!.id) + 1}`
        noticeRemaining = 3; audio.play('start')
      }
    }
    if (session.status === 'won' && oldStatus !== 'won') {
      audio.play('win'); clearInput(); highestLevel.value = Math.max(highestLevel.value, Math.min(1000, session.level.number + 1))
      localStorage.setItem('skybound.highest', String(highestLevel.value))
    }
    const steve = session.runs[0]!
    renderer?.draw(steve.state, now, { character: 'steve', companions: session.runs.filter(run => run.id !== 'steve'), checkpointId: steve.checkpoint?.id, worldTime: session.time, active: session.status === 'playing' })
    const alex = session.runs.find(run => run.id === 'alex')
    if (mode.value === 'duo' && alex) alexRenderer?.draw(alex.state, now, { character: 'alex', companions: [steve], checkpointId: alex.checkpoint?.id, worldTime: session.time, active: session.status === 'playing' })
    sync()
  } else accumulator = 0
  frame = requestAnimationFrame(animate)
}
onMounted(async () => {
  renderer = new Renderer(canvas.value!); alexRenderer = new Renderer(alexCanvas.value!)
  resizeObserver = new ResizeObserver(() => { renderer?.resize(); if (mode.value === 'duo') alexRenderer?.resize() })
  resizeObserver.observe(canvas.value!); resizeObserver.observe(alexCanvas.value!)
  try { await Promise.all([renderer.load(), alexRenderer.load()]) } catch { loadError.value = 'Some block textures could not load. Refresh to try again.' }
  renderer.resize(); await loadLevel(1); frame = requestAnimationFrame(animate)
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur)
})
onUnmounted(() => { cancelAnimationFrame(frame); resizeObserver?.disconnect(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur) })
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <a class="brand" href="#" aria-label="Skybound home"><span class="brand-cube"><img src="/textures/grass.png" alt="" /></span>skybound<span class="brand-dot">.</span></a>
      <nav aria-label="Main navigation"><a class="nav-active" href="#play">Let's play<span></span></a><button @click="openHelp">How to play <Icon name="arrow" :size="13" /></button></nav>
      <div class="header-right"><span class="little-label"><span class="status-dot"></span>A little escape, above the clouds</span><button class="sound-button" @click="toggleSound" :aria-label="sound ? 'Mute sound' : 'Enable sound'" :title="sound ? 'Mute sound' : 'Enable sound'"><Icon :name="sound ? 'sound' : 'muted'" :size="19" /></button></div>
    </header>

    <main id="play">
      <section class="intro-row">
        <div><div class="eyebrow"><span class="tiny-spark">✦</span> THE SKY IS YOUR PLAYGROUND</div><h1>One block at a time<span>.</span></h1><p>A little courage. A good jump. A whole world above the clouds.</p></div>
        <div class="adventure-badge"><Icon name="leaf" :size="17" /><span>Small blocks.<br /><strong>Big adventures.</strong></span></div>
      </section>

      <div class="play-options"><div class="mode-toggle" aria-label="Game mode"><button :class="{ active: mode === 'solo' }" :aria-pressed="mode === 'solo'" @click="setMode('solo')" :disabled="loading">Solo adventure</button><button :class="{ active: mode === 'duo' }" :aria-pressed="mode === 'duo'" @click="setMode('duo')" :disabled="loading">Two players</button></div><span>{{ mode === 'duo' ? 'Local co-op · one keyboard, two adventurers' : view.flight ? 'Elytra flight · hold ↑ to lift, → for speed' : 'Double-tap left or right to sprint' }}</span></div>
      <section :class="['game-card', { flight: view.flight }]" aria-label="Skybound game">
        <div class="game-topbar">
          <div class="level-info course-picker"><span class="level-number">{{ levelLabel }}</span><div><span class="level-kicker">{{ view.flight ? 'ELYTRA' : 'LEVEL' }} {{ levelLabel }} <span>·</span> {{ view.length }} BLOCKS</span><h2>{{ view.name }} <Icon name="chevron" :size="12" /></h2></div><select :value="view.level" @change="chooseCourse" aria-label="Choose a course" title="Choose a course" :disabled="loading"><option v-for="course in courseOptions" :key="course.number" :value="course.number">{{ String(course.number).padStart(2, '0') }} / {{ course.name }} · {{ course.length }} blocks</option></select></div>
          <div class="game-actions"><span class="timer" aria-label="Time played"><Icon name="clock" :size="16" />{{ timer }}</span><span class="toolbar-divider"></span><button class="icon-button" @click="restartCourse" aria-label="Restart course" title="Restart course from the beginning" :disabled="loading"><Icon name="reset" :size="18" /></button><button class="icon-button" @click="pause" :aria-label="view.status === 'paused' ? 'Resume game' : 'Pause game'" title="Pause / resume (Esc)" :disabled="!['playing', 'paused'].includes(view.status)"><Icon :name="view.status === 'paused' ? 'play' : 'pause'" :size="18" /></button></div>
        </div>

        <div :class="['canvas-wrap', { duo: mode === 'duo' }]">
          <div class="player-viewport"><span v-if="mode === 'duo'" class="pane-label steve"><span></span>STEVE <span class="pane-keys">{{ view.flight ? '↑ LIFT · → BOOST' : '↑ ↓ ← →' }}</span></span><canvas ref="canvas" tabindex="0" :aria-label="view.flight ? 'Steve elytra flight. Hold up arrow to rise, right arrow to speed up. Release to descend.' : 'Steve parkour view. Left and right move, up jumps, down crouches. Double-tap a direction to sprint.'" @pointerdown="focusGame"></canvas><div v-if="mode === 'duo' && steveView?.status === 'dead'" class="runner-message">Steve is respawning{{ steveView.checkpoint ? ` at checkpoint ${steveView.checkpoint}` : ' at the start' }}…</div><div v-else-if="mode === 'duo' && steveView?.status === 'won' && view.status === 'playing'" class="runner-message finished"><Icon name="check" :size="15" />Steve reached the flag. Go, Alex!</div></div>
          <div v-show="mode === 'duo'" class="player-viewport"><span class="pane-label alex"><span></span>ALEX <span class="pane-keys">{{ view.flight ? 'W LIFT · D BOOST' : 'W A S D' }}</span></span><canvas ref="alexCanvas" tabindex="0" :aria-label="view.flight ? 'Alex elytra flight. Hold W to rise, D to speed up. Release to descend.' : 'Alex parkour view. A and D move, W jumps, S crouches. Double-tap A or D to sprint.'" @pointerdown="alexCanvas?.focus({ preventScroll: true })"></canvas><div v-if="alexView?.status === 'dead'" class="runner-message">Alex is respawning{{ alexView.checkpoint ? ` at checkpoint ${alexView.checkpoint}` : ' at the start' }}…</div><div v-else-if="alexView?.status === 'won' && view.status === 'playing'" class="runner-message finished"><Icon name="check" :size="15" />Alex reached the flag. Go, Steve!</div><span v-if="view.status === 'playing'" class="pane-guide">{{ view.flight ? 'Hold W to lift · hold D to boost · release to dive' : 'W jump · S crouch · double-tap A / D to sprint' }}</span></div>
          <div :class="['stage-tag', { 'duo-hint': mode === 'duo' }]"><span class="status-dot"></span>{{ view.status === 'ready' ? mode === 'duo' ? 'Same sky. Two adventurers. Reach the flag together.' : view.subtitle : view.status === 'playing' ? view.flight ? 'Hold ↑ to lift. Release to descend. → boosts speed.' : view.slime ? 'Slime underfoot. Jump 5 blocks!' : view.mode === 'sneak' ? 'Slow steps. Safe edges.' : view.mode === 'sprint' ? 'Pick up speed. Jump the gap!' : 'Keep going. You’ve got this.' : view.status === 'won' ? 'A little leap, a big win.' : view.status === 'dead' ? 'Every fall is a fresh start.' : 'Take a little breather.' }}</div>
          <div v-if="checkpointNotice" class="checkpoint-notice"><Icon name="flag" :size="13" />{{ checkpointNotice }}</div>
          <div v-if="loading" class="game-overlay"><div class="overlay-card"><span class="loading-cube"></span><h3>Building your little adventure…</h3></div></div>
          <div v-else-if="['dead', 'won', 'paused'].includes(view.status)" class="game-overlay">
            <div class="overlay-card" :class="view.status">
              <span class="overlay-symbol"><Icon :name="view.status === 'won' ? 'flag' : view.status === 'dead' ? 'reset' : 'pause'" :size="30" /></span>
              <span class="eyebrow">{{ view.status === 'won' ? 'FLAG FOUND. FEELING GOOD.' : view.status === 'dead' ? 'A LITTLE BUMP IN THE ADVENTURE' : 'NO RUSH. THE SKY CAN WAIT.' }}</span>
              <h3>{{ view.status === 'won' ? mode === 'duo' ? 'You both made it!' : 'You made the leap!' : view.status === 'dead' ? 'Let’s try that again.' : 'Taking a breather?' }}</h3>
              <p>{{ view.status === 'won' ? `Level ${view.level} cleared in ${timer}. The next course is ${view.length + 5} blocks long.` : view.status === 'dead' ? view.flight ? 'Fly between the stone gates. Hold ↑ to lift; release to descend.' : view.deathReason === 'spike' ? 'Those spikes are sharp. Jump over them!' : 'Mind the gaps — it’s a long way down.' : 'Your adventure is right where you left it.' }}</p>
              <button class="primary-button" @click="view.status === 'won' ? view.level === 1000 ? retry() : nextLevel() : view.status === 'dead' ? retry() : play()">{{ view.status === 'won' ? view.level === 1000 ? 'Play again' : 'Next adventure' : view.status === 'dead' ? view.checkpoint ? 'Back to checkpoint' : 'Try again' : 'Keep going' }}<Icon :name="view.status === 'dead' ? 'reset' : 'right'" :size="18" /></button>
              <span v-if="view.status === 'dead'" class="overlay-footnote">Attempt {{ attempts }} · {{ view.checkpoint ? `Checkpoint ${view.checkpoint} saved` : 'Press R to try again' }}</span>
            </div>
          </div>
          <div v-if="view.status === 'ready' && !loading" class="start-prompt"><div><span class="start-star">✦</span><span>{{ mode === 'duo' ? 'A little adventure, together.' : 'Your adventure starts here.' }}</span></div><button class="primary-button" @click="play">{{ view.flight ? 'Let’s fly' : 'Let’s jump' }} <Icon name="right" :size="17" /></button></div>
          <div v-else-if="view.status === 'playing'" class="in-game-hint"><span v-if="view.flight">Hold ↑ to lift · → to boost · release to descend</span><span v-else-if="view.slime">✦ A little extra bounce. Press ↑{{ mode === 'solo' ? ' or W' : '' }}.</span><span v-else>Double-tap ← / → to sprint <span class="hint-dot">·</span> ↑ jump <span class="hint-dot">·</span> ↓ crouch</span></div>
          <div class="course-length"><Icon name="flag" :size="14" /><span>{{ view.length }} blocks of possibility</span></div>
        </div>

        <div class="game-bottom-bar"><div class="course-progress"><Icon name="flag" :size="15" /><div class="progress-track"><div :style="{ width: `${view.progress}%` }"></div></div><span>{{ Math.floor(view.progress) }}%</span></div><div v-if="mode === 'duo'" class="runner-progress"><span v-for="run in view.runners" :key="run.id" :class="run.id">{{ run.name }} {{ run.status === 'won' ? '✓' : `${Math.floor(run.progress)}%` }}<small v-if="run.checkpoint"> · CP {{ run.checkpoint }}</small></span></div><span v-else class="attempt-label">{{ view.status === 'won' ? 'Nicely done, adventurer.' : `Attempt ${String(attempts).padStart(2, '0')}` }}<span v-if="view.checkpointTotal"> · CP {{ view.checkpoint }} / {{ view.checkpointTotal }}</span></span><span v-if="mode === 'solo'" class="jump-status"><span :class="{ 'slime-dot': view.slime }" class="status-dot"></span>{{ view.flight ? view.mode === 'boost' ? 'Elytra · boosted flight' : 'Elytra · gliding' : view.slime ? '5-block slime jump' : view.mode === 'sneak' ? 'Sneaking · safe edges' : view.mode === 'sprint' ? 'Sprinting · 4-block gaps' : 'Walking · 1-block jump' }}</span></div>
        <div v-if="loadError" class="asset-error" role="alert">{{ loadError }}</div>
      </section>

      <div v-if="mode === 'solo' && !view.flight" class="touch-controls" aria-label="Touch controls"><div><button aria-label="Move left; double-tap to sprint" @pointerdown="touch('left', $event, true)" @pointerup="touch('left', $event, false)" @pointercancel="touch('left', $event, false)">←</button><button aria-label="Move right; double-tap to sprint" @pointerdown="touch('right', $event, true)" @pointerup="touch('right', $event, false)" @pointercancel="touch('right', $event, false)">→</button></div><button aria-label="Crouch" @pointerdown="touch('sneak', $event, true)" @pointerup="touch('sneak', $event, false)" @pointercancel="touch('sneak', $event, false)">↓</button><button class="touch-jump" aria-label="Jump" @pointerdown="touch('jump', $event, true)" @pointerup="touch('jump', $event, false)" @pointercancel="touch('jump', $event, false)">↑ <span>Jump</span></button></div>
      <div v-if="view.flight && mode === 'solo'" class="flight-controls"><span>Glide through the gates.</span><button @pointerdown="touch('jump', $event, true)" @pointerup="touch('jump', $event, false)" @pointercancel="touch('jump', $event, false)" aria-label="Hold to fly upward">↑ <span>Hold to lift</span></button><button @pointerdown="touch('right', $event, true)" @pointerup="touch('right', $event, false)" @pointercancel="touch('right', $event, false)" aria-label="Hold to fly faster">→ <span>Hold to boost</span></button><span>Release lift to descend.</span></div>
      <div v-if="view.checkpointTotal" class="checkpoint-help"><Icon name="flag" :size="14" /><span>{{ view.checkpointTotal }} cyan checkpoints on this course. {{ view.flight ? 'Fly through a ring' : 'Land beside a flag' }} to save your place{{ mode === 'duo' ? ' — each player saves separately' : '' }}. R retries from your saved flag.</span></div>

      <section class="field-notes" aria-label="Game guide">
        <article class="note controls-note"><div class="note-heading"><span>01 / BRING A FRIEND ALONG</span><Icon name="arrow" :size="15" /></div><h3>{{ mode === 'duo' ? 'Steve & Alex. Same sky.' : view.flight ? 'Spread your wings.' : 'Walk. Sprint. Crouch.' }}</h3><div class="key-groups"><div><div class="keys"><kbd>↑</kbd><kbd v-if="!view.flight">←</kbd><kbd v-if="!view.flight">↓</kbd><kbd>→</kbd></div><span class="key-caption">Steve · {{ view.flight ? '↑ lift · → speed' : 'Arrow keys' }}</span></div><div><div class="keys"><kbd>W</kbd><kbd v-if="!view.flight">A</kbd><kbd v-if="!view.flight">S</kbd><kbd>D</kbd></div><span class="key-caption">{{ mode === 'duo' ? view.flight ? 'Alex · W lift · D speed' : 'Alex · WASD' : 'Or WASD in solo' }}</span></div></div><div v-if="view.flight" class="modifier-keys"><span>Hold lift to rise. Release to descend.</span></div><div v-else class="modifier-keys"><span>Double-tap a direction to sprint</span><span><kbd>↓ / S</kbd> crouch</span></div></article>
        <article class="note blocks-note"><div class="note-heading"><span>02 / YOUR LITTLE WORLD</span><span class="pixel-square"></span></div><h3>Meet the building blocks.</h3><div class="block-list"><button v-for="block in blocks" :key="block.kind" :class="['block-choice', { selected: selectedBlock === block.kind }]" @click="selectedBlock = block.kind" :aria-pressed="selectedBlock === block.kind" :title="view.flight && block.kind === 'stone' ? 'Stone gates are flight obstacles.' : block.description"><span :class="['block-thumb', block.kind]"><img v-if="!['wood', 'leaf'].includes(block.kind)" :src="`/textures/${block.kind}.png`" alt="" /></span><span>{{ block.name }}</span></button></div><p class="block-description">{{ blockDescription }}</p></article>
        <article class="note goal-note"><div class="note-heading"><span>03 / EYES ON THE PRIZE</span><Icon name="flag" :size="16" /></div><div class="goal-heading"><h3>Follow the red flag.</h3><span class="mini-flag">⚑</span></div><p>{{ mode === 'duo' ? 'Both players must reach the flag.' : view.flight ? 'Glide between the stone gates.' : 'Sprint across gaps up to 4 blocks.' }}<br />{{ view.flight ? 'Watch the gates. Keep your wings clear.' : 'Every 10th course is an elytra flight.' }}</p><button class="text-button" @click="openHelp">A few tips for the trip <Icon name="right" :size="14" /></button></article>
      </section>
      <footer><span>A blocky little escape. Made for the joy of the jump.</span><span><span class="status-dot"></span>{{ apiConnected ? 'Adventure service connected' : 'Playing locally' }} <span class="footer-dot">·</span> {{ highestLevel > 1 ? `Best adventure: level ${highestLevel - 1}` : 'No building. Just exploring.' }}</span></footer>
    </main>

    <div v-if="helpOpen" class="modal-backdrop" @click.self="closeHelp"><section class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button class="modal-close icon-button" @click="closeHelp" aria-label="Close how to play"><Icon name="close" /></button><span class="eyebrow">A FIELD GUIDE FOR LITTLE ADVENTURERS</span><h2 id="help-title">A few tips before you leap.</h2><p class="help-intro">{{ mode === 'duo' ? 'Get Steve and Alex to the red flag, together.' : 'Your only job? Get Steve to the red flag.' }}</p><div class="help-row"><span>01</span><div><h3>Walk, then jump.</h3><p>Steve uses ← / → to move, ↑ to jump, and ↓ to crouch. In two-player mode Alex uses A / D to move, W to jump, and S to crouch. In solo, either set of keys controls Steve. Double-tap and hold left or right to sprint; normal sprint jumps clear gaps up to four blocks.</p></div></div><div class="help-row"><span>02</span><div><h3>Slime gives you a little lift.</h3><p>Stand on a green slime block and jump to reach five blocks high. Use it to reach the higher islands.</p></div></div><div class="help-row"><span>03</span><div><h3>Catch a ride. Mind your landing.</h3><p>Stone slabs carry you sideways or up and down. Hold ↓ for Steve or S for Alex to crouch: move slowly and stay safely on platform edges. You can still jump while crouching. Spikes and falling end that player’s attempt. In co-op they respawn while their friend keeps going.</p></div></div><div class="help-row"><span>04</span><div><h3>Every tenth course, take flight.</h3><p>Levels 10, 20, 30, and every following multiple of 10 are elytra flights. Steve glides forward automatically: hold ↑ to rise, hold → to fly faster, and release ↑ to descend. In co-op, Alex uses W to rise and D to boost. Fly between the stone gates and stay inside the flight corridor.</p></div></div><div class="help-row"><span>05</span><div><h3>Leave the world as you found it.</h3><p>On courses longer than 45 blocks, save your place at cyan checkpoint flags — fly through the rings in elytra courses. R retries from saved checkpoints; the reset button starts the whole course again. In co-op, both players must finish. Choose a course from the level title. Esc pauses both players. Blocks cannot be edited.</p></div></div><button class="primary-button" @click="closeHelp">Got it. Let’s go <Icon name="right" :size="18" /></button></section></div>
  </div>
</template>
