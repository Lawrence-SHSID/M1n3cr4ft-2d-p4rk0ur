<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'
import HomeMenu from './HomeMenu.vue'
import SkinPicker from './SkinPicker.vue'
import ShopPanel from './ShopPanel.vue'
import { SHOP, emptyWallet, readWallet, saveWallet, awardLevel, buyItem, consumeItem, rewardForLevel, type Wallet, type ItemId } from './game/economy'
import { prepareItem, snappedTarget, type ItemTarget } from './game/items'
import { readSkin } from './game/appearance'
import LevelEditor from './editor/LevelEditor.vue'
import { clone, compileLevel, newLevel, readLibrary, saveLibrary, playabilityIssues, type CustomLevel } from './editor/levels'
import { generateLevel } from '../shared/levels'
import type { CharacterId, GameMode, GameSession, GameStatus, Level, MultiplayerMode, RaceResult, SkinId } from '../shared/types'
import { createSession, startSession, stepSession, retrySession } from './game/session'
import { KeyboardControls } from './game/controls'
import { Renderer } from './game/renderer'
import { GameAudio } from './game/audio'

interface RunnerView { id: CharacterId; name: string; status: GameStatus; progress: number; checkpoint: number; deaths: number; hearts: number; horse: boolean }
const canvas = ref<HTMLCanvasElement>()
const screen = ref<'menu' | 'game' | 'editor' | 'levels' | 'shop'>('menu')
const wallet = ref(emptyWallet()), walletError = ref(''), shopMessage = ref(''), rewardMessage = ref(''), itemMessage = ref('')
try { wallet.value = readWallet(localStorage) } catch { walletError.value = 'Could not read saved coins. Your saved data has been kept.' }
const selectedItem = ref<ItemId | null>(null), itemPlayer = ref<CharacterId>('steve'), itemAim = ref<ItemTarget | null>(null)
let shopReturn: typeof screen.value = 'menu', resumeAfterShop = false
const library = readLibrary(localStorage)
const myLevels = ref(library.levels), libraryError = ref(library.error), saveMessage = ref('')
const editorDraft = ref<CustomLevel | null>(null), activeCustom = ref<string | null>(null)
const removedLevel = ref<CustomLevel | null>(null)
const loading = ref(true), loadError = ref(''), apiConnected = ref(false)
const helpOpen = ref(false), sound = ref(false), attempts = ref(1)
const mode = ref<GameMode>('solo')
const playerSkins = ref({ steve: readSkin(localStorage.getItem('skybound.skin.steve'), 'steve'), alex: readSkin(localStorage.getItem('skybound.skin.alex'), 'alex') })
const multiplayerMode = ref<MultiplayerMode>(localStorage.getItem('skybound.multiplayerMode') === 'pk' ? 'pk' : 'teamwork')
const isPK = computed(() => mode.value === 'duo' && multiplayerMode.value === 'pk')
const multiplayerGoal = computed(() => isPK.value ? 'First to the flag wins. Same starting line.' : 'Work together. Both players must reach the flag.')
const autoSprint = ref(localStorage.getItem('skybound.autoSprint') === 'true')
const checkpointNotice = ref('')
const highestLevel = ref(Number(localStorage.getItem('skybound.highest')) || 1)
const view = ref({ status: 'ready' as GameStatus, level: 1, length: 10, name: 'First flight', subtitle: '', elapsed: 0, progress: 0, slime: false, deathReason: '', mode: 'walk', checkpoint: 0, checkpointTotal: 0, flight: false, nether: false, end: false, vertical: false, bonus: false, skeletonHearts: 0, result: null as RaceResult, runners: [] as RunnerView[] })
const victoryTitle = computed(() => isPK.value
  ? view.value.result === 'draw' ? 'It’s a tie!' : view.value.result === 'alex' ? 'Alex wins!' : 'Steve wins!'
  : mode.value === 'duo' ? 'You both made it!' : 'You made the leap!')
const levelLabel = computed(() => activeCustom.value ? 'MY' : String(view.value.level).padStart(2, '0'))
const featuredCourses = [...Array.from({ length: 25 }, (_, index) => index + 1), 28, 30]
function courseInfo(level: Level) {
  const vertical = level.layout === 'vertical'
  return { number: level.number, name: level.name, length: vertical ? Math.ceil(level.spawn.y - level.flag.y) : level.length, vertical }
}
const courseOptions = ref(featuredCourses.map(number => courseInfo(generateLevel(number))))
const timer = computed(() => `${String(Math.floor(view.value.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(view.value.elapsed % 60)).padStart(2, '0')}`)
const canvasLabel = computed(() => view.value.flight
  ? mode.value === 'duo' ? multiplayerGoal.value + ' Shared elytra flight. Steve uses up and right; Alex uses W and D. Hold lift to rise and release to descend.' : 'Steve elytra flight. Hold up or W to rise, right or D to boost. Release lift to descend.'
  : view.value.bonus ? 'Bonus skeleton fight. Steve attacks with K; Alex with F. Players have 20 hearts, arrows deal 2.5, and the stone sword deals 6. Defeat Skelly then reach the flag. ' + (mode.value === 'duo' ? multiplayerGoal.value : 'Reach the red flag.') : mode.value === 'duo' ? multiplayerGoal.value + ' Shared parkour map. Steve uses arrows, Alex uses WASD. ' + sprintHint.value + '. The camera smoothly fits both players.' : 'Steve parkour map. Use arrows or WASD to move, jump and crouch. ' + sprintHint.value + '.')
const sprintHint = computed(() => autoSprint.value ? 'Auto-sprint on · crouch to slow down' : 'Double-tap a direction to sprint')
const blocks = [
  { kind: 'grass', name: 'Grass', description: 'The surface of your floating islands.' },
  { kind: 'dirt', name: 'Dirt', description: 'The earthy foundation below the grass.' },
  { kind: 'stone', name: 'Stone', description: 'Half-height slabs travel sideways or up and down. Hop on and ride.' },
  { kind: 'wood', name: 'Wood', description: 'Tree trunks, growing above the clouds.' },
  { kind: 'leaf', name: 'Leaves', description: 'A little green for your sky-high adventure.' },
  { kind: 'netherrack', name: 'Netherrack', description: 'Red rocky landscapes in Nether courses 11–20.' },
  { kind: 'nether-brick', name: 'Nether brick', description: 'Fortress ledges and flight gates in the Nether.' },
  { kind: 'end-stone', name: 'End stone', description: 'Pale End islands and moving vertical slabs in the hardest courses, 21–25.' },
  { kind: 'purpur', name: 'Purpur', description: 'Purple End towers and narrow landings. Time your sprint jumps.' },
  { kind: 'ice', name: 'Ice', description: 'Slippery blue ice. Keep your momentum; crouch to brake. Try course 7.' },
  { kind: 'slime', name: 'Slime', description: 'Jump five blocks high from this bouncy block.' },
]
const selectedBlock = ref('slime')
const blockDescription = computed(() => view.value.flight && selectedBlock.value === 'stone' ? 'Stone gates. Steer clear while you glide.' : blocks.find(b => b.kind === selectedBlock.value)?.description)
let session: GameSession | null = null
let initialPositions: Partial<Record<CharacterId, number>> = {}
function freshSession(level: Level, gameMode: GameMode) {
  selectedItem.value = null; itemAim.value = null; itemMessage.value = ''; rewardMessage.value = ''; itemPlayer.value = 'steve'
  const cleanLevel = { ...level, blocks: level.blocks.filter(b => !b.id.startsWith('shop-scaffold-')).map(b => ({ ...b })) }
  const created = createSession(cleanLevel, gameMode, multiplayerMode.value, { random: Math.random, skins: playerSkins.value })
  initialPositions = Object.fromEntries(created.runs.map(run => [run.id, run.state.player.x]))
  return created
}
let controls = new KeyboardControls('solo', autoSprint.value)
let renderer: Renderer | null = null
let frame = 0, previousTime = 0, accumulator = 0, noticeRemaining = 0
let resizeObserver: ResizeObserver | undefined
let pausedForHelp = false
const audio = new GameAudio()

function sync() {
  if (!session) return
  const first = session.runs[0]!, p = first.state.player
  const runners: RunnerView[] = session.runs.map(run => ({
    id: run.id, name: run.id === 'alex' ? 'Alex' : 'Steve', status: run.state.status,
    progress: run.state.status === 'won' ? 100 : session!.level.layout === 'vertical'
      ? Math.max(0, Math.min(99, (session!.level.spawn.y - run.state.player.y - run.state.player.height) / (session!.level.spawn.y - session!.level.flag.y) * 100))
      : Math.max(0, Math.min(100, ((run.state.player.x - (initialPositions[run.id] ?? session!.level.spawn.x)) / (session!.level.flag.x - (initialPositions[run.id] ?? session!.level.spawn.x))) * 100)),
    checkpoint: run.checkpoint ? (session!.level.checkpoints ?? []).findIndex(cp => cp.id === run.checkpoint!.id) + 1 : 0,
    deaths: run.deaths, hearts: run.state.combat?.hearts ?? 20, horse: Boolean(run.state.player.horse),
  }))
  view.value = { status: session.status, level: session.level.number, length: courseInfo(session.level).length, name: session.level.name, subtitle: session.level.subtitle, elapsed: session.elapsed,
    progress: session.status === 'won' ? 100 : (isPK.value ? Math.max : Math.min)(...runners.map(run => run.progress)), slime: p.groundKind === 'slime', deathReason: first.state.deathReason ?? '', mode: session.level.kind === 'elytra' ? p.vx > 6 ? 'boost' : 'glide' : p.climbing ? 'climb' : p.sneaking ? 'sneak' : p.horse ? 'ride' : p.sprinting ? 'sprint' : 'walk',
    checkpoint: runners[0]!.checkpoint, checkpointTotal: session.level.checkpoints?.length ?? 0, flight: session.level.kind === 'elytra', nether: session.level.theme === 'nether', end: session.level.theme === 'end', vertical: session.level.layout === 'vertical', bonus: Boolean(session.level.bonus), skeletonHearts: session.combat?.skeleton.hearts ?? 0, result: session.result, runners }
}
function clearInput() { controls.clear() }
function walletTransaction(transform: (current: Wallet) => Wallet): boolean {
  if (walletError.value) return false
  try {
    const next = transform(readWallet(localStorage))
    saveWallet(localStorage, next); wallet.value = next
    return true
  } catch (error) { itemMessage.value = shopMessage.value = (error as Error).message; return false }
}
function buy(id: ItemId) {
  if (walletTransaction(current => buyItem(current, id))) shopMessage.value = `${SHOP.find(item => item.id === id)!.name} added to your bag!`
}
function openShop() {
  if (screen.value === 'shop') return
  shopReturn = screen.value; resumeAfterShop = session?.status === 'playing' && screen.value === 'game'
  if (resumeAfterShop) { session!.status = 'paused'; sync() }
  selectedItem.value = null; itemAim.value = null; clearInput(); shopMessage.value = ''; screen.value = 'shop'
  void nextTick(() => window.scrollTo(0, 0))
}
async function closeShop() {
  screen.value = shopReturn
  if (resumeAfterShop && session?.status === 'paused') { startSession(session); sync() }
  resumeAfterShop = false
  await nextTick(); if (screen.value === 'game') { renderer?.resize(); focusGame() }
}
function finishReward() {
  if (!session || session.level.number <= 0) { rewardMessage.value = 'Custom level complete! Numbered courses earn coins.'; return }
  let earned = 0
  if (walletTransaction(current => { const award = awardLevel(current, session!.level.number); earned = award.earned; return award.wallet }))
    rewardMessage.value = earned ? `+${earned} coins! Your first finish on level ${session.level.number}.` : 'You already earned this level’s coins. Try a new course!'
  else rewardMessage.value = walletError.value || shopMessage.value || 'Could not save your coin reward.'
}
function cancelItem() { selectedItem.value = null; itemAim.value = null; clearInput() }
function equipItem(id: ItemId) {
  clearInput(); itemMessage.value = ''
  if (walletError.value || wallet.value.inventory[id] < 1) { itemMessage.value = walletError.value || 'Your bag is empty. Visit the shop!'; return }
  if (id === 'potion') { useItem(id); return }
  selectedItem.value = selectedItem.value === id ? null : id; itemAim.value = null
}
function useItem(id: ItemId, target?: ItemTarget) {
  if (!session) return
  const effect = prepareItem(session, itemPlayer.value, id, target)
  if ('error' in effect) { itemMessage.value = effect.error; return }
  if (!walletTransaction(current => consumeItem(current, id))) return
  effect.apply(); itemMessage.value = id === 'scaffolding' ? 'Scaffolding placed!' : id === 'teleport' ? 'Teleported! Pearl used.' : 'Potion used. Up to 6 hearts restored!'
  cancelItem(); resetCameras(); sync(); focusGame()
}
function moveItemAim(event: PointerEvent) {
  if (selectedItem.value && renderer) itemAim.value = snappedTarget(selectedItem.value, renderer.worldPoint(event.clientX, event.clientY))
}
function canvasClick(event: PointerEvent) {
  if (selectedItem.value && renderer) { event.preventDefault(); useItem(selectedItem.value, renderer.worldPoint(event.clientX, event.clientY)) }
  else focusGame()
}
function setSkin(id: CharacterId, skin: SkinId) {
  playerSkins.value[id] = skin; localStorage.setItem(`skybound.skin.${id}`, skin)
  const run = session?.runs.find(run => run.id === id)
  if (run) run.state.player.skin = skin
  sync()
}
function focusGame() { canvas.value?.focus({ preventScroll: true }) }
function resetCameras() { renderer?.resetCamera() }
async function loadLevel(number: number) {
  activeCustom.value = null
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
  if (!featuredCourses.includes(number)) courseOptions.value.push(courseInfo(level))
  sync(); loading.value = false
}
function chooseCourse(event: Event) { void loadLevel(Number((event.target as HTMLSelectElement).value)) }
async function setMode(value: GameMode) {
  if (mode.value === value || !session || loading.value) return
  mode.value = value; controls = new KeyboardControls(value, autoSprint.value)
  session = freshSession(session.level, value); attempts.value = 1; checkpointNotice.value = ''; resetCameras(); sync()
  await nextTick(); renderer?.resize()
}
function setMultiplayerMode(value: MultiplayerMode) {
  if (multiplayerMode.value === value || !session || loading.value) return
  multiplayerMode.value = value
  localStorage.setItem('skybound.multiplayerMode', value)
  clearInput(); session = freshSession(session.level, mode.value)
  attempts.value = 1; checkpointNotice.value = ''; noticeRemaining = 0; resetCameras(); sync()
}
function play() {
  if (!session || loading.value || helpOpen.value) return
  const ready = session.status === 'ready'
  startSession(session); if (ready) audio.play('start')
  sync(); focusGame()
}
function retry() {
  if (!session) return
  if (isPK.value && session.status === 'won') { restartCourse(); return }
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
async function nextLevel() { if (activeCustom.value) { returnToEditor(); return }; if (view.value.level < 1000) { await loadLevel(view.value.level + 1); play() } }
function goMenu() { cancelItem(); clearInput(); if (session?.status === 'playing') session.status = 'paused'; screen.value = 'menu'; sync() }
async function enterGame(value: GameMode) {
  clearInput(); if (session?.level.number === 0) await loadLevel(1)
  await setMode(value); screen.value = 'game'; await nextTick(); renderer?.resize(); resetCameras(); focusGame()
}
function editLevel(level?: CustomLevel) {
  clearInput(); if (session?.status === 'playing') session.status = 'paused'
  if (level) editorDraft.value = clone(level)
  else if (!editorDraft.value) editorDraft.value = newLevel()
  saveMessage.value = ''; screen.value = 'editor'
}
function returnToEditor() { editLevel(); activeCustom.value = null }
function updateDraft(level: CustomLevel) { editorDraft.value = level; saveMessage.value = '' }
function persist(levels: CustomLevel[]) {
  if (libraryError.value) { saveMessage.value = libraryError.value; return false }
  try { saveLibrary(localStorage, levels); myLevels.value = levels; return true }
  catch (error) { saveMessage.value = (error as Error).message.includes('grid') ? (error as Error).message : 'Could not save. Your browser storage may be full. Your level is still open in the editor.'; return false }
}
function saveCustom(level: CustomLevel) {
  const saved = { ...clone(level), name: level.name.trim(), updated: Date.now() }
  const levels = myLevels.value.filter(item => item.id !== saved.id); levels.unshift(saved)
  if (persist(levels)) { editorDraft.value = saved; saveMessage.value = 'Level saved! Find it in My levels.' }
}
async function testCustom(level: CustomLevel, value: GameMode = 'solo') {
  if (loading.value) { saveMessage.value = 'The game is getting ready. Try again in a moment.'; return }
  try {
    const problems = playabilityIssues(level)
    if (problems.length) { editLevel(level); saveMessage.value = problems.join(' '); return }
    editorDraft.value = clone(level); activeCustom.value = level.id; mode.value = value
    controls = new KeyboardControls(value, autoSprint.value); session = freshSession(compileLevel(level), value)
    attempts.value = 1; checkpointNotice.value = ''; loading.value = false; sync(); screen.value = 'game'
    await nextTick(); renderer?.resize(); resetCameras(); focusGame()
  } catch (error) { saveMessage.value = (error as Error).message }
}
function duplicateCustom(level: CustomLevel) {
  const copy = { ...clone(level), id: crypto.randomUUID(), name: `${level.name.slice(0, 50)} (copy)`, updated: Date.now() }
  if (persist([copy, ...myLevels.value])) editLevel(copy)
}
function removeCustom(level: CustomLevel) { if (persist(myLevels.value.filter(l => l.id !== level.id))) removedLevel.value = level }
function restoreCustom() { if (removedLevel.value && persist([removedLevel.value, ...myLevels.value])) removedLevel.value = null }
function openMyLevels() { clearInput(); if (session?.status === 'playing') session.status = 'paused'; screen.value = 'levels'; saveMessage.value = ''; void nextTick(() => window.scrollTo(0, 0)) }
function openHelp() { pausedForHelp = session?.status === 'playing'; if (pausedForHelp) pause(); helpOpen.value = true; clearInput() }
function closeHelp() { helpOpen.value = false; if (pausedForHelp && session?.status === 'paused') { startSession(session); sync() }; pausedForHelp = false; focusGame() }
function toggleAutoSprint() {
  autoSprint.value = !autoSprint.value
  controls.setAutoSprint(autoSprint.value)
  localStorage.setItem('skybound.autoSprint', String(autoSprint.value))
  focusGame()
}
function toggleSound() { sound.value = !sound.value; audio.enabled = sound.value; if (sound.value) audio.play('start') }
function keydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) return
  if (event.code === 'Escape') { if (helpOpen.value) { event.preventDefault(); closeHelp() } else if (screen.value === 'shop') { event.preventDefault(); void closeShop() } else if (selectedItem.value) { event.preventDefault(); cancelItem() } else if (screen.value === 'game') { event.preventDefault(); pause() }; return }
  if (helpOpen.value || loading.value || screen.value !== 'game') return
  if (selectedItem.value) return
  if (event.code === 'KeyR' && !event.repeat) { event.preventDefault(); retry(); return }
  if (event.code === 'Space') { if (event.target === canvas.value) event.preventDefault(); return }
  const actor = controls.press(event.code, event.repeat, performance.now())
  if (!actor) return
  event.preventDefault(); if (session?.status === 'ready') play()
}
function keyup(event: KeyboardEvent) { controls.release(event.code) }
function touch(action: string, event: PointerEvent, down: boolean) {
  event.preventDefault()
  const code = ({ left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', sneak: 'ArrowDown', attack: 'KeyK' } as Record<string, string>)[action]!
  if (down) { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); controls.press(code); if (session?.status === 'ready') play() }
  else controls.release(code)
}
function blur() { clearInput(); if (session?.status === 'playing') { session.status = 'paused'; sync() } }
function animate(now: number) {
  const delta = previousTime ? Math.min((now - previousTime) / 1000, .1) : 0
  previousTime = now; accumulator += delta
  if (noticeRemaining > 0) { noticeRemaining -= delta; if (noticeRemaining <= 0) checkpointNotice.value = '' }
  if (session && screen.value === 'game') {
    const oldStatus = session.status
    const before = session.runs.map(run => ({ id: run.id, jumps: run.state.jumps, deaths: run.deaths, slime: run.state.player.groundKind === 'slime', checkpoint: run.checkpoint?.id }))
    if (selectedItem.value) accumulator = 0
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
      cancelItem(); finishReward()
      audio.play('win'); clearInput(); if (!activeCustom.value) { highestLevel.value = Math.max(highestLevel.value, Math.min(1000, session.level.number + 1))
      localStorage.setItem('skybound.highest', String(highestLevel.value)) }
    }
    const steve = session.runs[0]!
    const aim = selectedItem.value && itemAim.value ? { ...itemAim.value, block: selectedItem.value === 'scaffolding', valid: !('error' in prepareItem(session, itemPlayer.value, selectedItem.value, itemAim.value)) } : undefined
    renderer?.draw(steve.state, now, { character: 'steve', companions: session.runs.filter(run => run.id !== 'steve'), checkpointId: steve.checkpoint?.id, worldTime: session.time, active: session.status === 'playing' && !selectedItem.value, combat: session.combat, itemTarget: aim })
    sync()
  } else accumulator = 0
  frame = requestAnimationFrame(animate)
}
onMounted(async () => {
  renderer = new Renderer(canvas.value!)
  resizeObserver = new ResizeObserver(() => renderer?.resize())
  resizeObserver.observe(canvas.value!)
  try { await renderer.load() } catch { loadError.value = 'Some block textures could not load. Refresh to try again.' }
  renderer.resize(); await loadLevel(1); frame = requestAnimationFrame(animate)
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur)
})
onUnmounted(() => { cancelAnimationFrame(frame); resizeObserver?.disconnect(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur) })
</script>

<template>
  <div :class="['site-shell', { 'menu-shell': screen === 'menu' }]">
    <HomeMenu v-if="screen === 'menu'" :loading="loading" :coins="wallet.coins" @shop="openShop" @singleplayer="enterGame('solo')" @multiplayer="enterGame('duo')" @editor="editLevel()" @levels="openMyLevels" @help="openHelp" />
    <header v-show="screen !== 'menu'" class="site-header">
      <a class="brand" href="#" @click.prevent="goMenu" aria-label="Skybound home"><span class="brand-cube"><img src="/textures/grass.png" alt="" /></span>skybound<span class="brand-dot">.</span></a>
      <nav aria-label="Main navigation"><button @click="goMenu">Main menu</button><button class="coin-nav" @click="openShop">● {{ wallet.coins }} coins · Shop</button><button @click="openHelp">How to play <Icon name="arrow" :size="13" /></button></nav>
      <div class="header-right"><span class="little-label"><span class="status-dot"></span>A little escape, above the clouds</span><button class="sound-button" @click="toggleSound" :aria-label="sound ? 'Mute sound' : 'Enable sound'" :title="sound ? 'Mute sound' : 'Enable sound'"><Icon :name="sound ? 'sound' : 'muted'" :size="19" /></button></div>
    </header>

    <ShopPanel v-if="screen === 'shop'" :wallet="wallet" :error="walletError" :message="shopMessage" @buy="buy" @back="closeShop" />
    <LevelEditor v-if="screen === 'editor' && editorDraft" :initial="editorDraft" :save-message="saveMessage" :ready="!loading" :keyboard-enabled="!helpOpen" @change="updateDraft" @save="saveCustom" @test="testCustom" @back="goMenu" />
    <section v-if="screen === 'levels'" class="library-page" aria-label="My levels"><div class="builder-heading"><div><span class="eyebrow">ADVENTURES MADE BY YOU</span><h1>My levels<span>.</span></h1><p>Build it. Save it. Jump into it.</p></div><button class="primary-button" @click="editorDraft = newLevel(); editLevel()">+ Create a level</button></div><p v-if="libraryError || saveMessage" role="alert">{{ libraryError || saveMessage }}</p><div v-if="removedLevel" class="library-undo" role="status">{{ removedLevel.name }} removed.<button class="text-button" @click="restoreCustom">Undo remove</button></div><div v-if="!myLevels.length" class="library-empty"><span>✎</span><h2>Your first adventure starts with a block.</h2><p>No saved levels yet. Open the editor and make something fun.</p><button class="primary-button" @click="editLevel()">Open level editor →</button></div><div v-else class="level-library"><article v-for="level in myLevels" :key="level.id" class="custom-level-card"><div :class="['level-miniature', level.theme]"><span>⚑</span><img :src="`/textures/${level.theme === 'nether' ? 'netherrack' : level.theme === 'end' ? 'end-stone' : 'grass'}.png`" alt="" /></div><div class="custom-level-details"><span class="eyebrow">{{ level.theme }} · {{ level.length }} BLOCKS</span><h2>{{ level.name }}</h2><p>{{ level.blocks.length }} blocks · {{ level.ladders.length }} ladders · {{ level.paint.length }} drawn pixels</p><div class="library-actions"><button class="primary-button" @click="testCustom(level)">Play solo</button><button class="secondary-button" @click="testCustom(level, 'duo')">Play multiplayer</button><button class="secondary-button" @click="editLevel(level)">Edit</button><button class="text-button" @click="duplicateCustom(level)">Duplicate</button><button class="text-button" @click="removeCustom(level)">Remove</button></div></div></article></div><p class="editor-footnote">Your levels are saved on this browser.</p><button class="secondary-button" @click="goMenu">← Main menu</button></section>
    <main v-show="screen === 'game'" id="play">
      <div v-if="activeCustom" class="custom-playbar"><span>Playing your creation</span><button class="secondary-button" @click="returnToEditor">← Back to editor</button><button class="text-button" @click="openMyLevels">My levels</button></div>
      <section class="intro-row">
        <div><div class="eyebrow"><span class="tiny-spark">✦</span> THE SKY IS YOUR PLAYGROUND</div><h1>One block at a time<span>.</span></h1><p>A little courage. A good jump. A whole world above the clouds.</p></div>
        <div class="adventure-badge"><Icon name="leaf" :size="17" /><span>Small blocks.<br /><strong>Big adventures.</strong></span></div>
      </section>

      <div class="play-options"><div class="play-settings"><div class="mode-toggle" aria-label="Game mode"><button :class="{ active: mode === 'solo' }" :aria-pressed="mode === 'solo'" @click="setMode('solo')" :disabled="loading">Solo adventure</button><button :class="{ active: mode === 'duo' }" :aria-pressed="mode === 'duo'" @click="setMode('duo')" :disabled="loading">Two players</button></div><button class="auto-sprint-toggle" role="switch" :aria-checked="autoSprint" aria-label="Auto sprint" :title="view.flight ? 'Auto-sprint applies to parkour courses. Flight uses lift and boost.' : 'Sprint whenever either player moves; crouch to slow down.'" @click="toggleAutoSprint"><span class="switch-track" aria-hidden="true"><span></span></span><span>Auto sprint <strong>{{ autoSprint ? 'On' : 'Off' }}</strong></span></button></div><span>{{ mode === 'duo' ? isPK ? 'Local PK · first to the flag wins' : 'Local teamwork · reach the flag together' : view.flight ? 'Elytra flight · hold ↑ to lift, → for speed' : sprintHint }}</span></div>
      <div v-if="mode === 'duo'" class="multiplayer-options"><div class="mode-toggle" role="group" aria-label="Multiplayer mode"><button :class="{ active: multiplayerMode === 'teamwork' }" :aria-pressed="multiplayerMode === 'teamwork'" @click="setMultiplayerMode('teamwork')" :disabled="loading">Teamwork</button><button :class="['pk', { active: multiplayerMode === 'pk' }]" :aria-pressed="multiplayerMode === 'pk'" @click="setMultiplayerMode('pk')" :disabled="loading">PK race</button></div><span>{{ multiplayerGoal }}</span></div>
      <section class="appearance-panel" aria-label="Player skins">
        <SkinPicker :model-value="playerSkins.steve" label="Steve" @update:model-value="setSkin('steve', $event)" />
        <SkinPicker v-if="mode === 'duo'" :model-value="playerSkins.alex" label="Alex" @update:model-value="setSkin('alex', $event)" />
        <p class="horse-hint">Rare ride: 5% chance per player each course · Horse jumps 2.5 blocks and runs 30% faster than sprinting.</p>
        <p v-if="view.runners.some(run => run.horse)" class="horse-notice" role="status">🐴 {{ view.runners.filter(run => run.horse).map(run => run.name).join(' & ') }} {{ view.flight ? 'rolled a horse! It waits in the stable during elytra flight.' : 'got a horse! Use your usual movement and jump keys. Crouch to slow down.' }}</p>
      </section>
      <section class="item-bag" aria-label="Your item bag">
        <div class="bag-heading"><strong>Your bag</strong><span>● {{ wallet.coins }} coins</span><button class="text-button" @click="openShop">Open shop →</button><label v-if="mode === 'duo'">Use as <select v-model="itemPlayer" @change="cancelItem"><option value="steve">Steve</option><option value="alex">Alex</option></select></label></div>
        <div class="bag-items"><button v-for="item in SHOP" :key="item.id" :aria-pressed="selectedItem === item.id" :disabled="!!walletError || wallet.inventory[item.id] < 1 || !['ready','playing','paused'].includes(view.status)" @click="equipItem(item.id)">{{ item.icon }} {{ item.name }} ×{{ wallet.inventory[item.id] }}</button><button v-if="selectedItem" class="text-button" @click="cancelItem">Cancel (Esc)</button></div>
        <p v-if="selectedItem" class="item-aim-hint">{{ selectedItem === 'scaffolding' ? 'Click an empty square within 4 blocks to place scaffolding.' : 'Click the top of a safe platform within 10 blocks to teleport. In flight, click a clear point.' }} Time pauses while you aim. Green is valid; red keeps your item.</p>
        <p v-if="walletError || itemMessage" class="item-feedback" role="status">{{ walletError || itemMessage }}</p>
      </section>
      <section :class="['game-card', { flight: view.flight, nether: view.nether, end: view.end }]" aria-label="Skybound game">
        <div class="game-topbar">
          <div class="level-info course-picker"><span class="level-number">{{ levelLabel }}</span><div><span class="level-kicker">{{ activeCustom ? 'CUSTOM' : view.bonus ? 'BONUS' : view.flight ? 'ELYTRA' : view.nether ? 'NETHER' : view.end ? 'END' : 'LEVEL' }} {{ levelLabel }} <span>·</span> {{ view.length }} {{ view.vertical ? 'BLOCK CLIMB' : 'BLOCKS' }}</span><h2>{{ view.name }} <Icon name="chevron" :size="12" /></h2></div><select v-if="!activeCustom" :value="view.level" @change="chooseCourse" aria-label="Choose a course" title="Choose a course" :disabled="loading"><option v-for="course in courseOptions" :key="course.number" :value="course.number">{{ String(course.number).padStart(2, '0') }} / {{ course.name }} · {{ course.length }} {{ course.vertical ? 'blocks up' : 'blocks' }}</option></select></div>
          <div class="game-actions"><span class="timer" aria-label="Time played"><Icon name="clock" :size="16" />{{ timer }}</span><span class="toolbar-divider"></span><button class="icon-button" @click="restartCourse" aria-label="Restart course" title="Restart course from the beginning" :disabled="loading"><Icon name="reset" :size="18" /></button><button class="icon-button" @click="pause" :aria-label="view.status === 'paused' ? 'Resume game' : 'Pause game'" title="Pause / resume (Esc)" :disabled="!['playing', 'paused'].includes(view.status)"><Icon :name="view.status === 'paused' ? 'play' : 'pause'" :size="18" /></button></div>
        </div>

        <div class="canvas-wrap">
          <div class="player-viewport"><div v-if="mode === 'duo' && !view.bonus" class="shared-labels"><span class="pane-label steve"><span></span>STEVE <span class="pane-keys">{{ view.flight ? '↑ →' : '↑ ↓ ← →' }}</span></span><span class="pane-label alex"><span></span>ALEX <span class="pane-keys">{{ view.flight ? 'W D' : 'W A S D' }}</span></span></div><canvas ref="canvas" tabindex="0" :aria-label="canvasLabel" :class="{ 'aiming-item': selectedItem }" @pointerdown="canvasClick" @pointermove="moveItemAim" @pointerleave="itemAim = null"></canvas><div v-if="mode === 'duo' && view.status === 'playing'" class="runner-messages"><template v-for="run in view.runners" :key="run.id"><div v-if="run.status === 'dead'" class="runner-message">{{ run.name }} is respawning{{ run.checkpoint ? ` at checkpoint ${run.checkpoint}` : ' at the start' }}…</div><div v-else-if="run.status === 'won' && !isPK" class="runner-message finished"><Icon name="check" :size="15" />{{ run.name }} reached the flag. Waiting for {{ run.id === 'steve' ? 'Alex' : 'Steve' }}!</div></template></div></div>
          <div v-if="!view.bonus" :class="['stage-tag', { 'duo-hint': mode === 'duo' }]"><span class="status-dot"></span>{{ view.status === 'ready' ? mode === 'duo' ? multiplayerGoal : view.subtitle : view.status === 'playing' ? view.flight ? 'Hold ↑ to lift. Release to descend. → boosts speed.' : view.slime ? 'Slime underfoot. Jump 5 blocks!' : view.mode === 'climb' ? 'Climbing. Hold ↑ / W up, ↓ / S down.' : view.mode === 'sneak' ? 'Slow steps. Safe edges.' : view.mode === 'ride' ? 'Horse ride! Jump 2.5 blocks. Crouch to slow down.' : view.mode === 'sprint' ? 'Pick up speed. Jump the gap!' : 'Keep going. You’ve got this.' : view.status === 'won' ? victoryTitle : view.status === 'dead' ? 'Every fall is a fresh start.' : 'Take a little breather.' }}</div>
          <div v-if="checkpointNotice" class="checkpoint-notice"><Icon name="flag" :size="13" />{{ checkpointNotice }}</div>
          <div v-if="loading" class="game-overlay"><div class="overlay-card"><span class="loading-cube"></span><h3>Building your little adventure…</h3></div></div>
          <div v-else-if="['dead', 'won', 'paused'].includes(view.status)" class="game-overlay">
            <div class="overlay-card" :class="view.status">
              <span class="overlay-symbol"><Icon :name="view.status === 'won' ? 'flag' : view.status === 'dead' ? 'reset' : 'pause'" :size="30" /></span>
              <span class="eyebrow">{{ view.status === 'won' ? 'FLAG FOUND. FEELING GOOD.' : view.status === 'dead' ? 'A LITTLE BUMP IN THE ADVENTURE' : 'NO RUSH. THE SKY CAN WAIT.' }}</span>
              <h3>{{ view.status === 'won' ? victoryTitle : view.status === 'dead' ? 'Let’s try that again.' : 'Taking a breather?' }}</h3>
              <p>{{ view.status === 'won' ? isPK ? `Race finished in ${timer}. Want a rematch?` : activeCustom ? `Your level cleared in ${timer}! Ready to keep building?` : `Level ${view.level} cleared in ${timer}. Ready for the next course?` : view.status === 'dead' ? view.flight ? 'Fly between the gates. Hold ↑ to lift; release to descend.' : view.deathReason === 'arrow' ? 'Your hearts ran out. Dodge the arrows and get close for a sword hit!' : view.deathReason === 'spike' ? 'Those spikes are sharp. Jump over them!' : 'Mind the gaps — it’s a long way down.' : 'Your adventure is right where you left it.' }}</p>
              <button class="primary-button" @click="view.status === 'won' ? view.level === 1000 ? retry() : nextLevel() : view.status === 'dead' ? retry() : play()">{{ view.status === 'won' ? activeCustom ? 'Back to editor' : view.level === 1000 ? 'Play again' : 'Next adventure' : view.status === 'dead' ? view.checkpoint ? 'Back to checkpoint' : 'Try again' : 'Keep going' }}<Icon :name="view.status === 'dead' ? 'reset' : 'right'" :size="18" /></button>
              <button v-if="view.status === 'won' && isPK" class="text-button rematch-button" @click="restartCourse">Race again</button>
              <span v-if="view.status === 'dead'" class="overlay-footnote">Attempt {{ attempts }} · {{ view.checkpoint ? `Checkpoint ${view.checkpoint} saved` : 'Press R to try again' }}</span>
            </div>
          </div>
          <div v-if="view.status === 'ready' && !loading" class="start-prompt"><div><span class="start-star">✦</span><span>{{ mode === 'duo' ? isPK ? 'Race from the same line. First to the flag wins!' : 'A little adventure, together.' : 'Your adventure starts here.' }}</span></div><button class="primary-button" @click="play">{{ isPK ? 'Start race' : view.flight ? 'Let’s fly' : 'Let’s jump' }} <Icon name="right" :size="17" /></button></div>
          <div v-else-if="view.status === 'playing'" class="in-game-hint"><span v-if="view.bonus">{{ view.skeletonHearts > 0 ? `Skelly: ${view.skeletonHearts}/15 hearts · Get close and attack!` : 'Skelly defeated! Head for the red flag.' }}</span><span v-else-if="view.flight">Hold ↑{{ mode === 'duo' ? ' / W' : '' }} to lift · →{{ mode === 'duo' ? ' / D' : '' }} to boost · release to descend</span><span v-else-if="view.nether">↑ / W climb up · ↓ / S climb down · {{ sprintHint }}</span><span v-else-if="view.slime">✦ A little extra bounce. Press ↑{{ mode === 'solo' ? ' or W' : '' }}.</span><span v-else>{{ sprintHint }} <span class="hint-dot">·</span> ↑{{ mode === 'duo' ? ' / W' : '' }} jump <span class="hint-dot">·</span> ↓{{ mode === 'duo' ? ' / S' : '' }} crouch</span></div>
          <div class="course-length"><Icon name="flag" :size="14" /><span>{{ view.length }} {{ view.vertical ? 'blocks to climb' : 'blocks of possibility' }}</span></div>
        </div>

        <div class="game-bottom-bar"><div class="course-progress"><Icon name="flag" :size="15" /><div class="progress-track"><div :style="{ width: `${view.progress}%` }"></div></div><span>{{ Math.floor(view.progress) }}%</span></div><div v-if="mode === 'duo'" class="runner-progress"><span v-for="run in view.runners" :key="run.id" :class="run.id">{{ run.name }} {{ run.status === 'won' ? '✓' : `${Math.floor(run.progress)}%` }}<small v-if="run.checkpoint"> · CP {{ run.checkpoint }}</small></span></div><span v-else class="attempt-label">{{ view.status === 'won' ? 'Nicely done, adventurer.' : `Attempt ${String(attempts).padStart(2, '0')}` }}<span v-if="view.checkpointTotal"> · CP {{ view.checkpoint }} / {{ view.checkpointTotal }}</span></span><span v-if="mode === 'solo'" class="jump-status"><span :class="{ 'slime-dot': view.slime }" class="status-dot"></span>{{ view.flight ? view.mode === 'boost' ? 'Elytra · boosted flight' : 'Elytra · gliding' : view.slime ? '5-block slime jump' : view.mode === 'climb' ? 'Climbing · ↑ up / ↓ down' : view.mode === 'sneak' ? 'Sneaking · safe edges' : view.mode === 'ride' ? 'Horse · 2.5-block jump · 8.45 blocks/s' : view.mode === 'sprint' ? 'Sprinting · 4-block gaps' : 'Walking · 1.2-block jump' }}</span></div>
        <div v-if="loadError" class="asset-error" role="alert">{{ loadError }}</div>
      </section>

      <div v-if="mode === 'solo' && !view.flight" class="touch-controls" aria-label="Touch controls"><div><button aria-label="Move left; double-tap to sprint" @pointerdown="touch('left', $event, true)" @pointerup="touch('left', $event, false)" @pointercancel="touch('left', $event, false)">←</button><button aria-label="Move right; double-tap to sprint" @pointerdown="touch('right', $event, true)" @pointerup="touch('right', $event, false)" @pointercancel="touch('right', $event, false)">→</button></div><button aria-label="Crouch" @pointerdown="touch('sneak', $event, true)" @pointerup="touch('sneak', $event, false)" @pointercancel="touch('sneak', $event, false)">↓</button><button class="touch-jump" aria-label="Jump" @pointerdown="touch('jump', $event, true)" @pointerup="touch('jump', $event, false)" @pointercancel="touch('jump', $event, false)">↑ <span>Jump</span></button></div>
      <div v-if="view.flight && mode === 'solo'" class="flight-controls"><span>Glide through the gates.</span><button @pointerdown="touch('jump', $event, true)" @pointerup="touch('jump', $event, false)" @pointercancel="touch('jump', $event, false)" aria-label="Hold to fly upward">↑ <span>Hold to lift</span></button><button @pointerdown="touch('right', $event, true)" @pointerup="touch('right', $event, false)" @pointercancel="touch('right', $event, false)" aria-label="Hold to fly faster">→ <span>Hold to boost</span></button><span>Release lift to descend.</span></div>
      <p v-if="rewardMessage" class="coin-reward" role="status">● {{ rewardMessage }}</p>
      <div v-if="view.bonus" class="bonus-guide" role="status"><strong>{{ view.skeletonHearts > 0 ? `Skelly · ${view.skeletonHearts}/15 hearts` : 'Skelly defeated · flag unlocked' }}</strong><span>Stone sword: <kbd>K</kbd> Steve{{ mode === 'duo' ? ' · F Alex' : ' (or F)' }} · 6 hearts per hit</span><span><template v-for="run in view.runners" :key="run.id">{{ run.name }}: {{ run.hearts }}/20 hearts · </template>Arrows: 2.5 hearts + 0.75-block knockback</span><button v-if="mode === 'solo'" class="bonus-attack" aria-label="Attack with stone sword" @pointerdown="touch('attack', $event, true)" @pointerup="touch('attack', $event, false)" @pointercancel="touch('attack', $event, false)">Swing sword</button></div>
      <div v-if="view.checkpointTotal" class="checkpoint-help"><Icon name="flag" :size="14" /><span>{{ view.checkpointTotal }} cyan checkpoints on this course. {{ view.flight ? 'Fly through a ring' : 'Land beside a flag' }} to save your place{{ mode === 'duo' ? ' — each player saves separately' : '' }}. R retries from your saved flag.</span></div>

      <section class="field-notes" aria-label="Game guide">
        <article class="note controls-note"><div class="note-heading"><span>01 / BRING A FRIEND ALONG</span><Icon name="arrow" :size="15" /></div><h3>{{ mode === 'duo' ? 'Steve & Alex. Same sky.' : view.flight ? 'Spread your wings.' : 'Walk. Sprint. Crouch.' }}</h3><div class="key-groups"><div><div class="keys"><kbd>↑</kbd><kbd v-if="!view.flight">←</kbd><kbd v-if="!view.flight">↓</kbd><kbd>→</kbd></div><span class="key-caption">Steve · {{ view.flight ? '↑ lift · → speed' : 'Arrow keys' }}</span></div><div><div class="keys"><kbd>W</kbd><kbd v-if="!view.flight">A</kbd><kbd v-if="!view.flight">S</kbd><kbd>D</kbd></div><span class="key-caption">{{ mode === 'duo' ? view.flight ? 'Alex · W lift · D speed' : 'Alex · WASD' : 'Or WASD in solo' }}</span></div></div><div v-if="view.flight" class="modifier-keys"><span>Hold lift to rise. Release to descend.</span></div><div v-else class="modifier-keys"><span>{{ sprintHint }}</span><span><kbd>↓ / S</kbd> crouch</span></div></article>
        <article class="note blocks-note"><div class="note-heading"><span>02 / YOUR LITTLE WORLD</span><span class="pixel-square"></span></div><h3>Meet the building blocks.</h3><div class="block-list"><button v-for="block in blocks" :key="block.kind" :class="['block-choice', { selected: selectedBlock === block.kind }]" @click="selectedBlock = block.kind" :aria-pressed="selectedBlock === block.kind" :title="view.flight && block.kind === 'stone' ? 'Stone gates are flight obstacles.' : block.description"><span :class="['block-thumb', block.kind]"><img v-if="!['wood', 'leaf'].includes(block.kind)" :src="`/textures/${block.kind}.png`" alt="" /></span><span>{{ block.name }}</span></button></div><p class="block-description">{{ blockDescription }}</p></article>
        <article class="note goal-note"><div class="note-heading"><span>03 / EYES ON THE PRIZE</span><Icon name="flag" :size="16" /></div><div class="goal-heading"><h3>Follow the red flag.</h3><span class="mini-flag">⚑</span></div><p>{{ mode === 'duo' ? multiplayerGoal : view.flight ? 'Glide between the gates.' : 'Sprint across gaps up to 4 blocks.' }}<br />{{ view.flight ? 'Watch the gates. Keep your wings clear.' : 'Every 10th course is an elytra flight.' }}</p><button class="text-button" @click="openHelp">A few tips for the trip <Icon name="right" :size="14" /></button></article>
      </section>
      <footer><span>A blocky little escape. Made for the joy of the jump.</span><span><span class="status-dot"></span>{{ apiConnected ? 'Adventure service connected' : 'Playing locally' }} <span class="footer-dot">·</span> {{ highestLevel > 1 ? `Best adventure: level ${highestLevel - 1}` : 'Your next adventure is waiting.' }}</span></footer>
    </main>

    <div v-if="helpOpen" class="modal-backdrop" @click.self="closeHelp"><section class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button class="modal-close icon-button" @click="closeHelp" aria-label="Close how to play"><Icon name="close" /></button><span class="eyebrow">A FIELD GUIDE FOR LITTLE ADVENTURERS</span><h2 id="help-title">A few tips before you leap.</h2><p class="help-intro">{{ mode === 'duo' ? multiplayerGoal : 'Your only job? Get Steve to the red flag.' }}</p><div class="help-row"><span>01</span><div><h3>Walk, then jump.</h3><p>Steve uses ← / → to move, ↑ to jump, and ↓ to crouch. In two-player mode Alex uses A / D to move, W to jump, and S to crouch. In solo, either set of keys controls Steve. Normal jumps rise 1.2 blocks. Double-tap and hold left or right to sprint, or turn on Auto sprint beside the mode buttons. It works for both players and touch controls; crouching slows you down. Normal sprint jumps clear gaps up to four blocks. Each player has a 5% chance of getting a horse when a course starts. It normally jumps 2.5 blocks, with the usual five-block boost on slime, and runs at 8.45 blocks per second (130% of sprint speed). Crouch to slow down, and use the usual ladder controls. Retrying keeps your horse; restarting a course rolls again. During elytra levels it waits in the stable. Choose Steve, Alex, Dream or Skeppy above the game; each player can pick their own skin.</p></div></div><div class="help-row"><span>02</span><div><h3>Slime gives you a little lift.</h3><p>Stand on a green slime block and jump to reach five blocks high. Use it to reach the higher islands. Nether courses 11–19 zigzag upward through red landscapes and brick fortresses. Course 20 is a Nether flight. End courses 21–25 are the toughest: every gap is 3.5–4 blocks wide, with tiny landings and End-stone slabs moving up and down. Wait for a good height before jumping onto or off a slab. Stand at a ladder and hold ↑ / W to climb up, or ↓ / S to climb down. Release the keys to hang on; move sideways to leave. Blue ice keeps you sliding after you release a direction. Crouch to brake, and try Frostline crossing (course 7).</p></div></div><div class="help-row"><span>03</span><div><h3>Catch a ride. Mind your landing.</h3><p>Stone slabs carry you sideways or up and down. Hold ↓ for Steve or S for Alex to crouch: move slowly and stay safely on platform edges. You can still jump while crouching. Spikes and falling end that player’s attempt. In co-op they respawn while their friend keeps going.</p></div></div><div class="help-row"><span>04</span><div><h3>Every tenth course, take flight.</h3><p>Levels 10, 20, 30, and every following multiple of 10 are elytra flights. Steve glides forward automatically: hold ↑ to rise, hold → to fly faster, and release ↑ to descend. In co-op, Alex uses W to rise and D to boost. Fly between the gates and stay inside the flight corridor.</p></div></div><div class="help-row"><span>05</span><div><h3>Leave the world as you found it.</h3><p>Checkpoints start at course 9. Land beside a cyan flag to save your place, or fly through the rings in elytra courses. Each Nether ledge has a checkpoint. R retries from saved checkpoints; the reset button starts the whole course again. In Teamwork, both players must finish. In PK race, the first player to the flag wins; a finish on the same moment is a tie. Both racers start at the same line. Race again restarts the full course. Switch modes below the Two players button; switching starts a fresh course. The shared map smoothly zooms in when you meet and out when you separate. Choose a course from the level title. Esc pauses both players. Shop scaffolding is the block you can place while playing. Earn 5 coins for levels 1–5, 8 for 6–10, 11 for 11–15, and 3 more every five levels. Only the first completion of each numbered level pays. Open the coin shop from the menu or game header. Buy scaffolding for 2 coins per block, a one-use 10-block teleport pearl for 8 coins, or a healing potion for 5. Pick an item in Your bag, then click a clear square to build or a safe platform top to teleport. Time pauses while aiming; Esc cancels. Potions restore up to 6 hearts in Bonus fights. Multiplayer shares the coin wallet and bag; choose who uses an item. Scaffolding stays on retry but clears when you restart the course. Used items are spent. Coins and unused items are saved in this browser. From the main menu, open Level editor to build your own course. Pick blocks, moving slabs, ladders or trees, and drag the drawing brush to make your own solid or dangerous obstacles. Place Start and Finish above safe platforms. Save to My levels, or use Test level and Back to editor to keep building.</p></div></div><div class="help-row"><span>06</span><div><h3>Bonus levels: meet Skelly.</h3><p>Courses 8, 18, 28 and every course ending in 8 include a skeleton around the middle of the route. It stays still, faces the nearest player, and shoots arrows at walking speed. You have 20 hearts shown above you; each arrow takes 2.5 and pushes you back 0.75 blocks. Get close, face Skelly and hold K for Steve or F for Alex to swing your stone sword. In solo, either key works. Each hit takes 6 of Skelly’s 15 hearts: three hits win the fight. Defeat it before finishing at the flag. Both multiplayer modes share the skeleton; swords only hit Skelly. R restores your hearts and keeps the fight’s progress; Restart course resets the whole fight.</p></div></div><button class="primary-button" @click="closeHelp">Got it. Let’s go <Icon name="right" :size="18" /></button></section></div>
  </div>
</template>
