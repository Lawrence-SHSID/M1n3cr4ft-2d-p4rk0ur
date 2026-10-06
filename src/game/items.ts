import type { CharacterId, GameSession, Player } from '../../shared/types'
import type { ItemId } from './economy'
import { blockPosition, blockSize, PHYSICS } from './physics'
import { FLIGHT } from './flight'

export interface ItemTarget { x: number; y: number }
type Rect = ItemTarget & { width: number; height: number }
const overlaps = (a: Rect, b: Rect) => a.x + a.width > b.x + 1e-7 && a.x < b.x + b.width - 1e-7
  && a.y + a.height > b.y + 1e-7 && a.y < b.y + b.height - 1e-7
const center = (p: Player) => ({ x: p.x + p.width / 2, y: p.y + p.height / 2 })
export function snappedTarget(item: ItemId, target: ItemTarget): ItemTarget {
  return item === 'scaffolding' ? { x: Math.floor(target.x), y: Math.floor(target.y) }
    : { x: Math.round(target.x * 4) / 4, y: Math.round(target.y * 4) / 4 }
}
/** Validated, deferred effects let the UI save consumption before changing the world. */
export function prepareItem(session: GameSession, id: CharacterId, item: ItemId, target?: ItemTarget): { error: string } | { apply: () => void } {
  const run = session.runs.find(run => run.id === id)
  if (!run || !['ready', 'playing', 'paused'].includes(session.status) || !['ready', 'playing', 'paused'].includes(run.state.status))
    return { error: 'Use an item while your player is alive on the course.' }
  const state = run.state, p = state.player, flying = session.level.kind === 'elytra'
  if (item === 'potion') {
    if (!state.combat) return { error: 'Healing potions are for bonus skeleton fights.' }
    if (state.combat.hearts >= 20) return { error: 'Your hearts are already full. Keep the potion for later!' }
    return { apply: () => { state.combat!.hearts = Math.min(20, state.combat!.hearts + 6) } }
  }
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return { error: 'Choose a spot on the map.' }
  const spot = snappedTarget(item, target), origin = center(p)
  const walls = session.level.blocks.filter(b => b.solid).map(b => ({ ...blockPosition(b, session.time), ...blockSize(b) }))
  const hazards = [...session.level.spikes.map(s => ({ x: s.x + .08, y: s.y - .38, width: .84, height: .38 })), ...(session.level.hazards ?? [])]
  const width = session.level.width ?? session.level.length
  if (item === 'scaffolding') {
    if (flying) return { error: 'Scaffolding is for parkour courses. Use a teleport pearl in flight.' }
    const rect = { ...spot, width: 1, height: 1 }
    if (spot.x < 0 || spot.x + 1 > width || spot.y < Math.min(session.level.flag.y, session.level.spawn.y) - 6 || spot.y >= PHYSICS.voidY)
      return { error: 'Place scaffolding inside the course.' }
    if (Math.hypot(spot.x + .5 - origin.x, spot.y + .5 - origin.y) > 4) return { error: 'Scaffolding must be within 4 blocks of your player.' }
    if (walls.some(w => overlaps(rect, w)) || hazards.some(h => overlaps(rect, h))
      || session.runs.some(r => r.state.status !== 'dead' && overlaps(rect, r.state.player))
      || session.combat && session.combat.skeleton.hearts > 0 && overlaps(rect, session.combat.skeleton))
      return { error: 'That spot is occupied. Choose an empty square.' }
    return { apply: () => {
      session.level.blocks.push({ id: `shop-scaffold-${session.time}-${session.level.blocks.length}`, ...spot, width: 1, height: 1, kind: 'scaffolding', solid: true })
    } }
  }
  // A clicked teleport point marks the center of the player's feet, not their head.
  if (!flying) {
    const landing = walls.filter(w => Math.abs(w.y - spot.y) <= .25
      && spot.x + p.width / 2 > w.x && spot.x - p.width / 2 < w.x + w.width)
      .sort((a, b) => Math.abs(a.y - spot.y) - Math.abs(b.y - spot.y))[0]
    if (landing) spot.y = landing.y
  }
  const rect = { x: spot.x - p.width / 2, y: spot.y - p.height, width: p.width, height: p.height }
  if (Math.hypot(spot.x - origin.x, spot.y - (p.y + p.height)) > 10 + 1e-7) return { error: 'Teleport range is 10 blocks. Choose a closer spot.' }
  if (Math.hypot(rect.x - p.x, rect.y - p.y) < .1) return { error: 'You are already there. Choose another spot.' }
  if (rect.x < 0 || rect.x + rect.width > width || rect.y + rect.height > PHYSICS.voidY
    || walls.some(w => overlaps(rect, w)) || hazards.some(h => overlaps(rect, h))
    || session.combat && session.combat.skeleton.hearts > 0 && overlaps(rect, session.combat.skeleton))
    return { error: 'That landing is blocked or dangerous. Choose a clear spot.' }
  const floor = walls.find(w => Math.abs(w.y - spot.y) < .01 && rect.x + rect.width > w.x + 1e-7 && rect.x < w.x + w.width - 1e-7)
  if (!flying && !floor) return { error: 'Click the top of a platform for a safe landing.' }
  if (flying && (rect.y <= (session.level.flight?.ceiling ?? 0) || spot.y >= (session.level.flight?.floor ?? 16)))
    return { error: 'Choose a spot inside the flight corridor.' }
  return { apply: () => {
    p.x = rect.x; p.y = rect.y; p.vx = flying ? FLIGHT.speed : 0; p.vy = 0
    p.climbing = false; p.iceMomentum = false; p.grounded = Boolean(floor) && !flying
    const supporting = session.level.blocks.find(b => b.solid && Math.abs(blockPosition(b, session.time).y - spot.y) < .01
      && rect.x + rect.width > blockPosition(b, session.time).x && rect.x < blockPosition(b, session.time).x + blockSize(b).width)
    p.groundId = flying ? null : supporting?.id ?? null; p.groundKind = flying ? null : supporting?.kind ?? null
    state.coyote = p.grounded ? PHYSICS.coyoteTime : 0; state.jumpBuffer = 0; state.jumpWasPressed = false
    if (state.combat) state.combat.knockbackRemaining = 0
  } }
}
