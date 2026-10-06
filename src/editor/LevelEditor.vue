<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Block, BlockKind } from '../../shared/types'
import { clone, MATERIALS, playabilityIssues, type CustomLevel } from './levels'
import { deleteObjectAt, moveObject, objectAt, oneBlockLadders, selectionBounds, type EditorSelection } from './objects'

const props = defineProps<{ initial: CustomLevel; saveMessage: string; ready: boolean; keyboardEnabled?: boolean }>()
const emit = defineEmits<{ save: [level: CustomLevel]; test: [level: CustomLevel]; change: [level: CustomLevel]; back: [] }>()
const draft = ref(oneBlockLadders(props.initial)), tool = ref('grass'), zoom = ref(36), notice = ref('')
const range = ref(1.5), speed = ref(1), slabWidth = ref(2)
const color = ref('#e85858'), lethal = ref(true), selected = ref('')
const selection = ref<EditorSelection | null>(null), dragging = ref(false)
const selectedBounds = computed(() => selectionBounds(draft.value, selection.value))
const undoStack = ref<CustomLevel[]>([]), redoStack = ref<CustomLevel[]>([])
let painting = false, last: { x: number; y: number } | null = null, painted = new Set<string>()
let gesture: 'place' | 'delete' | 'move' | null = null, gestureRemembered = false
let dragStart: { x: number; y: number } | null = null, dragLevel: CustomLevel | null = null, dragSelection: EditorSelection | null = null
const names: Record<string, string> = { grass: 'Grass', dirt: 'Dirt', stone: 'Stone', slime: 'Slime', ice: 'Ice', netherrack: 'Netherrack', 'nether-brick': 'Nether brick', 'end-stone': 'End stone', purpur: 'Purpur', wood: 'Wood', leaf: 'Leaves', horizontal: 'Sideways slab', vertical: 'Up/down slab', ladder: 'Ladder', tree: 'Tree', spike: 'Spikes', spawn: 'Start', flag: 'Finish', checkpoint: 'Checkpoint', draw: 'Draw obstacle', erase: 'Eraser', select: 'Select' }
const sections = [
  { name: 'Blocks', tools: [...MATERIALS, 'horizontal', 'vertical'] },
  { name: 'Obstacles', tools: ['spike', 'draw'] },
  { name: 'Objects', tools: ['ladder', 'tree', 'spawn', 'flag', 'checkpoint'] },
  { name: 'Tools', tools: ['select', 'erase'] },
]
const currentBlock = computed(() => draft.value.blocks.find(b => b.id === selected.value))
const currentLadder = computed(() => draft.value.ladders.find(l => l.id === selected.value))
const issues = computed(() => { try { return playabilityIssues(draft.value) } catch (e) { return [(e as Error).message] } })
watch(draft, () => { notice.value = ''; emit('change', clone(draft.value)) }, { deep: true })
function remember() { undoStack.value.push(clone(draft.value)); if (undoStack.value.length > 50) undoStack.value.shift(); redoStack.value = [] }
function clearSelection() { selected.value = ''; selection.value = null }
function undo() { up(); const old = undoStack.value.pop(); if (old) { redoStack.value.push(clone(draft.value)); draft.value = old; clearSelection() } }
function redo() { up(); const old = redoStack.value.pop(); if (old) { undoStack.value.push(clone(draft.value)); draft.value = old; clearSelection() } }
function shortcuts(event: KeyboardEvent) {
  if (props.keyboardEnabled === false || !(event.ctrlKey || event.metaKey) || event.altKey
    || (event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')) return
  const key = event.key.toLowerCase()
  if (key !== 'z' && key !== 'y') return
  event.preventDefault(); if (event.repeat) return
  key === 'y' || event.shiftKey ? redo() : undo()
}
onMounted(() => window.addEventListener('keydown', shortcuts))
onUnmounted(() => window.removeEventListener('keydown', shortcuts))
function texture(kind: string) { return `/textures/${kind}.png` }
function chooseTool(value: string) { up(); tool.value = value; clearSelection(); notice.value = '' }
function resizeLength(event: Event) {
  const input = event.target as HTMLInputElement, value = Math.round(Number(input.value))
  const d = draft.value
  if (value < 16 || value > 100 || d.blocks.some(b => b.x + (b.width ?? 1) > value) || d.paint.some(c => c.x >= value)
    || [...d.ladders, ...d.spikes, ...d.checkpoints, d.spawn, d.flag].some(p => p.x >= value)) {
    notice.value = 'Keep the course wide enough for everything you have placed.'; input.value = String(d.length); return
  }
  remember(); d.length = value
}
function editName(event: Event) { remember(); draft.value.name = (event.target as HTMLInputElement).value.slice(0, 60) }
function editTheme(event: Event) { remember(); draft.value.theme = (event.target as HTMLSelectElement).value as CustomLevel['theme'] }
function applySettings() {
  remember()
  const b = currentBlock.value
  if (b?.motion) { b.motion.range = range.value; b.motion.speed = speed.value; b.width = Math.min(slabWidth.value, draft.value.length - b.x) }
}
function location(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement, rect = svg.getBoundingClientRect()
  return { x: Math.max(0, Math.min(draft.value.length - .001, (event.clientX - rect.left) / rect.width * draft.value.length)),
    y: Math.max(0, Math.min(13.999, (event.clientY - rect.top) / rect.height * 14)) }
}
function pick(x: number, y: number) {
  selection.value = objectAt(draft.value, { x, y })
  selected.value = selection.value?.keys[0] ?? ''
  const b = currentBlock.value
  if (b?.motion) { range.value = b.motion.range; speed.value = b.motion.speed; slabWidth.value = b.width ?? 2 }
  notice.value = selection.value ? `Selected ${selection.value.kind}. Drag it to move.` : 'Click an object, then drag it to move.'
}
function erase(x: number, y: number) {
  if (!objectAt(draft.value, { x, y })) return
  if (!gestureRemembered) { remember(); gestureRemembered = true }
  draft.value = deleteObjectAt(draft.value, { x, y }); clearSelection()
}
function place(point: { x: number; y: number }) {
  const d = draft.value, x = Math.floor(point.x), y = Math.floor(point.y)
  const key = tool.value === 'draw' || tool.value === 'erase' ? `${Math.floor(point.x * 4)}/${Math.floor(point.y * 4)}` : `${x}/${y}`
  if (painted.has(key)) return
  painted.add(key)
  if (tool.value === 'select') { pick(point.x, point.y); return }
  if (tool.value === 'erase') { erase(point.x, point.y); return }
  if (tool.value === 'draw') {
    const px = Math.floor(point.x * 4) / 4, py = Math.floor(point.y * 4) / 4
    if (d.paint.length >= 4000) { notice.value = 'Drawing is full. Erase some pixels to add more.'; return }
    d.paint = d.paint.filter(c => c.x !== px || c.y !== py); d.paint.push({ x: px, y: py, color: color.value, lethal: lethal.value }); return
  }
  if (tool.value === 'spawn' || tool.value === 'flag') { d[tool.value] = { x: x + .25, y: y + 1 }; d[tool.value === 'spawn' ? 'spawnPlaced' : 'flagPlaced'] = true; return }
  if (tool.value === 'checkpoint') { d.checkpoints = d.checkpoints.filter(c => Math.floor(c.x) !== x); d.checkpoints.push({ id: crypto.randomUUID(), x: x + .25, y: y + 1 }); return }
  if (tool.value === 'spike') { if (!d.spikes.some(s => s.x === x && s.y === y + 1)) d.spikes.push({ x, y: y + 1 }); return }
  if (tool.value === 'ladder') {
    if (d.ladders.some(l => l.x === x && l.y === y)) return
    d.ladders.push({ id: crypto.randomUUID(), x, y, height: 1 }); return
  }
  if (tool.value === 'tree') {
    if (d.blocks.length > 3990) { notice.value = 'Make room for the tree by erasing a few blocks.'; return }
    if (x < 1 || x > d.length - 2 || y < 4) { notice.value = 'Give the tree space: 3 blocks wide and 5 blocks tall.'; return }
    const id = `tree/${crypto.randomUUID()}`
    for (let row = 0; row < 3; row++) d.blocks.push({ id: `${id}/wood/${row}`, x, y: y - row, kind: 'wood', solid: false })
    for (const [dx, dy] of [[-1, -2], [0, -2], [1, -2], [-1, -3], [0, -3], [1, -3], [0, -4]])
      d.blocks.push({ id: `${id}/leaf/${dx}/${dy}`, x: x + dx!, y: y + dy!, kind: 'leaf', solid: false })
    return
  }
  if (d.blocks.length >= 4000) { notice.value = 'This course is full. Erase a block to place another.'; return }
  const moving = tool.value === 'horizontal' || tool.value === 'vertical'
  const width = moving ? slabWidth.value : 1, height = moving ? .5 : 1
  if (x + width > d.length || y + height > 14) return
  if (d.blocks.some(b => b.x === x && b.y === y && b.solid)) return
  const block: Block = { id: crypto.randomUUID(), x, y, kind: moving ? 'stone' : tool.value as BlockKind, solid: true, width, height }
  if (moving) block.motion = { axis: tool.value === 'horizontal' ? 'x' : 'y', range: range.value, speed: speed.value, phase: 0 }
  d.blocks.push(block)
}
function down(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 2) return
  event.preventDefault(); const svg = event.currentTarget as SVGSVGElement; svg.focus({ preventScroll: true }); svg.setPointerCapture(event.pointerId)
  painting = true; painted.clear(); last = location(event); gestureRemembered = false
  if (event.button === 2 || tool.value === 'erase') { gesture = 'delete'; erase(last.x, last.y); return }
  if (tool.value === 'select') {
    gesture = 'move'; pick(last.x, last.y); dragStart = last; dragLevel = clone(draft.value); dragSelection = selection.value ? clone(selection.value) : null; return
  }
  gesture = 'place'; remember(); gestureRemembered = true; place(last)
}
function move(event: PointerEvent) {
  if (!painting || !last) return
  if (gesture === 'move') {
    if (!dragLevel || !dragStart || !dragSelection) return
    const point = location(event), moved = moveObject(dragLevel, dragSelection, point.x - dragStart.x, point.y - dragStart.y)
    if (!gestureRemembered && JSON.stringify(moved.level) !== JSON.stringify(dragLevel)) { remember(); gestureRemembered = true }
    if (gestureRemembered) { draft.value = moved.level; selection.value = moved.selection; selected.value = moved.selection.keys[0] ?? ''; dragging.value = true }
    return
  }
  if (gesture !== 'delete' && ['tree', 'spawn', 'flag', 'checkpoint', 'horizontal', 'vertical'].includes(tool.value)) return
  const point = location(event), steps = Math.ceil(Math.max(Math.abs(point.x - last.x), Math.abs(point.y - last.y)) * 8)
  for (let i = 1; i <= steps; i++) {
    const p = { x: last.x + (point.x - last.x) * i / steps, y: last.y + (point.y - last.y) * i / steps }
    if (gesture === 'delete') erase(p.x, p.y); else place(p)
  }
  last = point
}
function up() { painting = false; last = null; gesture = null; dragStart = null; dragLevel = null; dragSelection = null; dragging.value = false }
function save() { if (!draft.value.name.trim()) { notice.value = 'Give your adventure a name first.'; return }; emit('save', clone(draft.value)) }
function testLevel() { if (!issues.value.length) emit('test', clone(draft.value)); else notice.value = issues.value.join(' ') }
</script>

<template>
  <section class="editor-page" aria-label="Level editor">
    <div class="builder-heading"><div><span class="eyebrow">YOUR WORLD. YOUR RULES.</span><h1>Level editor<span>.</span></h1><p>Pick a tool. Click or drag to build. Then take your creation for a jump.</p></div><button class="secondary-button" @click="emit('back')">← Main menu</button></div>
    <div class="editor-toolbar">
      <label>Level name<input :value="draft.name" maxlength="60" @input="editName" /></label>
      <label>Dimension<select :value="draft.theme" @change="editTheme"><option value="overworld">Overworld</option><option value="nether">Nether</option><option value="end">End</option></select></label>
      <label>Course width<input type="number" min="16" max="100" :value="draft.length" @change="resizeLength" /></label>
      <div class="editor-actions"><button :class="['secondary-button', { 'select-active': tool === 'select' }]" :aria-pressed="tool === 'select'" @click="chooseTool('select')">↖ Select & move</button><button class="secondary-button" @click="undo" :disabled="!undoStack.length" title="Undo (Ctrl+Z)">Undo</button><button class="secondary-button" @click="redo" :disabled="!redoStack.length" title="Redo (Ctrl+Y)">Redo</button><button class="secondary-button" @click="save">Save level</button><button class="primary-button" @click="testLevel" :disabled="!props.ready">▶ Test level</button></div>
    </div>
    <div class="editor-layout">
      <aside class="tool-palette"><h2>Building tools</h2><div class="tool-sections"><section v-for="section in sections" :key="section.name" :aria-label="`${section.name} tools`"><h3>{{ section.name }}</h3><div class="tool-grid"><button v-for="item in section.tools" :key="item" :class="{ chosen: tool === item }" :aria-pressed="tool === item" @click="chooseTool(item)"><img v-if="MATERIALS.includes(item as BlockKind) && !['wood','leaf'].includes(item)" :src="texture(item)" alt=""/><span v-else-if="['wood','leaf'].includes(item)" :class="['block-thumb',item]" aria-hidden="true"></span><span v-else class="tool-symbol">{{ ({ horizontal:'↔',vertical:'↕',ladder:'▤',tree:'♣',spike:'▲',spawn:'S',flag:'⚑',checkpoint:'⚐',draw:'✎',erase:'⌫',select:'↖' } as Record<string,string>)[item] || '■' }}</span><span>{{ names[item] }}</span></button></div></section></div>
        <div v-if="['horizontal','vertical'].includes(tool) || currentBlock?.motion" class="tool-settings"><h3>Moving slab</h3><label>Width: {{ slabWidth }} blocks<input v-model.number="slabWidth" type="range" min="1" max="4" step=".5" /></label><label>Travel: {{ range }} blocks each way<input v-model.number="range" type="range" min=".25" max="4" step=".25" /></label><label>Speed: {{ speed }}<input v-model.number="speed" type="range" min=".2" max="3" step=".1" /></label><p>The dotted line shows its path.</p><button v-if="currentBlock?.motion" class="secondary-button" @click="applySettings">Apply to selected slab</button></div>
        <div v-if="tool === 'ladder' || currentLadder" class="tool-settings"><h3>One-block ladders</h3><p>Each ladder is 1 block tall. Click or drag to stack them into a longer climb.</p></div>
        <div v-if="tool === 'draw'" class="tool-settings"><h3>Your own obstacle</h3><label>Brush color<input v-model="color" type="color" /></label><label class="check-label"><input v-model="lethal" type="checkbox" />Dangerous on touch</label><p>{{ lethal ? 'Touching your drawing ends the attempt.' : 'Your drawing is solid: stand on it or jump over it.' }} Draw in the grid with the mouse or your finger.</p></div>
        <p class="tool-tip">{{ tool === 'tree' ? 'Left-click the bottom of the trunk. Trees are scenery.' : tool === 'spawn' || tool === 'flag' || tool === 'checkpoint' ? 'Left-click the empty square just above a solid platform.' : tool === 'select' ? 'Left-click and drag an object to move it. Trees and connected drawings move together.' : tool === 'erase' ? 'Drag to erase blocks or drawing pixels. Right-click deletes with any tool.' : 'Left-click to place. Drag to paint. Right-click to delete.' }}</p>
      </aside>
      <div class="editor-workspace"><div class="grid-heading"><span>{{ names[tool] }} selected · {{ draft.length }} × 14 blocks</span><label>Zoom<select v-model.number="zoom"><option :value="24">Small</option><option :value="36">Medium</option><option :value="48">Large</option></select></label></div>
        <div class="grid-scroll" tabindex="0" aria-label="Scrollable building grid">
          <svg :class="['building-grid', { 'is-select': tool === 'select', 'is-moving': dragging }]" tabindex="0" role="img" aria-label="Level building grid. Left-click to place, right-click to delete. Select and drag to move objects." :width="draft.length * zoom" :height="14 * zoom" :viewBox="`0 0 ${draft.length} 14`" @contextmenu.prevent @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up">
            <defs><pattern id="editor-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#64827c" stroke-opacity=".25" stroke-width=".025" /></pattern><pattern v-for="kind in MATERIALS.filter(k => !['wood','leaf'].includes(k))" :id="`tile-${kind}`" :key="kind" width="1" height="1" patternUnits="userSpaceOnUse"><image :href="texture(kind)" width="1" height="1" preserveAspectRatio="none" /></pattern><pattern v-for="kind in ['wood','leaf']" :id="`tile-${kind}`" :key="kind" width="1" height="1" patternUnits="userSpaceOnUse"><image href="/textures/tree.png" :x="-(kind === 'wood' ? 229 : 200)/28" :y="-(kind === 'wood' ? 216 : 157)/28" :width="938/28" :height="346/28" preserveAspectRatio="none" /></pattern></defs>
            <rect width="100%" height="100%" :fill="draft.theme === 'nether' ? '#3f2226' : draft.theme === 'end' ? '#51435f' : '#dceee5'"/><rect width="100%" height="100%" fill="url(#editor-grid)" />
            <g v-for="b in draft.blocks" :key="b.id"><line v-if="b.motion" :x1="b.x + (b.width ?? 1)/2 - (b.motion.axis === 'x' ? b.motion.range : 0)" :x2="b.x + (b.width ?? 1)/2 + (b.motion.axis === 'x' ? b.motion.range : 0)" :y1="b.y + .25 - (b.motion.axis === 'y' ? b.motion.range : 0)" :y2="b.y + .25 + (b.motion.axis === 'y' ? b.motion.range : 0)" stroke="#ebaf5a" stroke-width=".07" stroke-dasharray=".12 .12" /><rect :x="b.x" :y="b.y" :width="b.width ?? 1" :height="b.height ?? 1" :fill="b.color ?? `url(#tile-${b.kind})`" :stroke="selected === b.id ? '#ffc260' : 'none'" stroke-width=".08" /></g>
            <g v-for="l in draft.ladders" :key="l.id" stroke="#c28a49" stroke-width=".12"><line :x1="l.x+.15" :x2="l.x+.15" :y1="l.y" :y2="l.y+l.height"/><line :x1="l.x+.85" :x2="l.x+.85" :y1="l.y" :y2="l.y+l.height"/><line v-for="rung in Math.ceil(l.height*3)" :key="rung" :x1="l.x+.15" :x2="l.x+.85" :y1="l.y+(rung-.5)/3" :y2="l.y+(rung-.5)/3"/><rect v-if="selected === l.id" :x="l.x" :y="l.y" width="1" :height="l.height" fill="none" stroke="#ffc260" stroke-width=".06"/></g>
            <path v-for="(s,i) in draft.spikes" :key="`spike-${i}`" :d="`M${s.x+.05} ${s.y} l.15 -.4 .15 .4 .15 -.4 .15 .4 .15 -.4 .15 .4 Z`" fill="#c43f4c" />
            <rect v-for="c in draft.paint" :key="`${c.x}/${c.y}`" :x="c.x" :y="c.y" width=".25" height=".25" :fill="c.color" />
            <g v-for="cp in draft.checkpoints" :key="cp.id"><line :x1="cp.x" :x2="cp.x" :y1="cp.y" :y2="cp.y-1.3" stroke="#577966" stroke-width=".08"/><rect :x="cp.x" :y="cp.y-1.3" width=".6" height=".35" fill="#48c6c9"/></g>
            <g v-if="draft.spawnPlaced !== false" :transform="`translate(${draft.spawn.x}, ${draft.spawn.y})`"><rect x="0" y="-1.25" width=".48" height=".36" fill="#a87d60"/><rect x="0" y="-.89" width=".48" height=".5" fill="#37a4af"/><rect x="0" y="-.39" width=".2" height=".39" fill="#454d8d"/><rect x=".28" y="-.39" width=".2" height=".39" fill="#454d8d"/><text x=".24" y="-1.5" text-anchor="middle" font-size=".3" fill="#2d6048">START</text></g>
            <g v-if="draft.flagPlaced !== false" :transform="`translate(${draft.flag.x}, ${draft.flag.y})`"><line x1="0" y1="0" x2="0" y2="-1.6" stroke="#765945" stroke-width=".09"/><path d="M0 -1.6H.8L.65 -1.1H0Z" fill="#e45959"/><text x=".25" y="-1.85" text-anchor="middle" font-size=".3" fill="#c44848">FINISH</text></g>
            <rect v-if="selectedBounds" data-editor-selection="true" :x="selectedBounds.x" :y="selectedBounds.y" :width="selectedBounds.width" :height="selectedBounds.height" fill="none" stroke="#eea243" stroke-width=".08" stroke-dasharray=".14 .08" pointer-events="none" />
          </svg>
        </div><div class="builder-status" role="status">{{ notice || props.saveMessage || (issues.length ? issues.join(' ') : 'Start and finish are ready. Test your level whenever you like!') }}</div><p class="editor-footnote">Left-click: place · Right-click: delete · Select: drag to move · Ctrl+Z: undo · Ctrl+Y: redo. Each drag is one undo step. Levels are saved on this browser.</p>
      </div>
    </div>
  </section>
</template>
