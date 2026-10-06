import type { Block, BlockKind, Checkpoint, Ladder, Level, Spike } from '../../shared/types'

export const LIBRARY_KEY = 'skybound.myLevels.v1'
export const MATERIALS: BlockKind[] = ['grass', 'dirt', 'stone', 'slime', 'ice', 'netherrack', 'nether-brick', 'end-stone', 'purpur', 'wood', 'leaf']
export interface PaintCell { x: number; y: number; color: string; lethal: boolean }
export interface CustomLevel {
  version: 1; id: string; name: string; theme: 'overworld' | 'nether' | 'end'; length: number;
  blocks: Block[]; spikes: Spike[]; ladders: Ladder[]; checkpoints: Checkpoint[]; paint: PaintCell[];
  spawn: { x: number; y: number }; flag: { x: number; y: number }; updated: number;
  spawnPlaced?: boolean; flagPlaced?: boolean;
}
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
export function newLevel(): CustomLevel {
  const blocks: Block[] = []
  for (const [start, end] of [[0, 5], [7, 11], [14, 18], [20, 24]]) {
    for (let x = start!; x < end!; x++) {
      blocks.push({ id: `grass-${x}`, x, y: 10, kind: 'grass', solid: true },
        { id: `dirt-${x}`, x, y: 11, kind: 'dirt', solid: true })
    }
  }
  return { version: 1, id: crypto.randomUUID(), name: 'My sky adventure', theme: 'overworld', length: 24,
    blocks, spikes: [], ladders: [], checkpoints: [], paint: [], spawn: { x: 1, y: 10 }, flag: { x: 23, y: 10 }, updated: Date.now() }
}

/** Validate saved browser data before it can reach the physics engine. */
export function isCustomLevel(value: unknown): value is CustomLevel {
  if (!value || typeof value !== 'object') return false
  const d = value as CustomLevel
  const n = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
  const point = (p: unknown) => Boolean(p && typeof p === 'object' && n((p as { x: number }).x, 0, d.length) && n((p as { y: number }).y, 0, 14))
  const text = (s: unknown) => typeof s === 'string' && s.length > 0 && s.length <= 100
  const color = (s: unknown) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)
  if (d.version !== 1 || !text(d.id) || !text(d.name) || !['overworld', 'nether', 'end'].includes(d.theme)
    || !n(d.length, 16, 100) || !Number.isInteger(d.length) || !point(d.spawn) || !point(d.flag) || !n(d.updated, 0, Number.MAX_SAFE_INTEGER)) return false
  if ([d.spawnPlaced, d.flagPlaced].some(v => v !== undefined && typeof v !== 'boolean')) return false
  if (![d.blocks, d.spikes, d.ladders, d.checkpoints, d.paint].every(a => Array.isArray(a) && a.length <= 4000)) return false
  return d.blocks.every(b => point(b) && text(b.id) && MATERIALS.includes(b.kind) && typeof b.solid === 'boolean'
    && (b.width === undefined || n(b.width, .25, 8)) && (b.height === undefined || n(b.height, .25, 8))
    && b.x + (b.width ?? 1) <= d.length && b.y + (b.height ?? 1) <= 14
    && (b.color === undefined || color(b.color))
    && (!b.motion || (['x', 'y'].includes(b.motion.axis) && n(b.motion.range, .25, 4) && n(b.motion.speed, .2, 3) && n(b.motion.phase, 0, 7))))
    && d.spikes.every(point) && d.ladders.every(l => point(l) && text(l.id) && n(l.height, 1, 10) && l.y + l.height <= 14 && (l.width === undefined || n(l.width, .25, 2)))
    && d.checkpoints.every(c => point(c) && text(c.id))
    && d.paint.every(c => point(c) && c.x < d.length && c.y < 14 && Number.isInteger(c.x * 4) && Number.isInteger(c.y * 4) && color(c.color) && typeof c.lethal === 'boolean')
}
export function readLibrary(storage: Pick<Storage, 'getItem'>): { levels: CustomLevel[]; error: string } {
  try {
    const text = storage.getItem(LIBRARY_KEY)
    if (!text) return { levels: [], error: '' }
    const data: unknown = JSON.parse(text)
    if (!Array.isArray(data) || !data.every(isCustomLevel)) throw new Error('Invalid saved data')
    return { levels: data, error: '' }
  } catch { return { levels: [], error: 'Saved levels could not be read. Your browser data has been kept.' } }
}
export function saveLibrary(storage: Pick<Storage, 'setItem'>, levels: CustomLevel[]): void {
  if (!levels.every(isCustomLevel)) throw new Error('This level has something outside the building grid. Check its settings before saving.')
  storage.setItem(LIBRARY_KEY, JSON.stringify(levels))
}

/** Join adjacent painted pixels into collision rectangles without filling holes. */
function paintRectangles(cells: PaintCell[]) {
  const rows = new Map<string, PaintCell[]>()
  for (const c of cells) { const key = `${c.y}/${c.color}/${c.lethal}`; const row = rows.get(key) ?? []; row.push(c); rows.set(key, row) }
  const rectangles: { x: number; y: number; width: number; height: number; color: string; lethal: boolean }[] = []
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x)
    for (const c of row) {
      const last = rectangles.at(-1)
      if (last && last.y === c.y && last.color === c.color && last.lethal === c.lethal && Math.abs(last.x + last.width - c.x) < 1e-7) last.width += .25
      else rectangles.push({ ...c, width: .25, height: .25 })
    }
  }
  return rectangles
}
export function compileLevel(draft: CustomLevel): Level {
  if (!isCustomLevel(draft)) throw new Error('Check your level settings. Everything needs to fit inside the grid.')
  const d = clone(draft), drawn = paintRectangles(d.paint)
  return { number: 0, name: d.name, subtitle: 'Made by you. Find your way to the red flag.', length: d.length, theme: d.theme,
    kind: 'parkour', spawn: d.spawn, flag: d.flag, blocks: [...d.blocks, ...drawn.filter(c => !c.lethal).map((c, i): Block => ({
      id: `drawing-${i}`, x: c.x, y: c.y, width: c.width, height: c.height, color: c.color, kind: 'stone', solid: true }))],
    spikes: d.spikes, ladders: connectedLadders(d.ladders), checkpoints: d.checkpoints.sort((a, b) => a.x - b.x).map((c, i) => ({ ...c, progress: i + 1 })),
    hazards: drawn.filter(c => c.lethal).map(({ lethal: _, ...rect }) => rect) }
}
export function playabilityIssues(draft: CustomLevel): string[] {
  const level = compileLevel(draft)
  const issues: string[] = []
  if (draft.spawnPlaced === false) issues.push('Place a Start before testing your level.')
  if (draft.flagPlaced === false) issues.push('Place a Finish before testing your level.')
  if (Math.abs(level.spawn.x - level.flag.x) < 1) issues.push('Put Start and Finish at least one block apart.')
  for (const [name, point] of [['Start', level.spawn], ['Finish', level.flag]] as const) {
    const left = name === 'Start' ? point.x : point.x - .24
    if (!level.blocks.some(b => b.solid && !b.motion && left + .48 > b.x && left < b.x + (b.width ?? 1) && Math.abs(b.y - point.y) < .01))
      issues.push(`${name} needs a solid block underneath it.`)
    if (level.blocks.some(b => b.solid && left + .48 > b.x && left < b.x + (b.width ?? 1) && point.y > b.y && point.y - 1.25 < b.y + (b.height ?? 1)))
      issues.push(`${name} needs room for the player to stand.`)
    if (level.hazards?.some(h => left + .48 > h.x && left < h.x + h.width && point.y > h.y && point.y - 1.25 < h.y + h.height)
      || level.spikes.some(s => left + .48 > s.x && left < s.x + 1 && Math.abs(point.y - s.y) < .4))
      issues.push(`${name} is touching an obstacle. Move it somewhere safe.`)
  }
  return issues
}

/** Adjacent one-block ladder tiles form one continuous climbable run in play. */
function connectedLadders(ladders: Ladder[]): Ladder[] {
  const result: Ladder[] = []
  for (const l of [...ladders].sort((a, b) => a.x - b.x || a.y - b.y)) {
    const prior = result.at(-1)
    if (prior && prior.x === l.x && (prior.width ?? .84) === (l.width ?? .84) && l.y <= prior.y + prior.height + 1e-7)
      prior.height = Math.max(prior.y + prior.height, l.y + l.height) - prior.y
    else result.push({ ...l })
  }
  return result
}
