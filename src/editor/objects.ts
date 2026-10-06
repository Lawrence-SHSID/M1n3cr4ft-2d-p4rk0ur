import { clone, type CustomLevel } from './levels'

type Point = { x: number; y: number }
type Bounds = Point & { width: number; height: number }
export interface EditorSelection { kind: 'block' | 'tree' | 'ladder' | 'spike' | 'checkpoint' | 'spawn' | 'flag' | 'paint'; keys: string[] }
const paintKey = (p: Point) => `${p.x}/${p.y}`
const inside = (p: Point, b: Bounds) => p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height

/** Preserve old tall ladders as independently editable one-block tiles. */
export function oneBlockLadders(level: CustomLevel): CustomLevel {
  const d = clone(level)
  d.ladders = d.ladders.flatMap(l => Array.from({ length: Math.ceil(l.height) }, (_, i) => ({
    ...l, id: i === 0 ? l.id : `${l.id}/tile/${i}`, y: l.y + Math.min(i, l.height - 1), height: 1,
  })))
  return d
}
export function objectAt(d: CustomLevel, p: Point): EditorSelection | null {
  if (d.flagPlaced !== false && inside(p, { x: d.flag.x - .1, y: d.flag.y - 1.6, width: .9, height: 1.6 })) return { kind: 'flag', keys: ['flag'] }
  if (d.spawnPlaced !== false && inside(p, { x: d.spawn.x, y: d.spawn.y - 1.25, width: .48, height: 1.25 })) return { kind: 'spawn', keys: ['spawn'] }
  const checkpoint = d.checkpoints.find(c => inside(p, { x: c.x - .1, y: c.y - 1.3, width: .7, height: 1.3 }))
  if (checkpoint) return { kind: 'checkpoint', keys: [checkpoint.id] }
  const pixel = d.paint.find(c => inside(p, { ...c, width: .25, height: .25 }))
  if (pixel) {
    const cells = new Map(d.paint.filter(c => c.color === pixel.color && c.lethal === pixel.lethal).map(c => [paintKey(c), c]))
    const keys = new Set([paintKey(pixel)]), queue = [pixel]
    for (let i = 0; i < queue.length; i++) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const key = paintKey({ x: queue[i]!.x + dx / 4, y: queue[i]!.y + dy / 4 }), cell = cells.get(key)
      if (cell && !keys.has(key)) { keys.add(key); queue.push(cell) }
    }
    return { kind: 'paint', keys: [...keys] }
  }
  const spike = d.spikes.findIndex(s => inside(p, { x: s.x, y: s.y - .4, width: 1, height: .4 }))
  if (spike >= 0) return { kind: 'spike', keys: [String(spike)] }
  const ladder = [...d.ladders].reverse().find(l => inside(p, { ...l, width: l.width ?? 1, height: l.height }))
  if (ladder) return { kind: 'ladder', keys: [ladder.id] }
  const b = [...d.blocks].reverse().find(b => inside(p, { ...b, width: b.width ?? 1, height: b.height ?? 1 }))
  if (!b) return null
  const group = b.id.startsWith('tree/') ? b.id.split('/').slice(0, 2).join('/') + '/' : null
  return group ? { kind: 'tree', keys: d.blocks.filter(b => b.id.startsWith(group)).map(b => b.id) } : { kind: 'block', keys: [b.id] }
}
export function selectionBounds(d: CustomLevel, s: EditorSelection | null): Bounds | null {
  if (!s) return null
  const keys = new Set(s.keys)
  let boxes: Bounds[] = []
  switch (s.kind) {
    case 'tree': case 'block': boxes = d.blocks.filter(b => keys.has(b.id)).map(b => ({ ...b, width: b.width ?? 1, height: b.height ?? 1 })); break
    case 'ladder': boxes = d.ladders.filter(l => keys.has(l.id)).map(l => ({ ...l, width: l.width ?? 1, height: l.height })); break
    case 'spike': boxes = d.spikes.filter((_, i) => keys.has(String(i))).map(p => ({ x: p.x, y: p.y - .4, width: 1, height: .4 })); break
    case 'checkpoint': boxes = d.checkpoints.filter(c => keys.has(c.id)).map(c => ({ x: c.x - .1, y: c.y - 1.3, width: .7, height: 1.3 })); break
    case 'paint': boxes = d.paint.filter(c => keys.has(paintKey(c))).map(c => ({ ...c, width: .25, height: .25 })); break
    case 'spawn': boxes = [{ x: d.spawn.x, y: d.spawn.y - 1.25, width: .48, height: 1.25 }]; break
    case 'flag': boxes = [{ x: d.flag.x - .1, y: d.flag.y - 1.6, width: .9, height: 1.6 }]; break
  }
  if (!boxes.length) return null
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y))
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y }
}
/** Move from the drag's original snapshot, preserving sizes, group shapes and motion. */
export function moveObject(level: CustomLevel, selection: EditorSelection, dx: number, dy: number): { level: CustomLevel; selection: EditorSelection } {
  const d = clone(level), s = clone(selection), bounds = selectionBounds(d, s)
  if (!bounds) return { level: d, selection: s }
  const step = s.kind === 'paint' ? .25 : 1
  const clamp = (n: number, lower: number, upper: number) => Math.max(Math.ceil(lower / step) * step, Math.min(Math.floor(upper / step) * step, Math.round(n / step) * step))
  dx = clamp(dx, -bounds.x, d.length - bounds.x - bounds.width)
  dy = clamp(dy, -bounds.y, 14 - bounds.y - bounds.height)
  const keys = new Set(s.keys), shift = (p: Point) => { p.x += dx; p.y += dy }
  switch (s.kind) {
    case 'tree': case 'block': d.blocks.filter(b => keys.has(b.id)).forEach(shift); break
    case 'ladder': d.ladders.filter(l => keys.has(l.id)).forEach(shift); break
    case 'spike': d.spikes.filter((_, i) => keys.has(String(i))).forEach(shift); break
    case 'checkpoint': d.checkpoints.filter(c => keys.has(c.id)).forEach(shift); break
    case 'spawn': shift(d.spawn); break
    case 'flag': shift(d.flag); break
    case 'paint': {
      const moved = d.paint.filter(c => keys.has(paintKey(c))); moved.forEach(shift)
      s.keys = moved.map(paintKey)
      const destinations = new Set(s.keys)
      d.paint = [...d.paint.filter(c => !moved.includes(c) && !destinations.has(paintKey(c))), ...moved]
      break
    }
  }
  return { level: d, selection: s }
}
export function deleteObjectAt(level: CustomLevel, point: Point): CustomLevel {
  const d = clone(level), s = objectAt(d, point)
  if (!s) return d
  const keys = new Set(s.keys)
  switch (s.kind) {
    case 'tree': case 'block': d.blocks = d.blocks.filter(b => !keys.has(b.id)); break
    case 'ladder': d.ladders = d.ladders.filter(l => !keys.has(l.id)); break
    case 'spike': d.spikes = d.spikes.filter((_, i) => !keys.has(String(i))); break
    case 'checkpoint': d.checkpoints = d.checkpoints.filter(c => !keys.has(c.id)); break
    case 'spawn': d.spawnPlaced = false; break
    case 'flag': d.flagPlaced = false; break
    // Deleting drawings erases the touched pixel, while selecting moves the shape.
    case 'paint': d.paint = d.paint.filter(c => !inside(point, { ...c, width: .25, height: .25 })); break
  }
  return d
}
